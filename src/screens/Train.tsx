// Admin: record the speaker, confirm what was really said, and measure whether it helps.
// Adaptation (no model fine-tuning):
//   1. Speech-to-text gets a hint prompt: names, confirmed vocabulary, words it keeps missing,
//      and confirmed sentences (server engine only; on-device Whisper ignores it).
//   2. The interpreter (Claude) gets confirmed "heard → said" pairs as examples of this speaker.
// The check re-runs both on saved recordings, leaving each recording's own example out.

import { useRef, useState } from 'react';
import { demoCapture, micCapture, micSupported, type Capture } from '../audio/capture';
import type { InterpretResult } from '../ai/client';
import { asrAvailable, interpretAvailable } from '../ai/client';
import { parseVocabulary } from '../ai/learning';
import { mean, pct, wordAccuracy } from '../ai/score';
import type { Settings } from '../storage/store';
import { newId } from '../state/useTalkFlow';
import type { AsrResult, AudioClip, Contact, TrainingExample } from '../types';

export const DEFAULT_PHRASES = [
  'Ciao {0}, come stai?',
  "I'm fine, thank you.",
  'What time are you coming tomorrow?',
  'Ho mangiato bene oggi.',
  'Can you call me this evening?',
  'Non lo so.',
  "I didn't sleep very well last night.",
  'Grazie mille, a domenica.',
  'Where did you put my glasses?',
  'Fa freddo oggi, vero?',
  'I love you all.',
  'Quando vieni a trovarmi?',
  "The television isn't working.",
  'Ho bisogno di aiuto.',
  '{1} and {0} are coming for lunch.',
];

export function fillPhrase(p: string, contacts: Contact[]) {
  return p.replace(/\{(\d)\}/g, (_, i) => contacts[Number(i)]?.name ?? '');
}

interface Props {
  settings: Settings;
  contacts: Contact[];
  training: TrainingExample[];
  vocabulary: string[];
  prompt: string;
  playing: string | null;
  onPlay: (id: string, audio: AudioClip) => void;
  transcribe: (audio: AudioClip, excludeId?: string) => Promise<AsrResult>;
  interpret: (asrText: string, excludeId?: string) => Promise<InterpretResult>;
  onSave: (e: TrainingExample) => void;
  onDelete: (id: string) => void;
  onVocabulary: (v: string[]) => void;
  onPhrases: (p: string[] | null) => void;
  onClose: () => void;
}

type Rec =
  | { kind: 'idle' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'review'; audio: AudioClip; asr: AsrResult; text: string }
  | { kind: 'error'; message: string };

