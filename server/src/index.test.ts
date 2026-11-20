import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { makeHandler, type Env } from './index';
import { renderExamples, sanitise } from './interpret';

const TOKEN = 'test-token-0123456789abcdef';
const env: Env = {
  APP_TOKEN: TOKEN,
  ANTHROPIC_API_KEY: 'sk-ant-test',
  OPENAI_API_KEY: 'sk-openai-test',
  ALLOWED_ORIGINS: 'https://app.example',
};
const ORIGIN = 'https://app.example';

function req(path: string, init: RequestInit & { origin?: string | null; token?: string | null } = {}) {
  const headers = new Headers(init.headers);
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN);
  if (init.token !== null) headers.set('Authorization', `Bearer ${init.token ?? TOKEN}`);
  return new Request(`https://api.example${path}`, { ...init, headers });
}

function claudeReply(body: object, capture: { body?: any; headers?: Headers }) {
  const fetchMock: typeof fetch = async (input, init) => {
    capture.body = JSON.parse(String(init?.body));
    capture.headers = new Headers(init?.headers);
    return new Response(
      JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: JSON.stringify(body) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return () => new Anthropic({ apiKey: 'sk-ant-test', fetch: fetchMock, maxRetries: 0 });
}

describe('access control', () => {
  const handle = makeHandler();
  it('rejects missing or wrong token', async () => {
    expect((await handle(req('/health', { token: null }), env)).status).toBe(401);
    expect((await handle(req('/health', { token: 'wrong' }), env)).status).toBe(401);
  });
  it('refuses to run with a short or missing APP_TOKEN', async () => {
    expect((await handle(req('/health', { token: '' }), { ...env, APP_TOKEN: '' })).status).toBe(401);
  });
  it('rejects disallowed browser origins, allows listed one with CORS headers', async () => {
    expect((await handle(req('/health', { origin: 'https://evil.example' }), env)).status).toBe(403);
    const ok = await handle(req('/health'), env);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await ok.json()).toMatchObject({ ok: true, transcribe: true, interpret: true });
  });
  it('answers CORS preflight', async () => {
    const r = await handle(req('/interpret', { method: 'OPTIONS', token: null }), env);
    expect(r.status).toBe(204);
  });
});

describe('/transcribe', () => {
  it('forwards audio and vocabulary prompt to OpenAI without a fixed language', async () => {
    let sent: FormData | null = null;
    let auth = '';
    const handle = makeHandler({
      fetch: async (_url, init) => {
        sent = init?.body as FormData;
        auth = new Headers(init?.headers).get('Authorization') ?? '';
        return Response.json({ text: ' Ciao Paul, tutto bene ' });
      },
    });
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([1, 2, 3])], 'x', { type: 'audio/mp4' }));
    fd.append('prompt', 'Paul, Francesca, Izumi, Dan');
    const r = await handle(req('/transcribe', { method: 'POST', body: fd }), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ text: 'Ciao Paul, tutto bene', provider: 'openai:gpt-4o-transcribe' });
    expect(auth).toBe('Bearer sk-openai-test');
    expect(sent!.get('prompt')).toBe('Paul, Francesca, Izumi, Dan');
    expect(sent!.get('language')).toBeNull();
    expect((sent!.get('file') as File).name).toBe('audio.m4a');
  });
  it('rejects unsupported type and reports upstream failure', async () => {
    const handle = makeHandler({ fetch: async () => new Response('no', { status: 500 }) });
    const bad = new FormData();
    bad.append('file', new File([new Uint8Array([1])], 'x', { type: 'text/plain' }));
    expect((await handle(req('/transcribe', { method: 'POST', body: bad }), env)).status).toBe(415);
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([1])], 'x', { type: 'audio/webm;codecs=opus' }));
    expect((await handle(req('/transcribe', { method: 'POST', body: fd }), env)).status).toBe(502);
  });
  it('503 when OpenAI key not configured', async () => {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([1])], 'x', { type: 'audio/mp4' }));
    const r = await makeHandler()(req('/transcribe', { method: 'POST', body: fd }), { ...env, OPENAI_API_KEY: undefined });
    expect(r.status).toBe(503);
  });
});

describe('/interpret', () => {
  const input = {
    asrText: 'chow pole tutto bean',
    examples: [{ heard: 'chow pole', meant: 'Ciao Paul' }],
    vocabulary: ['Torino'],
    contacts: ['Paul', 'Dan'],
  };

  it('calls Claude Opus 5.5 with fallbacks, structured output, examples as data; returns sanitised readings', async () => {
    const cap: { body?: any; headers?: Headers } = {};
    const handle = makeHandler({
      anthropic: claudeReply(
        {
          readings: [
            { text: 'Ciao Paul, tutto bene', uncertainty_notes: ['"bean" could be "bene"'] },
            { text: '  ', uncertainty_notes: [] },
            { text: 'third', uncertainty_notes: [] },
          ],
          indeterminate: false,
          note: '',
        },
        cap,
      ),
    });
    const r = await handle(req('/interpret', { method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } }), env);
    expect(r.status).toBe(200);
    const out = (await r.json()) as any;
    expect(out.readings).toEqual([
      { text: 'Ciao Paul, tutto bene', uncertainty_notes: ['"bean" could be "bene"'] },
      { text: 'third', uncertainty_notes: [] },
    ]);
    expect(out.model).toBe('claude-opus-5-5');
    expect(cap.body.model).toBe('claude-opus-5-5');
    expect(cap.body.fallbacks).toBe('default');
    expect(cap.headers!.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(cap.body.output_config.effort).toBe('medium');
    expect(cap.body.output_config.format.type).toBe('json_schema');
    expect(cap.body.thinking).toBeUndefined();
    const userText = cap.body.messages[0].content.map((c: any) => c.text).join('\n');
    expect(userText).toContain('chow pole');
    expect(userText).toContain('Ciao Paul');
  });

  it('rejects bad input and oversized example lists', async () => {
    const handle = makeHandler({ anthropic: claudeReply({}, {}) });
    const bad = await handle(req('/interpret', { method: 'POST', body: JSON.stringify({ asrText: '' }) }), env);
    expect(bad.status).toBe(400);
    const many = { ...input, examples: Array.from({ length: 41 }, () => ({ heard: 'a', meant: 'b' })) };
    expect((await handle(req('/interpret', { method: 'POST', body: JSON.stringify(many) }), env)).status).toBe(400);
  });
});

describe('interpret helpers', () => {
  it('sanitise caps at two, drops empties, forces indeterminate when none', () => {
    expect(sanitise({ readings: [], indeterminate: false, note: ' x ' })).toEqual({ readings: [], indeterminate: true, note: 'x' });
  });
  it('renders no-examples case', () => {
    expect(renderExamples({ asrText: 'a', examples: [], vocabulary: [], contacts: [] })).toContain('No confirmed examples yet.');
  });
});
