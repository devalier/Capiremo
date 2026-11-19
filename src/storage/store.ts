// On-device persistence. Interface + IndexedDB implementation + in-memory implementation (tests).

import type { Contact, Draft, Message } from '../types';

export type LabelLanguage = 'en' | 'it' | 'both';

export interface Settings {
  labels: LabelLanguage;
  sounds: boolean;
  speak: boolean;
  forceDemoAudio: boolean;
}

export const defaultSettings: Settings = { labels: 'en', sounds: true, speak: false, forceDemoAudio: false };

export const defaultContacts: Contact[] = [
  { id: 'paul', name: 'Paul', photo: null, order: 0 },
  { id: 'stefania', name: 'Stefania', photo: null, order: 1 },
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
  wipe(): Promise<void>;
}

export function memoryStore(): Store {
  const messages = new Map<string, Message>();
  const drafts = new Map<DraftSlot, Draft>();
  let settings = defaultSettings;
  let contacts = defaultContacts;
  return {
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
      settings = defaultSettings;
      contacts = defaultContacts;
    },
  };
}

const DB_NAME = 'capiremo';
const DB_VERSION = 1;

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
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function indexedDbStore(): Store {
  const dbp = openDb();
  async function tx(store: 'messages' | 'kv', mode: IDBTransactionMode) {
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
      return { ...defaultSettings, ...((await kvGet<Settings>('settings')) ?? {}) };
    },
    async putSettings(s) {
      await kvPut('settings', s);
    },
    async getContacts() {
      return (await kvGet<Contact[]>('contacts')) ?? defaultContacts;
    },
    async putContacts(c) {
      await kvPut('contacts', c);
    },
    async wipe() {
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
