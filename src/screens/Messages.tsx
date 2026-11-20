import { useState } from 'react';
import { formatWhen, type T } from '../i18n';
import type { Contact, Message } from '../types';
import { SPEAKER_ID } from '../types';
import { Avatar, Icon, Label } from '../components/ui';

interface Props {
  t: T;
  locale: string;
  contact: Contact;
  messages: Message[];
  playing: string | null;
  playFailed: string | null;
  canTranscribe: boolean;
  onPlay: (m: Message) => void;
  onTranscribe: (m: Message) => void;
}

const first = (s: string) => s.split('\n')[0];

/** Newest first, so the latest message is always on screen without scrolling. */
export function Messages({ t, locale, contact, messages, playing, playFailed, canTranscribe, onPlay, onTranscribe }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <main className="screen messages">
      <header className="who">
        <Avatar contact={contact} size="m" />
        <h1>{contact.name}</h1>
      </header>
      {messages.length === 0 && (
        <p className="empty">
          <Label text={t('noMessages')} />
        </p>
      )}
      <ol className="msg-list">
        {messages.map((m) => {
          const mine = m.senderId === SPEAKER_ID;
          const isPlaying = playing === m.id;
          const isNew = !mine && !m.playedByRecipient;
          const who = mine ? first(t('you')) : contact.name;
          const when = formatWhen(m.createdAt, t, locale);
          const isOpen = open === m.id;
          return (
            <li key={m.id} className={`msg ${mine ? 'mine' : 'theirs'}`}>
              <div className="msg-row">
                <button
                  type="button"
                  className={`msg-play ${isPlaying ? 'on' : ''}`}
                  onClick={() => onPlay(m)}
                  aria-label={`${isPlaying ? 'Stop' : 'Play'}: ${who}, ${when}`}
                >
                  <span className="msg-icon" aria-hidden="true">
                    {isPlaying ? Icon.stop : Icon.play}
                  </span>
                  <span className="msg-meta">
                    <span className="msg-from">
                      {who}
                      {isNew && <span className="badge small">{first(t('new'))}</span>}
                    </span>
                    <span className="msg-when">{when}</span>
                    {m.audio.demo && <span className="msg-demo">demo sound</span>}
                    {playFailed === m.id && <span className="msg-demo">playback failed</span>}
                  </span>
                </button>
                <button
                  type="button"
                  className={`msg-text-btn ${isOpen ? 'on' : ''}`}
                  aria-expanded={isOpen}
                  aria-label={`${first(isOpen ? t('hideText') : t('showText'))}: ${who}, ${when}`}
                  onClick={() => setOpen(isOpen ? null : m.id)}
                >
                  <span aria-hidden="true" className="aa">
                    Aa
                  </span>
                  <span className="lbl">{first(isOpen ? t('hideText') : t('showText'))}</span>
                </button>
              </div>
              {isOpen && <TextPanel t={t} m={m} canTranscribe={canTranscribe} onTranscribe={() => onTranscribe(m)} />}
            </li>
          );
        })}
      </ol>
    </main>
  );
}

function TextPanel({ t, m, canTranscribe, onTranscribe }: { t: T; m: Message; canTranscribe: boolean; onTranscribe: () => void }) {
  const busy = m.asr.status === 'pending' || m.ai?.status === 'pending';
  const hasAsr = m.asr.status === 'done';
  return (
    <div className="text-panel" aria-live="polite">
      {m.verified && (
        <section className="tp verified">
          <h3>{first(t('confirmed'))}</h3>
          <p>{m.verified.confirmedText}</p>
        </section>
      )}

      {m.interpretations.length > 0 && (
        <section className="tp ai">
          <h3>{first(t('aiGuess'))}</h3>
          {m.interpretations.map((c, i) => (
            <p key={i}>
              <em>{c.text}</em>
            </p>
          ))}
        </section>
      )}
      {m.ai?.status === 'abstained' && (
        <section className="tp ai">
          <h3>{first(t('aiUnsure'))}</h3>
          {m.ai.note && <p className="tp-note">{m.ai.note}</p>}
        </section>
      )}

      {hasAsr && (
        <section className="tp asr">
          <h3>{first(t('heard'))}</h3>
          <p>{(m.asr as { text: string }).text || '…'}</p>
        </section>
      )}

      {busy && <p className="tp-status">{first(t('working'))}</p>}

      {!busy && !hasAsr && (
        <section className="tp empty">
          <p>{first(t('noTextYet'))}</p>
          {(m.asr.status === 'failed' || m.asr.status === 'unavailable') && <p className="tp-note">{m.asr.reason}</p>}
          {canTranscribe && !m.audio.demo ? (
            <button type="button" className="tp-btn" onClick={onTranscribe}>
              {first(t('transcribe'))}
            </button>
          ) : (
            !m.audio.demo && <p className="tp-note">{first(t('asrOff'))}</p>
          )}
        </section>
      )}
      {!busy && m.ai?.status === 'failed' && (
        <section className="tp empty">
          <p className="tp-note">AI: {m.ai.note}</p>
          {canTranscribe && (
            <button type="button" className="tp-btn" onClick={onTranscribe}>
              {first(t('transcribe'))}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
