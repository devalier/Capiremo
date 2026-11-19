// Full-screen phone number entry: country selector, number display, giant keypad.
// No OS keyboard. Only taps; no long-press or swipe.

import { useState } from 'react';
import type { T } from '../i18n';
import { COUNTRIES, countryByCode, group, guessCountry, press, toE164 } from '../phone';
import type { Contact } from '../types';
import { Big, Icon, Label } from '../components/ui';

interface Props {
  t: T;
  contact: Contact;
  onSave: (phone: string, country: string) => void;
  onCancel: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0', 'del'];

export function PhoneSetup({ t, contact, onSave, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const [countryCode, setCountryCode] = useState(contact.country ?? guessCountry(navigator.language));
  const [picking, setPicking] = useState(false);
  const country = countryByCode(countryCode);
  const international = typed.startsWith('+');
  const e164 = toE164(typed, country);

  if (picking) {
    return (
      <main className="screen phone-setup picking">
        <h1 className="title">
          <Label text={t('chooseCountry')} />
        </h1>
        <ul className="country-list">
          {COUNTRIES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                className={`country ${c.code === countryCode ? 'on' : ''}`}
                onClick={() => {
                  setCountryCode(c.code);
                  setPicking(false);
                }}
              >
                <span className="flag" aria-hidden="true">
                  {c.flag}
                </span>
                <span className="cname">{c.name}</span>
                <span className="dial">+{c.dial}</span>
              </button>
            </li>
          ))}
        </ul>
        <Big label={t('cancel')} variant="quiet" size="m" icon={Icon.x} onClick={() => setPicking(false)} />
      </main>
    );
  }

  return (
    <main className="screen phone-setup">
      <h1 className="phone-title">
        <Label text={t('phoneFor', { name: contact.name })} />
      </h1>
      <div className="phone-head">
        <button
          type="button"
          className="country-btn"
          onClick={() => setPicking(true)}
          disabled={international}
          aria-label={`${t('chooseCountry').split('\n')[0]}: ${country.name} +${country.dial}`}
        >
          <span className="flag" aria-hidden="true">
            {international ? '🌐' : country.flag}
          </span>
          <span className="dial">{international ? '+' : `+${country.dial}`}</span>
          <span className="caret" aria-hidden="true">
            ▾
          </span>
        </button>
        <output className={`phone-display ${typed ? '' : 'empty'}`} aria-live="polite" data-testid="phone-display">
          {international ? `+${group(typed.slice(1))}` : group(typed) || '—'}
        </output>
      </div>
      <div className="keypad" role="group" aria-label="Keypad">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`key ${k === 'del' ? 'del' : ''} ${k === '+' ? 'plus' : ''}`}
            onClick={() => setTyped((s) => press(s, k))}
            aria-label={k === 'del' ? t('deleteDigit').split('\n')[0] : k}
            disabled={k === '+' && typed !== ''}
          >
            {k === 'del' ? <DelIcon /> : k}
          </button>
        ))}
      </div>
      <div className="row">
        <Big label={t('cancel')} variant="neutral" size="m" icon={Icon.x} onClick={onCancel} />
        <Big
          label={t('save')}
          variant="go"
          size="m"
          icon={Icon.check}
          disabled={!e164}
          onClick={() => e164 && onSave(e164, countryCode)}
        />
      </div>
    </main>
  );
}

function DelIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 5h12v14H8l-6-7 6-7Z" />
      <path d="m11 9 6 6m0-6-6 6" />
    </svg>
  );
}
