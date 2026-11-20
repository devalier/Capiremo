import { describe, expect, it } from 'vitest';
import { memoryStore } from '../storage/store';
import type { Draft, InterpretationCandidate, Message } from '../types';
import { SPEAKER_ID } from '../types';
import {
  conversation,
  learningExamples,
  messageFromDraft,
  unplayedFrom,
  withAsr,
  withFeedback,
  withInterpretations,
  withLearningConsent,
  withSuggestionConfirmed,
  withTypedCorrection,
} from './messages';
import { synthWav } from '../audio/wav';

const draft: Draft = {
  id: 'd',
  recipientId: 'paul',
  createdAt: 0,
  audio: { data: new ArrayBuffer(8), mimeType: 'audio/mp4', durationMs: 2000, demo: false },
  interrupted: false,
};

const cand = (text: string): InterpretationCandidate => ({
  text,
  status: 'unverified',
  uncertaintyNotes: ['mixed Italian-English'],
  provider: 'test',
  createdAt: 0,
});

const base = () =>
  withInterpretations(
    withAsr(messageFromDraft(draft, 'm1', 'saved-on-device'), {
      status: 'done',
      text: 'example transcript',
      detectedLanguages: ['it', 'en'],
      provider: 'test',
    }),
    [cand('A'), cand('B')],
  );

describe('message model', () => {
  it('a new message always carries its audio and no text claims', () => {
    const m = messageFromDraft(draft, 'm1', 'saved-on-device');
    expect(m.audio).toBe(draft.audio);
    expect(m.asr.status).toBe('not-requested');
    expect(m.interpretations).toEqual([]);
    expect(m.verified).toBeNull();
  });

  it('keeps at most two suggestions and forces them unverified', () => {
    const forged = { ...cand('C'), status: 'verified' } as unknown as InterpretationCandidate;
    const m = withInterpretations(messageFromDraft(draft, 'm', 'saved-on-device'), [forged, cand('D'), cand('E'), cand('  ')]);
    expect(m.interpretations.map((c) => c.text)).toEqual(['C', 'D']);
    expect(m.interpretations.every((c) => c.status === 'unverified')).toBe(true);
  });

  it('feedback does not alter ASR text or the suggestion, and does not create a verified correction', () => {
    const m = base();
    const fb = withFeedback(m, 0, 'incorrect');
    expect(fb.asr).toEqual(m.asr);
    expect(fb.interpretations).toEqual(m.interpretations);
    expect(fb.verified).toBeNull();
    expect(fb.interpretationFeedback[0]).toBe('incorrect');
  });

  it('feedback on a non-existent candidate is ignored', () => {
    const m = base();
    expect(withFeedback(m, 5, 'correct')).toBe(m);
  });

  it('confirming a suggestion records a human verification, separate from the suggestion', () => {
    const m = withSuggestionConfirmed(base(), 1, 'paul');
    expect(m.verified).toMatchObject({ confirmedText: 'B', verifierId: 'paul', method: 'recipient-marked-suggestion-correct' });
    expect(m.interpretations[1].status).toBe('unverified');
    expect(m.asr).toEqual(base().asr);
  });

  it('typed correction ignores empty text and never assumes speaker approval', () => {
    expect(withTypedCorrection(base(), '   ', 'paul').verified).toBeNull();
    const m = withTypedCorrection(base(), ' Real words ', 'paul');
    expect(m.verified).toMatchObject({ confirmedText: 'Real words', speakerApproved: null, usableForLearning: false });
  });

  it('only consented, verified corrections become learning examples', () => {
    const unverified = base();
    const verifiedNoConsent = withTypedCorrection({ ...base(), id: 'm2' }, 'x', 'paul');
    const verifiedConsent = withLearningConsent(withTypedCorrection({ ...base(), id: 'm3' }, 'y', 'paul'), true);
    expect(learningExamples([unverified, verifiedNoConsent, verifiedConsent])).toEqual([{ audioMessageId: 'm3', text: 'y' }]);
    expect(withLearningConsent(unverified, true).verified).toBeNull();
  });

  it('conversation filters by contact, newest first; unplayed counts only incoming', () => {
    const mk = (id: string, from: string, to: string, at: number, played = false): Message => ({
      ...messageFromDraft(draft, id, 'saved-on-device'),
      senderId: from,
      recipientId: to,
      createdAt: at,
      playedByRecipient: played,
    });
    const ms = [
      mk('a', SPEAKER_ID, 'paul', 1),
      mk('b', 'paul', SPEAKER_ID, 3),
      mk('c', 'dan', SPEAKER_ID, 2),
      mk('d', 'paul', SPEAKER_ID, 4, true),
    ];
    expect(conversation(ms, 'paul').map((m) => m.id)).toEqual(['d', 'b', 'a']);
    expect(unplayedFrom(ms, 'paul')).toBe(1);
    expect(unplayedFrom(ms, 'dan')).toBe(1);
  });
});

describe('memory store', () => {
  it('round-trips drafts and messages, wipe clears', async () => {
    const s = memoryStore();
    await s.putDraft('current', draft);
    expect(await s.getDraft('current')).toBe(draft);
    await s.putDraft('current', null);
    expect(await s.getDraft('current')).toBeNull();
    await s.putMessage(base());
    expect(await s.getMessages()).toHaveLength(1);
    await s.wipe();
    expect(await s.getMessages()).toHaveLength(0);
  });
});

describe('demo audio', () => {
  it('produces a valid PCM WAV of the requested length', () => {
    const buf = synthWav(1500, 16000);
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(40, true)).toBe(1500 * 16 * 2);
    expect(buf.byteLength).toBe(44 + 1500 * 16 * 2);
  });
});
