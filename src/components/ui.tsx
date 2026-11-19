import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Contact } from '../types';

/** Renders a label that may contain a second-language line ("TALK\nPARLA"). */
export function Label({ text }: { text: string }) {
  const [first, ...rest] = text.split('\n');
  return (
    <>
      <span className="l1">{first}</span>
      {rest.map((r) => (
        <span key={r} className="l2">
          {r}
        </span>
      ))}
    </>
  );
}

type Variant = 'primary' | 'go' | 'stop' | 'neutral' | 'danger' | 'quiet';

export function Big({
  label,
  variant = 'neutral',
  icon,
  size = 'l',
  ...rest
}: { label: string; variant?: Variant; icon?: ReactNode; size?: 'xl' | 'l' | 'm' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`big ${variant} size-${size}`} aria-label={label.replace('\n', ' / ')} {...rest}>
      {icon && <span className="icon" aria-hidden="true">{icon}</span>}
      <span className="text">
        <Label text={label} />
      </span>
    </button>
  );
}

export function Avatar({ contact, size = 'l' }: { contact: Contact; size?: 'l' | 'm' }) {
  const initials = contact.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return contact.photo ? (
    <img className={`avatar ${size}`} src={contact.photo} alt="" />
  ) : (
    <span className={`avatar ${size} initials`} aria-hidden="true">
      {initials}
    </span>
  );
}

export const Icon = {
  mic: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
    </svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M7 4.5v15l13-7.5L7 4.5Z" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M2.5 20.5 22 12 2.5 3.5 2.5 10l13 2-13 2v6.5Z" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3L12 3Z" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M4 5h16v3H4V5Zm0 5.5h16v3H4v-3ZM4 16h16v3H4v-3Z" />
    </svg>
  ),
  again: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />
    </svg>
  ),
};
