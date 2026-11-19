// Core domain types. Mirrors the data model in docs/architecture.md.
// Key rule: original audio, machine transcription, AI suggestion and
// human-confirmed wording are stored as separate fields and never merged.

export type UserId = string;

export interface Contact {
  id: UserId;
  name: string;
  /** data: URL of a photo set by the caregiver; null shows initials. */
  photo: string | null;
  order: number;
}

export const SPEAKER_ID: UserId = 'me';

export interface AudioClip {
  /** Raw bytes; stored as ArrayBuffer because some iOS versions mishandle Blobs in IndexedDB. */
  data: ArrayBuffer;
  mimeType: string;
  durationMs: number;
  /** True when the sound is synthesised (no microphone available). Never a real voice. */
  demo: boolean;
}

/** A recording that has not been sent. Persisted so a crash or reload never loses it. */
export interface Draft {
  id: string;
  recipientId: UserId;
  createdAt: number;
  audio: AudioClip;
  /** Set if recording ended because the app was interrupted (backgrounded, call, etc.). */
  interrupted: boolean;
}

export type AsrResult =
  | { status: 'not-requested' }
  | { status: 'pending' }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string }
  | { status: 'done'; text: string; detectedLanguages: string[]; provider: string };

export interface InterpretationCandidate {
  text: string;
  /** Machine suggestions are ALWAYS unverified. Confirmation lives in VerifiedCorrection. */
  status: 'unverified';
  uncertaintyNotes: string[];
  provider: string;
  createdAt: number;
}

export type InterpretationFeedback = 'correct' | 'incorrect';

export interface VerifiedCorrection {
  confirmedText: string;
  verifierId: UserId;
  method: 'recipient-typed' | 'recipient-marked-suggestion-correct';
  createdAt: number;
  /** Whether the speaker approved this wording. Unknown by default; never assumed. */
  speakerApproved: boolean | null;
  /** Consent to use this correction for future suggestions. Off by default. */
  usableForLearning: boolean;
}

export type MessageStatus = 'saved-on-device' | 'delivered' | 'failed';

export interface Message {
  id: string;
  senderId: UserId;
  recipientId: UserId;
  createdAt: number;
  status: MessageStatus;
  audio: AudioClip;
  asr: AsrResult;
  interpretations: InterpretationCandidate[];
  /** Per-candidate feedback from the recipient, by candidate index. */
  interpretationFeedback: Record<number, InterpretationFeedback>;
  verified: VerifiedCorrection | null;
  playedByRecipient: boolean;
}
