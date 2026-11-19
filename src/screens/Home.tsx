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
      <div className="tiles">
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
      <button type="button" className="caregiver-link" onClick={onCaregiver}>
        Caregiver
      </button>
    </main>
  );
}
