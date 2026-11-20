import type { LabelLanguage } from './storage/store';

const strings = {
  talk: { en: 'TALK', it: 'PARLA' },
  talkTo: { en: 'Talk to {name}', it: 'Parla con {name}' },
  stop: { en: 'STOP', it: 'STOP' },
  send: { en: 'SEND', it: 'INVIA' },
  recordAgain: { en: 'RECORD AGAIN', it: 'REGISTRA DI NUOVO' },
  cancel: { en: 'CANCEL', it: 'ANNULLA' },
  home: { en: 'HOME', it: 'INIZIO' },
  messages: { en: 'MESSAGES', it: 'MESSAGGI' },
  play: { en: 'PLAY', it: 'ASCOLTA' },
  stopPlaying: { en: 'STOP', it: 'STOP' },
  listen: { en: 'LISTEN', it: 'ASCOLTA' },
  recording: { en: 'Recording…', it: 'Sto registrando…' },
  recordingFor: { en: 'Message for {name}', it: 'Messaggio per {name}' },
  pressStop: { en: 'Press STOP when you are finished', it: 'Premi STOP quando hai finito' },
  starting: { en: 'Getting the microphone ready…', it: 'Preparo il microfono…' },
  finishing: { en: 'Saving…', it: 'Salvo…' },
  reviewTitle: { en: 'Your message to {name}', it: 'Il tuo messaggio per {name}' },
  reviewHint: { en: 'Listen, then press SEND', it: 'Ascolta, poi premi INVIA' },
  noText: { en: 'Your voice will be sent.', it: 'Verrà inviata la tua voce.' },
  interrupted: {
    en: 'The recording was interrupted. What was recorded is kept here.',
    it: 'La registrazione è stata interrotta. Quello registrato è qui.',
  },
  maxReached: { en: 'The recording reached its maximum length.', it: 'La registrazione ha raggiunto la durata massima.' },
  sending: { en: 'Sending…', it: 'Invio…' },
  sent: { en: 'Sent to {name}', it: 'Inviato a {name}' },
  sentLocal: {
    en: 'Saved on this phone (prototype: not delivered yet)',
    it: 'Salvato su questo telefono (prototipo: non ancora consegnato)',
  },
  confirmDiscard: { en: 'Delete this recording?', it: 'Cancellare questa registrazione?' },
  yesDelete: { en: 'YES, DELETE', it: 'SÌ, CANCELLA' },
  noKeep: { en: 'NO, KEEP IT', it: 'NO, TIENILA' },
  undo: { en: 'BRING BACK DELETED RECORDING', it: 'RECUPERA LA REGISTRAZIONE CANCELLATA' },
  unsent: { en: 'Unsent message for {name}', it: 'Messaggio non inviato per {name}' },
  open: { en: 'OPEN', it: 'APRI' },
  you: { en: 'You', it: 'Tu' },
  new: { en: 'NEW', it: 'NUOVO' },
  noMessages: { en: 'No messages yet', it: 'Nessun messaggio' },
  demo: { en: 'DEMO SOUND — not a real recording', it: 'SUONO DI PROVA — non è una registrazione' },
  errPermission: {
    en: 'The microphone is not allowed. Ask a family member to allow it in Settings.',
    it: 'Il microfono non è permesso. Chiedi a un familiare di attivarlo nelle Impostazioni.',
  },
  errNoMic: { en: 'No microphone was found.', it: 'Nessun microfono trovato.' },
  errUnsupported: {
    en: 'This browser cannot record sound here.',
    it: 'Questo browser non può registrare qui.',
  },
  errRecording: { en: 'The recording did not work.', it: 'La registrazione non ha funzionato.' },
  errSend: {
    en: 'Not sent. Your message is kept. Try again.',
    it: 'Non inviato. Il messaggio è salvato. Riprova.',
  },
  tryAgain: { en: 'TRY AGAIN', it: 'RIPROVA' },
  useDemo: { en: 'USE DEMO SOUND', it: 'USA SUONO DI PROVA' },
  today: { en: 'Today', it: 'Oggi' },
  yesterday: { en: 'Yesterday', it: 'Ieri' },
  seconds: { en: '{n} seconds', it: '{n} secondi' },
  phoneFor: { en: 'Phone number for {name}', it: 'Numero di telefono di {name}' },
  chooseCountry: { en: 'Choose country', it: 'Scegli il paese' },
  save: { en: 'SAVE', it: 'SALVA' },
  deleteDigit: { en: 'Delete last digit', it: 'Cancella ultima cifra' },
  people: { en: 'PEOPLE', it: 'PERSONE' },
  mail: { en: 'MAIL', it: 'POSTA' },
  couldNotOpen: { en: 'Could not open {name}', it: 'Impossibile aprire {name}' },
  openWebsite: { en: 'OPEN WEBSITE', it: 'APRI IL SITO' },
  ok: { en: 'OK', it: 'OK' },
  showText: { en: 'TEXT', it: 'TESTO' },
  hideText: { en: 'HIDE TEXT', it: 'NASCONDI' },
  transcribe: { en: 'MAKE TEXT', it: 'CREA TESTO' },
  working: { en: 'Working…', it: 'Sto lavorando…' },
  heard: { en: 'Machine heard', it: 'Il computer ha sentito' },
  aiGuess: { en: 'AI guess — may be wrong', it: 'Ipotesi AI — può sbagliare' },
  aiUnsure: { en: 'AI is not sure what was meant', it: "L'AI non è sicura del significato" },
  confirmed: { en: 'Confirmed by family', it: 'Confermato dalla famiglia' },
  noTextYet: { en: 'No text yet', it: 'Ancora nessun testo' },
  asrOff: { en: 'Speech-to-text is off', it: 'Trascrizione disattivata' },
} as const;

export type StringKey = keyof typeof strings;

export function makeT(lang: LabelLanguage) {
  return function t(key: StringKey, vars: Record<string, string | number> = {}): string {
    const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
    const e = strings[key];
    if (lang === 'both' && e.en !== e.it) return `${fill(e.en)}\n${fill(e.it)}`;
    return fill(lang === 'it' ? e.it : e.en);
  };
}

export type T = ReturnType<typeof makeT>;

export function speechLang(lang: LabelLanguage) {
  return lang === 'it' ? 'it-IT' : 'en-GB';
}

export function formatWhen(ts: number, t: T, locale: string): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const firstLine = (s: string) => s.split('\n')[0];
  if (days === 0) return `${firstLine(t('today'))} ${time}`;
  if (days === 1) return `${firstLine(t('yesterday'))} ${time}`;
  return `${d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })} ${time}`;
}
