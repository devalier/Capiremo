// Main-thread side of on-device Whisper: decode + resample audio, talk to the worker.

import type { DeviceModel } from '../storage/store';
import type { AudioClip } from '../types';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void; onProgress?: (p: number) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<{ id: number; kind: string; text?: string; message?: string; progress?: number }>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    if (ev.data.kind === 'progress') return p.onProgress?.(ev.data.progress ?? 0);
    pending.delete(ev.data.id);
    if (ev.data.kind === 'done') p.resolve(ev.data.text ?? '');
    else p.reject(new Error(ev.data.message ?? 'recogniser error'));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'worker crashed'));
    pending.clear();
    worker = null;
  };
  return worker;
}

function send(msg: object, transfer: Transferable[] = [], onProgress?: (p: number) => void): Promise<string> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, base: import.meta.env.BASE_URL, ...msg }, transfer);
  });
}

/** Decode any recorded format the browser can play, downmix to mono, resample to 16 kHz. */
export async function toPcm16k(audio: AudioClip): Promise<Float32Array> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(audio.data.slice(0));
    const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
    const off = new OfflineAudioContext(1, frames, 16000);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}

export async function transcribeOnDevice(audio: AudioClip, model: DeviceModel): Promise<string> {
  const pcm = await toPcm16k(audio);
  return send({ kind: 'transcribe', model, audio: pcm }, [pcm.buffer]);
}

/** Download and initialise the model ahead of time, reporting progress 0–100. */
export function preloadModel(model: DeviceModel, onProgress: (p: number) => void): Promise<string> {
  return send({ kind: 'load', model }, [], onProgress);
}
