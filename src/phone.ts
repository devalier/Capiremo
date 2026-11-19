// Phone number entry helpers. Produces E.164 ("+393331234567").
// Deliberately small: no full numbering-plan validation, just length and digit checks.

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  dial: string; // without '+'
  flag: string;
  /** Leading trunk '0' is part of the international number (Italy). */
  keepLeadingZero?: boolean;
}

export const COUNTRIES: Country[] = [
  { code: 'IT', name: 'Italia', dial: '39', flag: '🇮🇹', keepLeadingZero: true },
  { code: 'GB', name: 'United Kingdom', dial: '44', flag: '🇬🇧' },
  { code: 'US', name: 'United States / Canada', dial: '1', flag: '🇺🇸' },
  { code: 'JP', name: '日本 Japan', dial: '81', flag: '🇯🇵' },
  { code: 'IE', name: 'Ireland', dial: '353', flag: '🇮🇪' },
  { code: 'FR', name: 'France', dial: '33', flag: '🇫🇷' },
  { code: 'DE', name: 'Deutschland', dial: '49', flag: '🇩🇪' },
  { code: 'ES', name: 'España', dial: '34', flag: '🇪🇸' },
  { code: 'CH', name: 'Schweiz / Suisse', dial: '41', flag: '🇨🇭' },
  { code: 'NL', name: 'Nederland', dial: '31', flag: '🇳🇱' },
  { code: 'AU', name: 'Australia', dial: '61', flag: '🇦🇺' },
];

export function countryByCode(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

export function guessCountry(lang: string | undefined): string {
  const region = lang?.split('-')[1]?.toUpperCase();
  return COUNTRIES.some((c) => c.code === region) ? region! : 'IT';
}

export const MAX_DIGITS = 15; // E.164 limit, including country code

/** Apply one keypad press to the typed string. '+' is only accepted as the first character. */
export function press(typed: string, key: string): string {
  if (key === 'del') return typed.slice(0, -1);
  if (key === '+') return typed === '' ? '+' : typed;
  if (!/^\d$/.test(key)) return typed;
  if (typed.replace(/\D/g, '').length >= MAX_DIGITS) return typed;
  return typed + key;
}

/** Full international number from what was typed, or null if not plausible yet. */
export function toE164(typed: string, country: Country): string | null {
  let digits: string;
  if (typed.startsWith('+')) {
    digits = typed.slice(1);
  } else {
    let national = typed;
    if (!country.keepLeadingZero) national = national.replace(/^0/, '');
    digits = country.dial + national;
  }
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length < 8 || digits.length > MAX_DIGITS) return null;
  if (digits.startsWith('0')) return null;
  return `+${digits}`;
}

/** Readable grouping for display only: "333 123 4567". */
export function group(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length <= 4) return d;
  const head = d.slice(0, -4);
  const tail = d.slice(-4);
  return `${head.replace(/(\d{3})(?=\d)/g, '$1 ')} ${tail}`;
}

/** Display an E.164 number: "+39 333 123 4567" (country code split when it matches the list). */
export function formatE164(e164: string): string {
  const d = e164.replace(/\D/g, '');
  const c = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((x) => d.startsWith(x.dial));
  return c ? `+${c.dial} ${group(d.slice(c.dial.length))}` : `+${group(d)}`;
}
