import type { T } from '../i18n';
import type { Contact, Draft } from '../types';
import { Avatar, Big, Icon, Label } from '../components/ui';

interface Props {
  t: T;
  contacts: Contact[];
  unplayed: (id: string) => number;
  pendingDraft: Draft | null;
  canUndo: boolean;
  onContact: (id: string) => void;
  onOpenDraft: () => void;
  onUndo: () => void;
  onCaregiver: () => void;
}

export function Home({ t, contacts, unplayed, pendingDraft, canUndo, onContact, onOpenDraft, onUndo, onCaregiver }: Props) {
  const draftFor = pendingDraft && contacts.find((c) => c.id === pendingDraft.recipientId);
  return (
    <main className="screen home">
      {draftFor && (
        <section className="banner warn" aria-live="polite">
          <p>
            <Label text={t('unsent', { name: draftFor.name })} />
          </p>
          <Big label={t('open')} variant="primary" size="m" onClick={onOpenDraft} />
        </section>
      )}
      {canUndo && !draftFor && (
        <section className="banner">
          <Big label={t('undo')} variant="neutral" size="m" icon={Icon.again} onClick={onUndo} />
        </section>
      )}
      <div className={`tiles ${contacts.length > 2 ? 'many' : ''}`}>
        {contacts.map((c) => {
          const n = unplayed(c.id);
          return (
            <button key={c.id} type="button" className="tile" onClick={() => onContact(c.id)} aria-label={c.name}>
              <Avatar contact={c} />
              <span className="tile-name">{c.name}</span>
              {n > 0 && (
                <span className="badge">
                  <Label text={t('new')} /> {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* Admin: small, out of the way, but a full 48px target. Protected by a typed code. */}
      <button type="button" className="admin-gear" onClick={onCaregiver} aria-label="Admin">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7Z" />
        </svg>
      </button>
    </main>
  );
}