export function Train(p: Props) {
  const phrases = (p.settings.phrases ?? DEFAULT_PHRASES).map((x) => fillPhrase(x, p.contacts)).filter(Boolean);
  const [mode, setMode] = useState<'phrase' | 'free'>('phrase');
  const [idx, setIdx] = useState(() => p.training.filter((e) => e.mode === 'phrase').length % Math.max(1, phrases.length));
  const [rec, setRec] = useState<Rec>({ kind: 'idle' });
  const cap = useRef<Capture | null>(null);
  const phrase = phrases[idx % Math.max(1, phrases.length)] ?? '';
  const canAsr = asrAvailable(p.settings.ai);

  async function start() {
    const c = p.settings.forceDemoAudio || !micSupported() ? demoCapture() : micCapture();
    try {
      await c.start();
      cap.current = c;
      setRec({ kind: 'recording', startedAt: Date.now() });
    } catch (e) {
      setRec({ kind: 'error', message: `Microphone: ${(e as Error).message}` });
    }
  }

  async function stop() {
    const c = cap.current;
    cap.current = null;
    if (!c) return;
    let audio: AudioClip;
    try {
      audio = await c.stop();
    } catch (e) {
      return setRec({ kind: 'error', message: `Recording failed: ${(e as Error).message}` });
    }
    const initial = mode === 'phrase' ? phrase : '';
    setRec({ kind: 'review', audio, asr: { status: 'pending' }, text: initial });
    const asr = await p.transcribe(audio);
    setRec((r) =>
      r.kind === 'review' && r.audio === audio
        ? { ...r, asr, text: mode === 'free' && !r.text && asr.status === 'done' ? asr.text : r.text }
        : r,
    );
  }

  function save() {
    if (rec.kind !== 'review' || !rec.text.trim()) return;
    p.onSave({
      id: newId('train'),
      createdAt: Date.now(),
      audio: rec.audio,
      mode,
      confirmedText: rec.text.trim(),
      asr: rec.asr.status === 'pending' ? { status: 'not-requested' } : rec.asr,
    });
    setRec({ kind: 'idle' });
    if (mode === 'phrase') setIdx((i) => (i + 1) % Math.max(1, phrases.length));
  }

  return (
    <main className="screen caregiver train">
      <div className="cg-head">
        <h1>Train</h1>
        <button type="button" className="cg-btn" onClick={p.onClose}>
          Back
        </button>
      </div>

      <section className="cg-section">
        <p className="cg-help">
          Record the speaker, then confirm what was actually said. Confirmed recordings teach the system this voice: names and
          words are passed to speech-to-text as hints{p.settings.ai.engine === 'device' ? ' (server engine only)' : ''}, and
          "heard → said" pairs are given to the AI as examples. Only confirmed text is used — never guesses.
        </p>
        {!canAsr && <p className="cg-warn">Speech-to-text is off or not set up (Admin → AI). You can still record and confirm; text is added later by the check.</p>}
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'phrase'} className={mode === 'phrase' ? 'on' : ''} onClick={() => setMode('phrase')}>
            Read a phrase
          </button>
          <button type="button" role="tab" aria-selected={mode === 'free'} className={mode === 'free' ? 'on' : ''} onClick={() => setMode('free')}>
            Say anything
          </button>
        </div>
        {mode === 'phrase' && (
          <div className="phrase-card">
            <button type="button" className="cg-btn" aria-label="Previous phrase" onClick={() => setIdx((i) => (i - 1 + phrases.length) % phrases.length)}>
              ◀
            </button>
            <p className="phrase" data-testid="phrase">
              {phrase}
            </p>
            <button type="button" className="cg-btn" aria-label="Next phrase" onClick={() => setIdx((i) => (i + 1) % phrases.length)}>
              ▶
            </button>
          </div>
        )}

        {rec.kind === 'recording' ? (
          <button type="button" className="train-rec on" onClick={stop}>
            ■ Stop
          </button>
        ) : rec.kind !== 'review' ? (
          <button type="button" className="train-rec" onClick={start}>
            ● Record
          </button>
        ) : null}
        {rec.kind === 'error' && <p className="cg-warn">{rec.message}</p>}

        {rec.kind === 'review' && (
          <div className="train-review">
            <button type="button" className="cg-btn" onClick={() => p.onPlay('train-draft', rec.audio)}>
              {p.playing === 'train-draft' ? 'Stop' : 'Play'} ({Math.round(rec.audio.durationMs / 1000)}s{rec.audio.demo ? ', demo sound' : ''})
            </button>
            <div className="layer asr">
              <span className="layer-tag">Machine heard</span>
              {rec.asr.status === 'pending' ? (
                <span className="cg-dim">Transcribing…</span>
              ) : rec.asr.status === 'done' ? (
                <q data-testid="train-heard">{rec.asr.text}</q>
              ) : (
                <span className="cg-dim">{'reason' in rec.asr ? rec.asr.reason : rec.asr.status}</span>
              )}
            </div>
            <label className="cg-field col">
              What was actually said (only if sure)
              <textarea
                rows={2}
                value={rec.text}
                onChange={(e) => setRec({ ...rec, text: e.target.value })}
                placeholder="Type exactly what was said"
              />
            </label>
            {rec.asr.status === 'done' && rec.text.trim() && (
              <p className="cg-dim">Machine word accuracy on this recording: {pct(wordAccuracy(rec.text, rec.asr.text))}</p>
            )}
            <div className="cg-row">
              <button type="button" className="cg-btn primary" disabled={!rec.text.trim() || rec.asr.status === 'pending'} onClick={save}>
                Save as confirmed
              </button>
              <button type="button" className="cg-btn" onClick={() => setRec({ kind: 'idle' })}>
                Discard
              </button>
            </div>
          </div>
        )}
      </section>

      <Check {...p} />

      <section className="cg-section">
        <h2>Words and names the speaker uses</h2>
        <p className="cg-help">One per line or comma-separated. Contact names are always included.</p>
        <VocabEditor vocabulary={p.vocabulary} onSave={p.onVocabulary} />
        <details>
          <summary>Current hint sent to speech-to-text</summary>
          <p className="cg-dim mono">{p.prompt || '(empty)'}</p>
        </details>
      </section>

      <section className="cg-section">
        <h2>Saved recordings ({p.training.length})</h2>
        <ExampleList {...p} />
      </section>

      <section className="cg-section">
        <h2>Phrases to read</h2>
        <PhraseEditor phrases={p.settings.phrases ?? DEFAULT_PHRASES} onSave={p.onPhrases} />
      </section>
    </main>
  );
}

