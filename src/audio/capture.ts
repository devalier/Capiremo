// Microphone capture with a demo fallback. Tap-to-start / tap-to-stop only.
// iOS notes (verify on device): Safari 14.3+ records audio/mp4; recording stops when the
// app is backgrounded or the screen locks — we salvage what was captured and keep it as a draft.

import type { AudioClip } from '../types';
import { synthWav } from './wav';

export type CaptureErrorKind = 'permission-denied' | 'no-microphone' | 'unsupported' | 'recording-failed';

export class CaptureError extends Error {
  constructor(public kind: CaptureErrorKind, message?: string) {
    super(message ?? kind);
  }
}

export interface Capture {
  start(): Promise<void>;
  /** Finalise and return the clip. Safe to call once; also used to salvage after interruption. */
  stop(): Promise<AudioClip>;
  /** 0..1 input level, or null if unavailable. */
  level(): number | null;
  /** Called when the OS ends the microphone track (call, Siri, backgrounding). */
  onInterrupted(cb: () => void): void;
  dispose(): void;
}

export const MAX_RECORDING_MS = 5 * 60 * 1000;

export function micSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    'MediaRecorder' in window &&
    window.isSecureContext
  );
}

function pickMime(): string {
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const c of candidates) if (MediaRecorder.isTypeSupported?.(c)) return c;
  return '';
}

function classify(err: unknown): CaptureError {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return new CaptureError('permission-denied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError')
    return new CaptureError('no-microphone');
  return new CaptureError('recording-failed', String(err));
}

export function micCapture(): Capture {
  let stream: MediaStream | null = null;
  let rec: MediaRecorder | null = null;
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  const chunks: Blob[] = [];
  let startedAt = 0;
  let interruptCb: (() => void) | null = null;
  let stopping: Promise<AudioClip> | null = null;

  function release() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    ctx?.close().catch(() => {});
    ctx = null;
    analyser = null;
  }

  return {
    async start() {
      if (!micSupported()) throw new CaptureError('unsupported');
      // Create the AudioContext inside the user gesture so iOS lets it run.
      try {
        ctx = new AudioContext();
      } catch {
        ctx = null;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        release();
        throw classify(e);
      }
      try {
        const mime = pickMime();
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        rec.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };
        // Timeslice so partial audio survives an interruption.
        rec.start(1000);
        startedAt = performance.now();
      } catch (e) {
        release();
        throw new CaptureError('recording-failed', String(e));
      }
      stream.getAudioTracks().forEach((t) => t.addEventListener('ended', () => interruptCb?.()));
      if (ctx) {
        try {
          await ctx.resume();
          analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          ctx.createMediaStreamSource(stream).connect(analyser);
        } catch {
          analyser = null;
        }
      }
    },

    stop() {
      if (stopping) return stopping;
      stopping = new Promise<AudioClip>((resolve, reject) => {
        const r = rec;
        const finish = async () => {
          const durationMs = Math.round(performance.now() - startedAt);
          const type = r?.mimeType || chunks[0]?.type || 'audio/mp4';
          release();
          if (chunks.length === 0) return reject(new CaptureError('recording-failed', 'no audio captured'));
          const blob = new Blob(chunks, { type });
          resolve({ data: await blob.arrayBuffer(), mimeType: type, durationMs, demo: false });
        };
        if (!r || r.state === 'inactive') return void finish();
        r.onstop = () => void finish();
        r.onerror = () => void finish();
        try {
          r.requestData?.();
          r.stop();
        } catch {
          void finish();
        }
      });
      return stopping;
    },

    level() {
      if (!analyser) return null;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const x of data) peak = Math.max(peak, Math.abs(x - 128));
      return Math.min(1, peak / 64);
    },

    onInterrupted(cb) {
      interruptCb = cb;
    },

    dispose() {
      try {
        if (rec && rec.state !== 'inactive') rec.stop();
      } catch {
        /* ignore */
      }
      release();
    },
  };
}

/** Used when there is no microphone (desktop testing, unsupported browser). Clearly marked as demo. */
export function demoCapture(): Capture {
  let startedAt = 0;
  return {
    async start() {
      startedAt = performance.now();
    },
    async stop() {
      const durationMs = Math.max(500, Math.round(performance.now() - startedAt));
      return { data: synthWav(durationMs), mimeType: 'audio/wav', durationMs, demo: true };
    },
    level() {
      return 0.3 + 0.2 * Math.sin(performance.now() / 150);
    },
    onInterrupted() {},
    dispose() {},
  };
}
