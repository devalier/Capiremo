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
  onPlay: (m: Message) => void;
}

/** Newest first, so the latest message is always on screen without scrolling. */
export function Messages({ t, locale, contact, messages, playing, playFailed, onPlay }: Props) {
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
          return (
            <li key={m.id} className={`msg ${mine ? 'mine' : 'theirs'}`}>
              <button
                type="button"
                className={`msg-play ${isPlaying ? 'on' : ''}`}
                onClick={() => onPlay(m)}
                aria-label={`${isPlaying ? 'Stop' : 'Play'}: ${mine ? t('you').split('\n')[0] : contact.name}, ${formatWhen(m.createdAt, t, locale)}`}
              >
                <span className="msg-icon" aria-hidden="true">
                  {isPlaying ? Icon.stop : Icon.play}
                </span>
                <span className="msg-meta">
                  <span className="msg-from">
                    {mine ? t('you').split('\n')[0] : contact.name}
                    {isNew && <span className="badge small">{t('new').split('\n')[0]}</span>}
                  </span>
                  <span className="msg-when">{formatWhen(m.createdAt, t, locale)}</span>
                  {m.audio.demo && <span className="msg-demo">demo sound</span>}
                  {playFailed === m.id && <span className="msg-demo">playback failed</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
