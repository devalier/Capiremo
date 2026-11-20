// Caregiver / recipient view. Not part of the speaker's everyday UI.
// In this prototype it doubles as the recipient view, because there is no backend yet:
// it shows original audio, raw ASR and AI suggestions as visually separate layers and
// lets a human record a verified correction.

import { useRef, useState } from 'react';
import { demoCapture, micCapture, micSupported, type Capture } from '../audio/capture';
import type { Settings } from '../storage/store';
import {
  withLearningConsent,
  withSuggestionConfirmed,
  withFeedback,
  withTypedCorrection,
  withoutCorrection,
} from '../state/messages';
import { newId } from '../state/useTalkFlow';
import type { Contact, Message } from '../types';
import { MAX_CONTACTS, SPEAKER_ID } from '../types';
import { formatE164 } from '../phone';
import { AiSettings } from './AiSettings';
import { AppSlotsEditor } from './AppSlotsEditor';

interface Props {
  contacts: Contact[];
  messages: Message[];
  settings: Settings;
  playing: string | null;
  persistent: boolean | null;
  services: { delivery: string; remote: boolean };
  trainingCount: number;
  onTrain: () => void;
  onPlay: (m: Message) => void;
  onSettings: (s: Settings) => void;
  onContacts: (c: Contact[]) => void;
  onEditPhone: (contactId: string) => void;
  unlocked: boolean;
  onUnlock: () => void;
  onMessage: (m: Message) => void;
  onWipe: () => void;
  onClose: () => void;
}

const GATE_CODE = '2468';

