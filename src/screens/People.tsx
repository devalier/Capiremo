import type { T } from '../i18n';
import type { Contact } from '../types';
import { Avatar, Label } from '../components/ui';

interface Props {
  t: T;
  contacts: Contact[];
  unplayed: (id: string) => number;
  onContact: (id: string) => void;
}

export function People({ t, contacts, unplayed, onContact }: Props) {
  return (
    <main className="screen people">
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
    </main>
  );
}
