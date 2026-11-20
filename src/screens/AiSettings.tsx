import { useState } from 'react';
import { health, serverReady } from '../ai/client';
import type { AiSettings as Ai, AsrEngine, DeviceModel } from '../storage/store';

export function AiSettings({ ai, onChange }: { ai: Ai; onChange: (ai: Ai) => void }) {
  const [url, setUrl] = useState(ai.serverUrl);
  const [token, setToken] = useState(ai.token);
  const [status, setStatus] = useState<{ ok: boolean; detail: string } | null>(null);
  const [download, setDownload] = useState<string | null>(null);
  const dirty = url !== ai.serverUrl || token !== ai.token;

  async function test() {
    setStatus({ ok: true, detail: 'Testing…' });
    setStatus(await health({ ...ai, serverUrl: url.trim(), token: token.trim() }));
  }

  async function preload() {
    setDownload('Starting…');
    try {
      const { preloadModel } = await import('../ai/whisper');
      await preloadModel(ai.deviceModel, (p) => setDownload(`Downloading… ${Math.round(p)}%`));
      setDownload('Ready on this phone.');
    } catch (e) {
      setDownload(`Failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="cg-col">
      <label className="cg-field">
        Speech-to-text
        <select value={ai.engine} onChange={(e) => onChange({ ...ai, engine: e.target.value as AsrEngine })} aria-label="Speech-to-text engine">
          <option value="off">Off — audio only</option>
          <option value="server">Server (OpenAI)</option>
          <option value="device">On this phone (Whisper)</option>
        </select>
      </label>
      {ai.engine === 'device' && (
        <div className="cg-col">
          <label className="cg-field">
            Model
            <select value={ai.deviceModel} onChange={(e) => onChange({ ...ai, deviceModel: e.target.value as DeviceModel })}>
              <option value="whisper-base">Whisper base (~80 MB, faster)</option>
              <option value="whisper-small">Whisper small (~250 MB, better, slow)</option>
            </select>
          </label>
          <p className="cg-help">
            Audio stays on the phone. The model downloads once from huggingface.co. Vocabulary hints from training are not
            used by this engine; AI interpretation (below) still is.
          </p>
          <div className="cg-row">
            <button type="button" className="cg-btn" onClick={preload}>
              Download model now
            </button>
            {download && <span className="cg-dim">{download}</span>}
          </div>
        </div>
      )}

      <h3 className="cg-sub">Server</h3>
      <p className="cg-help">
        Your Capiremo server (see server/README.md). It holds the OpenAI and Anthropic keys; this phone only stores the
        family access token.
      </p>
      <label className="cg-field col">
        Server address
        <input
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://capiremo-api.example.workers.dev"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="cg-field col">
        Access token
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <div className="cg-row">
        <button
          type="button"
          className="cg-btn primary"
          disabled={!dirty}
          onClick={() => onChange({ ...ai, serverUrl: url.trim(), token: token.trim() })}
        >
          Save server
        </button>
        <button type="button" className="cg-btn" disabled={!url || !token} onClick={test}>
          Test connection
        </button>
      </div>
      {status && <p className={status.ok ? 'cg-ok' : 'cg-warn'} role="status">{status.detail}</p>}

      <label className="cg-field toggle">
        <input type="checkbox" checked={ai.interpret} onChange={(e) => onChange({ ...ai, interpret: e.target.checked })} />
        AI interpretation of the speaker's messages (Claude, via server)
      </label>
      {ai.interpret && !serverReady(ai) && <p className="cg-help">Needs the server address and token.</p>}
      <p className="cg-help">
        Privacy: with "Server", recordings are sent to OpenAI for transcription; with interpretation on, transcripts and
        confirmed examples are sent to Anthropic. Nothing is stored on the Capiremo server. Choose "Off" for audio only.
      </p>
    </div>
  );
}