function Check(p: Props) {
  const [state, setState] = useState<{ running: boolean; done: number; total: number; error?: string }>({ running: false, done: 0, total: 0 });
  const checked = p.training.filter((e) => e.lastCheck);
  const raw = mean(checked.map((e) => e.lastCheck!.rawAccuracy));
  const withAi = mean(checked.filter((e) => e.lastCheck!.aiAccuracy !== null).map((e) => e.lastCheck!.aiAccuracy!));
  const atRecording = mean(
    p.training.filter((e) => e.asr.status === 'done').map((e) => wordAccuracy(e.confirmedText, (e.asr as { text: string }).text)),
  );
  const canAsr = asrAvailable(p.settings.ai);
  const canAi = interpretAvailable(p.settings.ai);

  async function run() {
    const list = [...p.training].filter((e) => !e.audio.demo).sort((a, b) => b.createdAt - a.createdAt).slice(0, 15);
    setState({ running: true, done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const asr = await p.transcribe(e.audio, e.id);
      if (asr.status !== 'done') {
        setState({ running: false, done: i, total: list.length, error: 'reason' in asr ? asr.reason : 'Speech-to-text failed' });
        return;
      }
      let aiText: string | null = null;
      if (canAi) {
        const r = await p.interpret(asr.text, e.id);
        aiText = r.status === 'done' ? r.candidates[0].text : r.status === 'abstained' ? asr.text : null;
      }
      p.onSave({
        ...e,
        // Fill in the original transcript for recordings made while speech-to-text was off.
        asr: e.asr.status === 'done' ? e.asr : asr,
        lastCheck: {
          at: Date.now(),
          asrText: asr.text,
          rawAccuracy: wordAccuracy(e.confirmedText, asr.text),
          aiText,
          aiAccuracy: aiText === null ? null : wordAccuracy(e.confirmedText, aiText),
        },
      });
      setState({ running: true, done: i + 1, total: list.length });
    }
    setState((s) => ({ ...s, running: false }));
  }

  return (
    <section className="cg-section">
      <h2>Is it improving?</h2>
      <table className="scores">
        <tbody>
          <tr>
            <th>Speech-to-text when recorded</th>
            <td data-testid="score-recorded">{pct(atRecording)}</td>
          </tr>
          <tr>
            <th>Speech-to-text now (with hints)</th>
            <td data-testid="score-raw">{pct(raw)}</td>
          </tr>
          <tr>
            <th>AI reading now (with examples)</th>
            <td data-testid="score-ai">{pct(withAi)}</td>
          </tr>
        </tbody>
      </table>
      <p className="cg-help">
        Word accuracy against the confirmed text, on up to 15 recent recordings. Each recording is checked without its
        own example, so the AI can't just copy the answer. Needs several recordings to mean anything.
      </p>
      <button type="button" className="cg-btn" disabled={state.running || !canAsr || p.training.length === 0} onClick={run}>
        {state.running ? `Checking ${state.done}/${state.total}…` : 'Run check'}
      </button>
      {!state.running && state.total > 0 && !state.error && <span className="cg-dim"> Checked {state.done} recordings.</span>}
      {state.error && <p className="cg-warn">Stopped: {state.error}</p>}
    </section>
  );
}

function ExampleList(p: Props) {
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const list = [...p.training].sort((a, b) => b.createdAt - a.createdAt);
  if (!list.length) return <p className="cg-help">None yet.</p>;
  return (
    <ol className="cg-msgs">
      {list.map((e) => (
        <li key={e.id} className="cg-msg">
          <div className="cg-row">
            <button type="button" className="cg-btn" onClick={() => p.onPlay(e.id, e.audio)}>
              {p.playing === e.id ? 'Stop' : 'Play'}
            </button>
            <strong className="grow">“{e.confirmedText}”</strong>
          </div>
          <span className="cg-dim">
            Heard: {e.asr.status === 'done' ? `“${e.asr.text}” (${pct(wordAccuracy(e.confirmedText, e.asr.text))})` : 'not transcribed'}
          </span>
          {e.lastCheck && (
            <span className="cg-dim">
              Last check: STT {pct(e.lastCheck.rawAccuracy)}
              {e.lastCheck.aiText !== null && <> · AI “{e.lastCheck.aiText}” {pct(e.lastCheck.aiAccuracy)}</>}
            </span>
          )}
          {confirmDel === e.id ? (
            <div className="cg-row">
              <span>Delete this recording?</span>
              <button type="button" className="cg-btn danger" onClick={() => p.onDelete(e.id)}>
                Yes, delete
              </button>
              <button type="button" className="cg-btn" onClick={() => setConfirmDel(null)}>
                No
              </button>
            </div>
          ) : (
            <button type="button" className="cg-btn danger small" onClick={() => setConfirmDel(e.id)}>
              Delete
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function VocabEditor({ vocabulary, onSave }: { vocabulary: string[]; onSave: (v: string[]) => void }) {
  const [text, setText] = useState(vocabulary.join('\n'));
  const dirty = text !== vocabulary.join('\n');
  return (
    <div className="cg-col">
      <textarea rows={4} aria-label="Vocabulary" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" className="cg-btn" disabled={!dirty} onClick={() => onSave(parseVocabulary(text))}>
        Save words
      </button>
    </div>
  );
}

function PhraseEditor({ phrases, onSave }: { phrases: string[]; onSave: (p: string[] | null) => void }) {
  const [text, setText] = useState(phrases.join('\n'));
  return (
    <div className="cg-col">
      <p className="cg-help">One per line. {'{0}'} and {'{1}'} become the first two contact names.</p>
      <textarea rows={6} aria-label="Phrases" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="cg-row">
        <button type="button" className="cg-btn" onClick={() => onSave(text.split('\n').map((s) => s.trim()).filter(Boolean))}>
          Save phrases
        </button>
        <button
          type="button"
          className="cg-btn"
          onClick={() => {
            setText(DEFAULT_PHRASES.join('\n'));
            onSave(null);
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
