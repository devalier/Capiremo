// Capiremo API proxy (Cloudflare Worker). Holds provider keys server-side.
//   GET  /health      → which services are configured
//   POST /transcribe  → multipart {file, prompt?} → OpenAI transcription → {text, provider}
//   POST /interpret   → JSON InterpretInput → Claude → {readings, indeterminate, note, model}
// Every request needs `Authorization: Bearer <APP_TOKEN>`; browsers only from ALLOWED_ORIGINS.
// Audio and text are not stored or logged here.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { InterpretInput, InterpretOutput, SYSTEM_PROMPT, renderExamples, renderTarget, sanitise } from './interpret';

export interface Env {
  APP_TOKEN: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  CLAUDE_MODEL?: string;
  OPENAI_TRANSCRIBE_MODEL?: string;
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function authorised(req: Request, env: Env): boolean {
  if (!env.APP_TOKEN || env.APP_TOKEN.length < 16) return false; // refuse to run open
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') && timingSafeEqual(h.slice(7), env.APP_TOKEN);
}

const EXT: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
};

async function transcribe(req: Request, env: Env, h: Record<string, string>, fetchImpl: typeof fetch): Promise<Response> {
  if (!env.OPENAI_API_KEY) return json({ error: 'transcription not configured' }, 503, h);
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'file missing' }, 400, h);
  if (file.size === 0 || file.size > MAX_AUDIO_BYTES) return json({ error: 'file size' }, 413, h);
  const prompt = String(form.get('prompt') ?? '').slice(0, 1500);
  const base = file.type.split(';')[0];
  const ext = EXT[base];
  if (!ext) return json({ error: `unsupported type ${base}` }, 415, h);

  const model = env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
  const out = new FormData();
  out.append('file', new File([await file.arrayBuffer()], `audio.${ext}`, { type: base }));
  out.append('model', model);
  out.append('response_format', 'json');
  if (prompt) out.append('prompt', prompt);
  // No `language`: speech may be English, Italian or both in one sentence.

  const r = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: out,
  });
  if (!r.ok) return json({ error: `transcription failed (${r.status})` }, 502, h);
  const data = (await r.json()) as { text?: string; language?: string };
  return json({ text: (data.text ?? '').trim(), language: data.language ?? null, provider: `openai:${model}` }, 200, h);
}

async function interpret(req: Request, env: Env, h: Record<string, string>, client: Anthropic): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'interpretation not configured' }, 503, h);
  const parsed = InterpretInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad input' }, 400, h);
  const input = parsed.data;
  const model = env.CLAUDE_MODEL || 'claude-opus-5-5';

  try {
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(InterpretOutput) },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: renderExamples(input) },
            { type: 'text', text: renderTarget(input) },
          ],
        },
      ],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) {
      return json({ readings: [], indeterminate: true, note: 'No suggestion available.', model: res.model }, 200, h);
    }
    return json({ ...sanitise(res.parsed_output), model: res.model }, 200, h);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy, try again' }, 429, h);
    if (e instanceof Anthropic.APIError) return json({ error: `interpretation failed (${e.status ?? 'network'})` }, 502, h);
    throw e;
  }
}

export function makeHandler(deps: { fetch?: typeof fetch; anthropic?: (env: Env) => Anthropic } = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const makeClient = deps.anthropic ?? ((env: Env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));
  return async function handle(req: Request, env: Env): Promise<Response> {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: h['Access-Control-Allow-Origin'] ? 204 : 403, headers: h });
    if (req.headers.get('Origin') && !h['Access-Control-Allow-Origin']) return json({ error: 'origin not allowed' }, 403, {});
    if (!authorised(req, env)) return json({ error: 'unauthorised' }, 401, h);

    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    try {
      if (req.method === 'GET' && path === '/health') {
        return json(
          {
            ok: true,
            transcribe: !!env.OPENAI_API_KEY,
            interpret: !!env.ANTHROPIC_API_KEY,
            model: env.CLAUDE_MODEL || 'claude-opus-5-5',
            transcribeModel: env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
          },
          200,
          h,
        );
      }
      if (req.method === 'POST' && path === '/transcribe') return await transcribe(req, env, h, fetchImpl);
      if (req.method === 'POST' && path === '/interpret') return await interpret(req, env, h, makeClient(env));
      return json({ error: 'not found' }, 404, h);
    } catch {
      return json({ error: 'server error' }, 500, h);
    }
  };
}

const handle = makeHandler();
export default { fetch: (req: Request, env: Env) => handle(req, env) };
