import { describe, expect, it } from 'vitest';
import { countryByCode, formatE164, guessCountry, press, toE164 } from './phone';

const typeAll = (keys: string[]) => keys.reduce(press, '');

describe('phone keypad', () => {
  it('accepts + only as first character', () => {
    expect(typeAll(['+', '3', '9'])).toBe('+39');
    expect(typeAll(['3', '+', '9'])).toBe('39');
    expect(typeAll(['+', '+'])).toBe('+');
  });

  it('delete removes last character, including a lone +', () => {
    expect(typeAll(['1', '2', 'del'])).toBe('1');
    expect(typeAll(['+', 'del'])).toBe('');
    expect(typeAll(['del'])).toBe('');
  });

  it('caps at 15 digits', () => {
    expect(typeAll(Array(20).fill('9')).length).toBe(15);
  });
});

describe('E.164 conversion', () => {
  it('Italian mobile with country selector', () => {
    expect(toE164('3331234567', countryByCode('IT'))).toBe('+393331234567');
  });
  it('Italian landline keeps leading 0', () => {
    expect(toE164('0612345678', countryByCode('IT'))).toBe('+390612345678');
  });
  it('UK drops trunk 0', () => {
    expect(toE164('07700900123', countryByCode('GB'))).toBe('+447700900123');
  });
  it('typed + ignores selected country', () => {
    expect(toE164('+819012345678', countryByCode('GB'))).toBe('+819012345678');
  });
  it('rejects too short / empty', () => {
    expect(toE164('', countryByCode('IT'))).toBeNull();
    expect(toE164('+', countryByCode('IT'))).toBeNull();
    expect(toE164('123', countryByCode('GB'))).toBeNull();
  });
  it('formats for display', () => {
    expect(formatE164('+393331234567')).toBe('+39 333 123 4567');
    expect(formatE164('+447700900123')).toBe('+44 770 090 0123');
  });
  it('guesses country from locale, defaults to Italy', () => {
    expect(guessCountry('en-GB')).toBe('GB');
    expect(guessCountry('ja')).toBe('IT');
    expect(guessCountry(undefined)).toBe('IT');
  });
});