export function Caregiver(p: Props) {
  const [code, setCode] = useState('');

  if (!p.unlocked) {
    return (
      <main className="screen caregiver gate">
        <h1>Admin</h1>
        <p>
          Type <strong>{GATE_CODE}</strong> to continue. This only prevents accidental entry; it is not a password.
        </p>
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label="Code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (e.target.value === GATE_CODE) p.onUnlock();
          }}
        />
        <button type="button" className="cg-btn" onClick={p.onClose}>
          Back
        </button>
      </main>
    );
  }

  return (
    <main className="screen caregiver">
      <div className="cg-head">
        <h1>Admin</h1>
        <button type="button" className="cg-btn" onClick={p.onClose}>
          Done
        </button>
      </div>

      <button type="button" className="cg-train" onClick={p.onTrain}>
        <span className="cg-train-title">🎙 Train voice</span>
        <span className="cg-dim">{p.trainingCount} confirmed recording{p.trainingCount === 1 ? '' : 's'}</span>
      </button>

      <Section title="Home buttons">
        <AppSlotsEditor slots={p.settings.appSlots} onChange={(appSlots) => p.onSettings({ ...p.settings, appSlots })} />
      </Section>

      <Section title="AI (speech-to-text and interpretation)">
        <AiSettings ai={p.settings.ai} onChange={(ai) => p.onSettings({ ...p.settings, ai })} />
      </Section>

      <Section title="Status">
        <ul className="cg-facts">
          <li>Microphone API: {micSupported() ? 'available' : 'not available (demo sound only)'}</li>
          <li>Delivery: {p.services.remote ? p.services.delivery : 'this device only (no server yet)'}</li>
          <li>
            Persistent storage:{' '}
            {p.persistent === null ? 'unknown' : p.persistent ? 'granted' : 'not granted (browser may evict data)'}
          </li>
          <li>
            Installed to home screen:{' '}
            {matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
              ? 'yes'
              : 'no'}
          </li>
        </ul>
      </Section>

      <Section title="Messages (recipient view)">
        <RecipientList {...p} />
      </Section>

      <Section title="Simulate a reply">
        <p className="cg-help">Record a message as if it came from a contact, to test playback on the speaker's side.</p>
        <ReplyRecorder contacts={p.contacts} forceDemo={p.settings.forceDemoAudio} onMessage={p.onMessage} />
      </Section>

      <Section title={`Contacts (up to ${MAX_CONTACTS})`}>
        <ContactsEditor contacts={p.contacts} onContacts={p.onContacts} onEditPhone={p.onEditPhone} />
      </Section>

      <Section title="Settings">
        <label className="cg-field">
          Button labels
          <select
            value={p.settings.labels}
            onChange={(e) => p.onSettings({ ...p.settings, labels: e.target.value as Settings['labels'] })}
          >
            <option value="en">English</option>
            <option value="it">Italiano</option>
            <option value="both">English + Italiano</option>
          </select>
        </label>
        <Toggle label="Beep on start/stop/send" value={p.settings.sounds} onChange={(v) => p.onSettings({ ...p.settings, sounds: v })} />
        <Toggle label="Speak screen changes aloud" value={p.settings.speak} onChange={(v) => p.onSettings({ ...p.settings, speak: v })} />
        <Toggle
          label="Use demo sound instead of microphone"
          value={p.settings.forceDemoAudio}
          onChange={(v) => p.onSettings({ ...p.settings, forceDemoAudio: v })}
        />
      </Section>

      <Section title="Delete data">
        <WipeButton onWipe={p.onWipe} />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cg-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="cg-field toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function RecipientList({ contacts, messages, playing, onPlay, onMessage }: Props) {
  const name = (id: string) => (id === SPEAKER_ID ? 'Speaker' : (contacts.find((c) => c.id === id)?.name ?? id));
  const sorted = [...messages].sort((a, b) => b.createdAt - a.createdAt);
  if (sorted.length === 0) return <p className="cg-help">No messages yet.</p>;
  return (
    <ol className="cg-msgs">
      {sorted.map((m) => (
        <li key={m.id} className="cg-msg">
          <div className="cg-msg-head">
            <strong>
              {name(m.senderId)} → {name(m.recipientId)}
            </strong>
            <span>{new Date(m.createdAt).toLocaleString()}</span>
          </div>

          <div className="layer audio">
            <span className="layer-tag">Original audio</span>
            <button type="button" className="cg-btn" onClick={() => onPlay(m)}>
              {playing === m.id ? 'Stop' : 'Play'} ({Math.round(m.audio.durationMs / 1000)}s{m.audio.demo ? ', demo sound' : ''})
            </button>
            <span className="cg-dim">Status: {m.status === 'saved-on-device' ? 'saved on this device only' : m.status}</span>
          </div>

          {m.senderId === SPEAKER_ID && (
            <>
              <div className="layer asr">
                <span className="layer-tag">Machine transcription (raw)</span>
                {m.asr.status === 'done' ? (
                  <q>{m.asr.text}</q>
                ) : (
                  <span className="cg-dim">
                    {m.asr.status === 'unavailable' || m.asr.status === 'failed'
                      ? m.asr.reason
                      : m.asr.status === 'pending'
                        ? 'Transcribing…'
                        : 'Not transcribed (speech-to-text is off)'}
                  </span>
                )}
              </div>

              <div className="layer ai">
                <span className="layer-tag">AI suggestion — unverified guess, not the speaker's words</span>
                {m.interpretations.length === 0 ? (
                  <span className="cg-dim">No suggestion.</span>
                ) : (
                  m.interpretations.map((c, i) => (
                    <div key={i} className="cg-cand">
                      <em>{c.text}</em>
                      {c.uncertaintyNotes.length > 0 && <small>{c.uncertaintyNotes.join('; ')}</small>}
                      <div className="cg-row">
                        <button type="button" className="cg-btn" onClick={() => onMessage(withSuggestionConfirmed(m, i, 'caregiver'))}>
                          Correct — this is what was meant
                        </button>
                        <button type="button" className="cg-btn" onClick={() => onMessage(withFeedback(m, i, 'incorrect'))}>
                          Wrong
                        </button>
                        {m.interpretationFeedback[i] && <span className="cg-dim">marked {m.interpretationFeedback[i]}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <VerifiedLayer m={m} onMessage={onMessage} />
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

function VerifiedLayer({ m, onMessage }: { m: Message; onMessage: (m: Message) => void }) {
  const [text, setText] = useState('');
  return (
    <div className="layer verified">
      <span className="layer-tag">Confirmed meaning (human-verified)</span>
      {m.verified ? (
        <>
          <q>{m.verified.confirmedText}</q>
          <span className="cg-dim">
            {m.verified.method === 'recipient-typed' ? 'typed by recipient' : 'suggestion confirmed by recipient'}; speaker
            approval: {m.verified.speakerApproved === null ? 'not asked' : m.verified.speakerApproved ? 'yes' : 'no'}
          </span>
          <label className="cg-field toggle">
            <input
              type="checkbox"
              checked={m.verified.usableForLearning}
              onChange={(e) => onMessage(withLearningConsent(m, e.target.checked))}
            />
            Allow using this to improve future suggestions (consent required)
          </label>
          <button type="button" className="cg-btn" onClick={() => onMessage(withoutCorrection(m))}>
            Remove confirmed meaning
          </button>
        </>
      ) : (
        <form
          className="cg-row"
          onSubmit={(e) => {
            e.preventDefault();
            onMessage(withTypedCorrection(m, text, 'caregiver'));
            setText('');
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What was actually meant (only if sure)" />
          <button type="submit" className="cg-btn" disabled={!text.trim()}>
            Save
          </button>
        </form>
      )}
    </div>
  );
}

function ReplyRecorder({ contacts, forceDemo, onMessage }: { contacts: Contact[]; forceDemo: boolean; onMessage: (m: Message) => void }) {
  const [from, setFrom] = useState(contacts[0]?.id ?? '');
  const [state, setState] = useState<'idle' | 'rec' | 'err'>('idle');
  const [err, setErr] = useState('');
  const cap = useRef<Capture | null>(null);

  async function start() {
    const c = forceDemo || !micSupported() ? demoCapture() : micCapture();
    try {
      await c.start();
      cap.current = c;
      setState('rec');
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setState('err');
    }
  }
  async function stop() {
    const c = cap.current;
    cap.current = null;
    if (!c) return;
    try {
      const audio = await c.stop();
      onMessage({
        id: newId('msg'),
        senderId: from,
        recipientId: SPEAKER_ID,
        createdAt: Date.now(),
        status: 'saved-on-device',
        audio,
        asr: { status: 'not-requested' },
        interpretations: [],
        interpretationFeedback: {},
        verified: null,
        playedByRecipient: false,
      });
      setState('idle');
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setState('err');
    }
  }

  return (
    <div className="cg-row">
      <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From">
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            From {c.name}
          </option>
        ))}
      </select>
      {state === 'rec' ? (
        <button type="button" className="cg-btn rec" onClick={stop}>
          Stop and save
        </button>
      ) : (
        <button type="button" className="cg-btn" onClick={start}>
          Record reply
        </button>
      )}
      {state === 'err' && <span className="cg-dim">Failed: {err}</span>}
    </div>
  );
}

function ContactsEditor({
  contacts,
  onContacts,
  onEditPhone,
}: {
  contacts: Contact[];
  onContacts: (c: Contact[]) => void;
  onEditPhone: (id: string) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const sorted = [...contacts].sort((a, b) => a.order - b.order);
  const update = (id: string, patch: Partial<Contact>) =>
    onContacts(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  async function setPhoto(id: string, file: File | undefined) {
    if (!file) return;
    update(id, { photo: await downscale(file, 512) });
  }

  function add() {
    if (contacts.length >= MAX_CONTACTS) return;
    const order = Math.max(-1, ...contacts.map((c) => c.order)) + 1;
    onContacts([...contacts, { id: newId('contact'), name: 'New contact', photo: null, order, phone: null, country: null }]);
  }

  return (
    <div className="cg-contacts">
      {sorted.map((c) => (
        <div key={c.id} className="cg-contact">
          <label className="cg-field">
            Name
            <input
              aria-label={`Name of ${c.name}`}
              value={c.name}
              maxLength={24}
              onChange={(e) => update(c.id, { name: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && update(c.id, { name: 'Contact' })}
            />
          </label>
          <div className="cg-row">
            <span className="cg-phone">{c.phone ? formatE164(c.phone) : 'No number'}</span>
            <button type="button" className="cg-btn" onClick={() => onEditPhone(c.id)}>
              {c.phone ? 'Change number' : 'Set number'}
            </button>
            {c.phone && (
              <button type="button" className="cg-btn" onClick={() => update(c.id, { phone: null })}>
                Clear number
              </button>
            )}
          </div>
          <div className="cg-row">
            <label className="cg-btn">
              Photo
              <input type="file" accept="image/*" hidden onChange={(e) => void setPhoto(c.id, e.target.files?.[0])} />
            </label>
            {c.photo && (
              <button type="button" className="cg-btn" onClick={() => update(c.id, { photo: null })}>
                Remove photo
              </button>
            )}
            {contacts.length > 1 &&
              (removing === c.id ? (
                <>
                  <span>Remove {c.name}? Their messages stay in the caregiver list.</span>
                  <button
                    type="button"
                    className="cg-btn danger"
                    onClick={() => {
                      onContacts(contacts.filter((x) => x.id !== c.id));
                      setRemoving(null);
                    }}
                  >
                    Yes, remove
                  </button>
                  <button type="button" className="cg-btn" onClick={() => setRemoving(null)}>
                    No
                  </button>
                </>
              ) : (
                <button type="button" className="cg-btn danger" onClick={() => setRemoving(c.id)}>
                  Remove contact
                </button>
              ))}
          </div>
        </div>
      ))}
      {contacts.length < MAX_CONTACTS && (
        <button type="button" className="cg-btn" onClick={add}>
          + Add contact
        </button>
      )}
    </div>
  );
}

function WipeButton({ onWipe }: { onWipe: () => void }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <div className="cg-row">
      <span>Delete all messages, recordings and settings on this device?</span>
      <button type="button" className="cg-btn danger" onClick={onWipe}>
        Yes, delete everything
      </button>
      <button type="button" className="cg-btn" onClick={() => setArmed(false)}>
        No
      </button>
    </div>
  ) : (
    <button type="button" className="cg-btn danger" onClick={() => setArmed(true)}>
      Delete all data on this device…
    </button>
  );
}

function downscale(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s);
      cv.height = Math.round(img.height * s);
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}
