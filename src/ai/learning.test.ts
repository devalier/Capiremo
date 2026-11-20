import { describe, expect, it } from 'vitest';
import { messageFromDraft, withAsr, withLearningConsent, withTypedCorrection } from '../state/messages';
import { defaultContacts } from '../storage/store';
import type { AsrResult, Draft, TrainingExample } from '../types';
import { learningPairs, missedWords, parseVocabulary, recogniserPrompt, selectExamples } from './learning';
import { wordAccuracy, words } from './score';

const audio = { data: new ArrayBuffer(4), mimeType: 'audio/mp4', durationMs: 1000, demo: false };
const done = (text: string): AsrResult => ({ status: 'done', text, detectedLanguages: [], provider: 't' });
const ex = (id: string, heard: string | null, said: string, at = 0): TrainingExample => ({
  id,
  createdAt: at,
  audio,
  mode: 'phrase',
  confirmedText: said,
  asr: heard === null ? { status: 'not-requested' } : done(heard),
});
const draft: Draft = { id: 'd', recipientId: 'paul', createdAt: 0, audio, interrupted: false };

describe('word accuracy', () => {
  it('normalises case, punctuation and accents-preserving tokens', () => {
    expect(words("Ciao, Paul! Com'è?")).toEqual(['ciao', 'paul', "com'è"]);
    expect(wordAccuracy('Ciao Paul come stai', 'ciao paul come stai.')).toBe(1);
  });
  it('counts substitutions, deletions and insertions', () => {
    expect(wordAccuracy('ciao paul come stai', 'chow paul come')).toBe(0.5);
    expect(wordAccuracy('a b', 'a b c d e f')).toBe(0); // floored
    expect(wordAccuracy('', '')).toBe(1);
  });
});

describe('learning material', () => {
  it('uses only confirmed training and consented verified message corrections', () => {
    const m1 = withAsr(messageFromDraft(draft, 'm1', 'saved-on-device'), done('pole come'));
    const verifiedNoConsent = withTypedCorrection(m1, 'Paul come', 'x');
    const verifiedConsent = withLearningConsent(withTypedCorrection({ ...m1, id: 'm2' }, 'Paul vieni', 'x'), true);
    const pairs = learningPairs([ex('t1', 'chow', 'ciao'), ex('t2', null, 'untranscribed')], [m1, verifiedNoConsent, verifiedConsent]);
    expect(pairs.map((p) => p.id).sort()).toEqual(['m2', 't1']);
  });

  it('selects newest first, leaves one out, caps count', () => {
    const pairs = learningPairs([ex('a', 'x', 'A', 1), ex('b', 'y', 'B', 3), ex('c', 'z', 'C', 2)], []);
    expect(selectExamples(pairs).map((e) => e.meant)).toEqual(['B', 'C', 'A']);
    expect(selectExamples(pairs, 'b').map((e) => e.meant)).toEqual(['C', 'A']);
    expect(selectExamples(pairs, undefined, 1)).toHaveLength(1);
  });

  it('finds words the recogniser keeps missing', () => {
    const pairs = learningPairs(
      [ex('a', 'chow pole', 'ciao Paul', 1), ex('b', 'chow francis car', 'ciao Francesca', 2), ex('c', 'the dog', 'the dog', 3)],
      [],
    );
    expect(missedWords(pairs)).toEqual(['ciao', 'francesca', 'paul']);
  });

  it('recogniser prompt has names, vocabulary, missed words, then confirmed sentences, within limit', () => {
    const pairs = learningPairs([ex('a', 'chow pole', 'Ciao Paul, come stai?', 1)], []);
    const prompt = recogniserPrompt(defaultContacts, ['Torino', 'Duomo'], pairs, 900);
    expect(prompt.startsWith('Paul, Francesca, Izumi, Dan, Torino, Duomo, ciao')).toBe(true);
    expect(prompt).toContain('Ciao Paul, come stai?');
    expect(recogniserPrompt(defaultContacts, [], pairs, 20).length).toBeLessThanOrEqual(20);
  });

  it('parses vocabulary lists', () => {
    expect(parseVocabulary('Torino, Duomo\n\nnonna;Torino')).toEqual(['Torino', 'Duomo', 'nonna']);
  });
});
