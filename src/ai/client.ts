// Talks to the Capiremo proxy (server/) and the on-device recogniser.
// Failures come back as values, never as fake success.

import type { AiSettings } from '../storage/store';
import type { AsrResult, AudioClip, InterpretationCandidate } from '../types';

const TIMEOUT_MS = 90_000;

function endpoint(ai: AiSettings, path: string) {
  return `${ai.serverUrl.replace(/\/+$/, '')}${path}`;
}

async function call(ai: AiSettings, path: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(endpoint(ai, path), {
      ...init,
      signal: ctl.signal,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${ai.token}` },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function errorText(r: Response) {
  try {
    const j = (await r.json()) as { error?: string };
    return j.error ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

export function serverReady(ai: AiSettings) {
  return /^https?:\/\//.test(ai.serverUrl) && ai.token.length >= 16;
}

export function asrAvailable(ai: AiSettings) {
  return ai.engine === 'device' || (ai.engine === 'server' && serverReady(ai));
}

export function interpretAvailable(ai: AiSettings) {
  return ai.interpret && serverReady(ai);
}

export async function health(ai: AiSettings): Promise<{ ok: boolean; detail: string }> {
  if (!serverReady(ai)) return { ok: false, detail: 'Server address or access token missing.' };
  try {
    const r = await call(ai, '/health', { method: 'GET' });
    if (!r.ok) return { ok: false, detail: await errorText(r) };
    const j = (await r.json()) as { transcribe: boolean; interpret: boolean; model: string; transcribeModel: string };
    return {
      ok: true,
      detail: `Connected. Speech-to-text: ${j.transcribe ? j.transcribeModel : 'not configured'}. Interpretation: ${j.interpret ? j.model : 'not configured'}.`,
    };
  } catch (e) {
    return { ok: false, detail: `Cannot reach server (${(e as Error).name}).` };
  }
}

export async function transcribe(ai: AiSettings, audio: AudioClip, prompt: string): Promise<AsrResult> {
  if (audio.demo) return { status: 'unavailable', reason: 'Demo sound — nothing to transcribe.' };
  if (ai.engine === 'off') return { status: 'unavailable', reason: 'Speech-to-text is off (Admin → AI).' };
  if (ai.engine === 'device') {
    try {
      const { transcribeOnDevice } = await import('./whisper');
      const text = await transcribeOnDevice(audio, ai.deviceModel);
      return { status: 'done', text, detectedLanguages: [], provider: `device:${ai.deviceModel}` };
    } catch (e) {
      return { status: 'failed', reason: `On-device recogniser failed: ${(e as Error).message}` };
    }
  }
  if (!serverReady(ai)) return { status: 'unavailable', reason: 'Server not set up (Admin → AI).' };
  try {
    const fd = new FormData();
    fd.append('file', new Blob([audio.data], { type: audio.mimeType }), 'audio');
    if (prompt) fd.append('prompt', prompt);
    const r = await call(ai, '/transcribe', { method: 'POST', body: fd });
    if (!r.ok) return { status: 'failed', reason: await errorText(r) };
    const j = (await r.json()) as { text: string; language: string | null; provider: string };
    return { status: 'done', text: j.text, detectedLanguages: j.language ? [j.language] : [], provider: j.provider };
  } catch (e) {
    return { status: 'failed', reason: `Network error (${(e as Error).name}).` };
  }
}

export interface InterpretRequest {
  asrText: string;
  examples: { heard: string; meant: string }[];
  vocabulary: string[];
  contacts: string[];
}

export type InterpretResult =
  | { status: 'done'; candidates: InterpretationCandidate[]; note: string; model: string }
  | { status: 'abstained'; note: string; model: string }
  | { status: 'failed'; note: string };

export async function interpret(ai: AiSettings, req: InterpretRequest): Promise<InterpretResult> {
  if (!interpretAvailable(ai)) return { status: 'failed', note: 'Interpretation is off or the server is not set up.' };
  try {
    const r = await call(ai, '/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!r.ok) return { status: 'failed', note: await errorText(r) };
    const j = (await r.json()) as {
      readings: { text: string; uncertainty_notes: string[] }[];
      indeterminate: boolean;
      note: string;
      model: string;
    };
    const now = Date.now();
    const candidates: InterpretationCandidate[] = j.readings.slice(0, 2).map((x) => ({
      text: x.text,
      status: 'unverified',
      uncertaintyNotes: x.uncertainty_notes,
      provider: j.model,
      createdAt: now,
    }));
    if (candidates.length === 0) return { status: 'abstained', note: j.note || 'Meaning unclear.', model: j.model };
    return { status: 'done', candidates, note: j.note, model: j.model };
  } catch (e) {
    return { status: 'failed', note: `Network error (${(e as Error).name}).` };
  }
}
