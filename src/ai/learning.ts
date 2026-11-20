// What "training" feeds into recognition and interpretation. Pure functions, unit-tested.
// Only human-confirmed material is ever used:
//   - Train-screen recordings (confirmed at recording time)
//   - message corrections a recipient confirmed AND allowed for learning
// Never machine guesses.

import type { Contact, Message, TrainingExample } from '../types';
import { SPEAKER_ID } from '../types';
import { words } from './score';

export interface LearningPair {
  id: string;
  heard: string;
  meant: string;
  at: number;
}

export const MAX_EXAMPLES = 30;

export function learningPairs(training: TrainingExample[], messages: Message[]): LearningPair[] {
  const fromTraining = training
    .filter((e) => e.asr.status === 'done' && e.confirmedText.trim())
    .map((e) => ({ id: e.id, heard: (e.asr as { text: string }).text, meant: e.confirmedText, at: e.createdAt }));
  const fromMessages = messages
    .filter((m) => m.senderId === SPEAKER_ID && m.verified?.usableForLearning && m.asr.status === 'done')
    .map((m) => ({ id: m.id, heard: (m.asr as { text: string }).text, meant: m.verified!.confirmedText, at: m.createdAt }));
  return [...fromTraining, ...fromMessages].filter((p) => p.heard.trim());
}

/** Most recent pairs first, excluding one id (leave-one-out when measuring on that example). */
export function selectExamples(pairs: LearningPair[], excludeId?: string, max = MAX_EXAMPLES) {
  return pairs
    .filter((p) => p.id !== excludeId)
    .sort((a, b) => b.at - a.at)
    .slice(0, max)
    .map(({ heard, meant }) => ({ heard: heard.slice(0, 600), meant: meant.slice(0, 600) }));
}

/** Words that appear in confirmed texts but the recogniser keeps missing: the most useful hints. */
export function missedWords(pairs: LearningPair[], limit = 40): string[] {
  const count = new Map<string, number>();
  for (const p of pairs) {
    const heard = new Set(words(p.heard));
    for (const w of new Set(words(p.meant))) {
      if (w.length < 3 || heard.has(w)) continue;
      count.set(w, (count.get(w) ?? 0) + 1);
    }
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([w]) => w);
}

/**
 * Prompt for the speech recogniser: names + confirmed vocabulary + frequently missed words + a few
 * confirmed sentences (recognisers use the prompt as a style/vocabulary hint, not an instruction).
 */
export function recogniserPrompt(contacts: Contact[], vocabulary: string[], pairs: LearningPair[], maxChars = 900): string {
  const names = contacts.map((c) => c.name.trim()).filter(Boolean);
  const vocab = [...new Set([...names, ...vocabulary.map((v) => v.trim()).filter(Boolean), ...missedWords(pairs)])];
  let out = vocab.join(', ');
  const sentences = [...pairs].sort((a, b) => b.at - a.at).map((p) => p.meant.trim());
  for (const s of sentences) {
    const next = out ? `${out}. ${s}` : s;
    if (next.length > maxChars) break;
    out = next;
  }
  return out.slice(0, maxChars);
}

export function parseVocabulary(text: string): string[] {
  return [...new Set(text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 150);
}
