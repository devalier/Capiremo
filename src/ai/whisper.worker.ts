/// <reference lib="webworker" />
// On-device Whisper (transformers.js). Runs off the main thread. Receives 16 kHz mono PCM.
// Model files download once from huggingface.co and are cached by the browser.

import { env, pipeline } from '@huggingface/transformers';

type Req = { id: number; kind: 'load' | 'transcribe'; model: string; base: string; audio?: Float32Array };

let current: { model: string; run: Promise<(audio: Float32Array, opts: object) => Promise<unknown>> } | null = null;

function configure(base: string) {
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
  if (onnx.wasm) {
    // Self-hosted runtime (scripts/copy-ort.mjs). Same file choice transformers.js makes by default.
    const ua = navigator.userAgent;
    const safari = /Version\/(\d+)[\d.]* .*Safari/.exec(ua);
    const plain = safari && Number(safari[1]) < 26 && !('gpu' in navigator);
    const name = plain ? 'ort-wasm-simd-threaded' : 'ort-wasm-simd-threaded.asyncify';
    onnx.wasm.wasmPaths = { mjs: `${base}ort/${name}.mjs`, wasm: `${base}ort/${name}.wasm` };
    // No cross-origin isolation on static hosting → no SharedArrayBuffer → single thread.
    onnx.wasm.numThreads = 1;
  }
  env.allowLocalModels = false;
}

function load(model: string, id: number) {
  if (current?.model === model) return current.run;
  const run = pipeline('automatic-speech-recognition', `onnx-community/${model}`, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p) => {
      const info = p as { status: string; progress?: number; file?: string };
      if (info.status === 'progress' && typeof info.progress === 'number') {
        postMessage({ id, kind: 'progress', progress: info.progress, file: info.file ?? '' });
      }
    },
  }) as unknown as Promise<(audio: Float32Array, opts: object) => Promise<unknown>>;
  current = { model, run };
  run.catch(() => (current = null));
  return run;
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, kind, model, base, audio } = ev.data;
  try {
    configure(base);
    const asr = await load(model, id);
    if (kind === 'load') return postMessage({ id, kind: 'done', text: '' });
    // No language: auto-detect (English, Italian, or mixed).
    const out = (await asr(audio!, { chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' })) as
      | { text: string }
      | { text: string }[];
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
    postMessage({ id, kind: 'done', text });
  } catch (e) {
    postMessage({ id, kind: 'error', message: (e as Error).message ?? String(e) });
  }
};
