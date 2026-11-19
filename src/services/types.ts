// Service boundaries. The prototype ships honest mock implementations:
// they report "unavailable" rather than inventing transcripts or delivery success.

import type { AsrResult, AudioClip, InterpretationCandidate, Message } from '../types';

export interface AsrService {
  readonly name: string;
  /** Must accept mixed English/Italian audio without a fixed locale. */
  transcribe(audio: AudioClip): Promise<AsrResult>;
}

export interface InterpretationContext {
  /** Raw ASR text only. Never a previous unverified guess. */
  asrText: string;
  /** Recent messages; implementations must only use verified corrections from these. */
  recent: Message[];
  /** Confirmed personal vocabulary entries. */
  vocabulary: { phrase: string; meaning: string }[];
}

export interface InterpretationService {
  readonly name: string;
  /** Returns 0–2 candidates. Returning [] (abstaining) is a valid, expected outcome. */
  suggest(ctx: InterpretationContext): Promise<InterpretationCandidate[]>;
}

export type DeliveryResult =
  | { ok: true; status: 'saved-on-device' | 'delivered' }
  | { ok: false; reason: string };

export interface DeliveryService {
  readonly name: string;
  /** True only if messages actually leave the device. */
  readonly remote: boolean;
  deliver(message: Message): Promise<DeliveryResult>;
}
