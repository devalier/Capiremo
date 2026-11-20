// The real home: four equal buttons filling the screen. People leads to the family voice
// messages; the other three open apps on the phone (two chosen by the caregiver).

import { useState } from 'react';
import { MAIL_URL, launch, launchAndWatch, resolveSlot, type AppSlot } from '../apps';
import type { T } from '../i18n';
import type { Contact, Draft } from '../types';
import { Big, Icon, Label } from '../components/ui';

interface Props {
  t: T;
  contacts: Contact[];
  slots: [AppSlot, AppSlot];
  unplayedTotal: number;
  pendingDraft: Draft | null;
  canUndo: boolean;
  onPeople: () => void;
  onOpenDraft: () => void;
  onUndo: () => void;
  onAdmin: () => void;
}

const first = (s: string) => s.split('\n')[0];

export function Home({ t, contacts, slots, unplayedTotal, pendingDraft, canUndo, onPeople, onOpenDraft, onUndo, onAdmin }: Props) {
  const [failed, setFailed] = useState<{ label: string; web: string | null } | null>(null);
  const draftFor = pendingDraft && (contacts.find((c) => c.id === pendingDraft.recipientId) ?? { name: pendingDraft.recipientId });
  const apps = slots.map(resolveSlot);

  async function open(label: string, url: string | null, web: string | null) {
    setFailed(null);
    if (!url) return setFailed({ label, web });
    const opened = await launchAndWatch(url);
    if (!opened) setFailed({ label, web });
  }

  return (
    <main className="screen home launcher">
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
      {failed && (
        <section className="banner warn" role="alert">
          <p>{first(t('couldNotOpen', { name: failed.label }))}</p>
          {failed.web && (
            <Big
              label={t('openWebsite')}
              variant="primary"
              size="m"
              onClick={() => {
                const w = failed.web!;
                setFailed(null);
                launch(w);
              }}
            />
          )}
          <Big label={t('ok')} variant="neutral" size="m" onClick={() => setFailed(null)} />
        </section>
      )}

      <div className="launch-grid">
        <button type="button" className="launch-tile people" onClick={onPeople} aria-label={first(t('people'))}>
          <span className="launch-icon" aria-hidden="true">👪</span>
          <span className="launch-label">
            <Label text={t('people')} />
          </span>
          {unplayedTotal > 0 && (
            <span className="badge">
              <Label text={t('new')} /> {unplayedTotal}
            </span>
          )}
        </button>
        <button type="button" className="launch-tile mail" onClick={() => void open(first(t('mail')), MAIL_URL, null)} aria-label={first(t('mail'))}>
          <span className="launch-icon" aria-hidden="true">✉️</span>
          <span className="launch-label">
            <Label text={t('mail')} />
          </span>
        </button>
        {apps.map((a, i) => (
          <button
            key={i}
            type="button"
            className={`launch-tile app${i}`}
            onClick={() => void open(a.label, a.url, a.web)}
            aria-label={a.label}
          >
            <span className="launch-icon" aria-hidden="true">{a.icon}</span>
            <span className="launch-label">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Admin: small, out of the way, but a full 48px target. Protected by a typed code. */}
      <button type="button" className="admin-gear" onClick={onAdmin} aria-label="Admin">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7Z" />
        </svg>
      </button>
    </main>
  );
}
