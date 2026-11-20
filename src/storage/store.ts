// On-device persistence. Interface + IndexedDB implementation + in-memory implementation (tests).

import type { Contact, Draft, Message, TrainingExample } from '../types';

export type LabelLanguage = 'en' | 'it' | 'both';

export type AsrEngine = 'off' | 'server' | 'device';
export type DeviceModel = 'whisper-base' | 'whisper-small';

export interface AiSettings {
  /** 'off' = audio only. 'server' = OpenAI via our proxy. 'device' = Whisper running on this phone. */
  engine: AsrEngine;
  serverUrl: string;
  /** Family access token for our proxy (not a provider key). */
  token: string;
  /** Ask Claude (via the proxy) for interpretations of the speaker's messages. */
  interpret: boolean;
  deviceModel: DeviceModel;
}

export interface Settings {
  labels: LabelLanguage;
  sounds: boolean;
  speak: boolean;
  forceDemoAudio: boolean;
  ai: AiSettings;
  /** Phrases offered in the Train screen; null = built-in defaults. */
  phrases: string[] | null;
}

export const defaultAi: AiSettings = { engine: 'off', serverUrl: '', token: '', interpret: true, deviceModel: 'whisper-base' };

export const defaultSettings: Settings = { labels: 'en', sounds: true, speak: false, forceDemoAudio: false, ai: defaultAi, phrases: null };

const contact = (id: string, name: string, order: number): Contact => ({
  id,
  name,
  photo: null,
  order,
  phone: null,
  country: null,
});

export const defaultContacts: Contact[] = [
  contact('paul', 'Paul', 0),
  contact('francesca', 'Francesca', 1),
  contact('izumi', 'Izumi', 2),
  contact('dan', 'Dan', 3),
];

export type DraftSlot = 'current' | 'discarded';

export interface Store {
  getMessages(): Promise<Message[]>;
  putMessage(m: Message): Promise<void>;
  getDraft(slot: DraftSlot): Promise<Draft | null>;
  putDraft(slot: DraftSlot, d: Draft | null): Promise<void>;
  getSettings(): Promise<Settings>;
  putSettings(s: Settings): Promise<void>;
  getContacts(): Promise<Contact[]>;
  putContacts(c: Contact[]): Promise<void>;
  getTraining(): Promise<TrainingExample[]>;
  putTraining(e: TrainingExample): Promise<void>;
  deleteTraining(id: string): Promise<void>;
  /** Confirmed words and names the speaker uses (human-entered). */
  getVocabulary(): Promise<string[]>;
  putVocabulary(v: string[]): Promise<void>;
  wipe(): Promise<void>;
}

export function memoryStore(): Store {
  const messages = new Map<string, Message>();
  const drafts = new Map<DraftSlot, Draft>();
  const training = new Map<string, TrainingExample>();
  let vocabulary: string[] = [];
  let settings = defaultSettings;
  let contacts = defaultContacts;
  return {
    async getTraining() {
      return [...training.values()];
    },
    async putTraining(e) {
      training.set(e.id, e);
    },
    async deleteTraining(id) {
      training.delete(id);
    },
    async getVocabulary() {
      return vocabulary;
    },
    async putVocabulary(v) {
      vocabulary = v;
    },
    async getMessages() {
      return [...messages.values()];
    },
    async putMessage(m) {
      messages.set(m.id, m);
    },
    async getDraft(slot) {
      return drafts.get(slot) ?? null;
    },
    async putDraft(slot, d) {
      if (d) drafts.set(slot, d);
      else drafts.delete(slot);
    },
    async getSettings() {
      return settings;
    },
    async putSettings(s) {
      settings = s;
    },
    async getContacts() {
      return contacts;
    },
    async putContacts(c) {
      contacts = c;
    },
    async wipe() {
      messages.clear();
      drafts.clear();
      training.clear();
      vocabulary = [];
      settings = defaultSettings;
      contacts = defaultContacts;
    },
  };
}

const DB_NAME = 'capiremo';
const DB_VERSION = 2;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('messages')) db.createObjectStore('messages', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('training')) db.createObjectStore('training', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function indexedDbStore(): Store {
  const dbp = openDb();
  async function tx(store: 'messages' | 'kv' | 'training', mode: IDBTransactionMode) {
    return (await dbp).transaction(store, mode).objectStore(store);
  }
  async function kvGet<T>(key: string): Promise<T | undefined> {
    return req((await tx('kv', 'readonly')).get(key)) as Promise<T | undefined>;
  }
  async function kvPut(key: string, value: unknown) {
    const s = await tx('kv', 'readwrite');
    if (value === null) await req(s.delete(key));
    else await req(s.put(value, key));
  }
  return {
    async getMessages() {
      return req((await tx('messages', 'readonly')).getAll()) as Promise<Message[]>;
    },
    async putMessage(m) {
      await req((await tx('messages', 'readwrite')).put(m));
    },
    async getDraft(slot) {
      return (await kvGet<Draft>(`draft:${slot}`)) ?? null;
    },
    async putDraft(slot, d) {
      await kvPut(`draft:${slot}`, d);
    },
    async getSettings() {
      const stored = (await kvGet<Partial<Settings>>('settings')) ?? {};
      return { ...defaultSettings, ...stored, ai: { ...defaultAi, ...(stored.ai ?? {}) } };
    },
    async putSettings(s) {
      await kvPut('settings', s);
    },
    async getContacts() {
      return (await kvGet<Contact[]>('contacts:v2')) ?? defaultContacts;
    },
    async putContacts(c) {
      await kvPut('contacts:v2', c);
    },
    async getTraining() {
      return req((await tx('training', 'readonly')).getAll()) as Promise<TrainingExample[]>;
    },
    async putTraining(e) {
      await req((await tx('training', 'readwrite')).put(e));
    },
    async deleteTraining(id) {
      await req((await tx('training', 'readwrite')).delete(id));
    },
    async getVocabulary() {
      return (await kvGet<string[]>('vocabulary')) ?? [];
    },
    async putVocabulary(v) {
      await kvPut('vocabulary', v);
    },
    async wipe() {
      await req((await tx('training', 'readwrite')).clear());
      await req((await tx('messages', 'readwrite')).clear());
      await req((await tx('kv', 'readwrite')).clear());
    },
  };
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
