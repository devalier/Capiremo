// Pure message operations. Layer-separation rules enforced here:
//  - Machine interpretations are always 'unverified'.
//  - Feedback on a suggestion never rewrites the ASR text or the suggestion itself.
//  - A verified correction only exists when a human explicitly confirms wording.
//  - Learning use is opt-in per correction.

import type {
  AsrResult,
  Draft,
  InterpretationCandidate,
  InterpretationFeedback,
  Message,
  MessageStatus,
  UserId,
} from '../types';
import { SPEAKER_ID } from '../types';

export function messageFromDraft(draft: Draft, id: string, status: MessageStatus): Message {
  return {
    id,
    senderId: SPEAKER_ID,
    recipientId: draft.recipientId,
    createdAt: Date.now(),
    status,
    audio: draft.audio,
    asr: { status: 'not-requested' },
    interpretations: [],
    interpretationFeedback: {},
    verified: null,
    playedByRecipient: false,
  };
}

export function withAsr(m: Message, asr: AsrResult): Message {
  return { ...m, asr };
}

/** At most two suggestions are kept; anything claiming another status is rejected. */
export function withInterpretations(m: Message, candidates: InterpretationCandidate[]): Message {
  const clean = candidates
    .filter((c) => c.text.trim().length > 0)
    .slice(0, 2)
    .map((c) => ({ ...c, status: 'unverified' as const }));
  return { ...m, interpretations: clean, interpretationFeedback: {} };
}

export function withFeedback(m: Message, index: number, fb: InterpretationFeedback): Message {
  if (!m.interpretations[index]) return m;
  return { ...m, interpretationFeedback: { ...m.interpretationFeedback, [index]: fb } };
}

export function withTypedCorrection(m: Message, text: string, verifierId: UserId): Message {
  const t = text.trim();
  if (!t) return m;
  return {
    ...m,
    verified: {
      confirmedText: t,
      verifierId,
      method: 'recipient-typed',
      createdAt: Date.now(),
      speakerApproved: null,
      usableForLearning: false,
    },
  };
}

/** Marking a suggestion correct is the only way a machine suggestion becomes confirmed text,
 *  and the confirmation is recorded as a human act with its method. */
export function withSuggestionConfirmed(m: Message, index: number, verifierId: UserId): Message {
  const c = m.interpretations[index];
  if (!c) return m;
  return {
    ...withFeedback(m, index, 'correct'),
    verified: {
      confirmedText: c.text,
      verifierId,
      method: 'recipient-marked-suggestion-correct',
      createdAt: Date.now(),
      speakerApproved: null,
      usableForLearning: false,
    },
  };
}

export function withoutCorrection(m: Message): Message {
  return { ...m, verified: null };
}

export function withLearningConsent(m: Message, allowed: boolean): Message {
  if (!m.verified) return m;
  return { ...m, verified: { ...m.verified, usableForLearning: allowed } };
}

/** Only human-verified, consented corrections may ever feed personalisation. */
export function learningExamples(messages: Message[]): { audioMessageId: string; text: string }[] {
  return messages
    .filter((m) => m.verified?.usableForLearning === true)
    .map((m) => ({ audioMessageId: m.id, text: m.verified!.confirmedText }));
}

export function conversation(messages: Message[], contactId: UserId): Message[] {
  return messages
    .filter(
      (m) =>
        (m.senderId === SPEAKER_ID && m.recipientId === contactId) ||
        (m.senderId === contactId && m.recipientId === SPEAKER_ID),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function unplayedFrom(messages: Message[], contactId: UserId): number {
  return messages.filter((m) => m.senderId === contactId && m.recipientId === SPEAKER_ID && !m.playedByRecipient)
    .length;
}
