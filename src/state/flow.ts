// Pure state machine for the talk → review → send flow.
// No side effects here: the UI dispatches events, effects live in useTalkFlow.
//
// Safety properties (covered by tests):
//  - Nothing is ever sent without an explicit SEND event from the review screen.
//  - A recording is never destroyed by an interruption, a failed re-record or a failed send.
//  - Discarding requires confirmation and can be undone until the next recording is kept.

import type { Draft, UserId } from '../types';

export type ErrorKind =
  | 'permission-denied'
  | 'no-microphone'
  | 'unsupported'
  | 'recording-failed'
  | 'send-failed';

export type FlowState =
  | { kind: 'idle'; discarded: Draft | null }
  | { kind: 'requesting'; recipientId: UserId; previous: Draft | null; discarded: Draft | null }
  | { kind: 'recording'; recipientId: UserId; startedAt: number; previous: Draft | null; discarded: Draft | null }
  | { kind: 'finishing'; recipientId: UserId; previous: Draft | null; discarded: Draft | null }
  | { kind: 'review'; draft: Draft; discarded: Draft | null }
  | { kind: 'confirm-discard'; draft: Draft; discarded: Draft | null }
  | { kind: 'sending'; draft: Draft }
  | { kind: 'sent'; recipientId: UserId; messageId: string }
  | { kind: 'error'; error: ErrorKind; recipientId: UserId; draft: Draft | null; discarded: Draft | null };

export type FlowEvent =
  | { type: 'TALK'; recipientId: UserId }
  | { type: 'MIC_READY'; at: number }
  | { type: 'MIC_FAILED'; error: Exclude<ErrorKind, 'send-failed'> }
  | { type: 'STOP' }
  | { type: 'RECORDING_READY'; draft: Draft }
  | { type: 'RECORDING_FAILED' }
  | { type: 'RECORD_AGAIN' }
  | { type: 'CANCEL' }
  | { type: 'CONFIRM_DISCARD' }
  | { type: 'KEEP' }
  | { type: 'UNDO_DISCARD' }
  | { type: 'BACK_TO_DRAFT' }
  | { type: 'SEND' }
  | { type: 'SEND_OK'; messageId: string }
  | { type: 'SEND_FAILED' }
  | { type: 'RESTORE_DRAFT'; draft: Draft }
  | { type: 'HOME' };

export const initialFlow: FlowState = { kind: 'idle', discarded: null };

function discardedOf(s: FlowState): Draft | null {
  return 'discarded' in s ? s.discarded : null;
}

/** The draft that must not be lost in the current state, if any. */
export function draftAtRisk(s: FlowState): Draft | null {
  switch (s.kind) {
    case 'review':
    case 'confirm-discard':
    case 'sending':
      return s.draft;
    case 'requesting':
    case 'recording':
    case 'finishing':
      return s.previous;
    case 'error':
      return s.draft;
    default:
      return null;
  }
}

export function flowReducer(s: FlowState, e: FlowEvent): FlowState {
  switch (e.type) {
    case 'TALK':
      // Only start from a resting state. A draft in review must be sent, re-recorded or cancelled first.
      if (s.kind === 'idle' || (s.kind === 'error' && s.draft === null)) {
        return { kind: 'requesting', recipientId: e.recipientId, previous: null, discarded: discardedOf(s) };
      }
      return s;

    case 'RECORD_AGAIN':
      // Keep the previous take until the new one is safely captured.
      if (s.kind === 'review') {
        return { kind: 'requesting', recipientId: s.draft.recipientId, previous: s.draft, discarded: s.discarded };
      }
      if (s.kind === 'error' && s.draft && s.error !== 'send-failed') {
        return { kind: 'requesting', recipientId: s.recipientId, previous: s.draft, discarded: s.discarded };
      }
      return s;

    case 'MIC_READY':
      if (s.kind !== 'requesting') return s;
      return { kind: 'recording', recipientId: s.recipientId, startedAt: e.at, previous: s.previous, discarded: s.discarded };

    case 'MIC_FAILED':
      if (s.kind !== 'requesting' && s.kind !== 'recording' && s.kind !== 'finishing') return s;
      return { kind: 'error', error: e.error, recipientId: s.recipientId, draft: s.previous, discarded: s.discarded };

    case 'STOP':
      if (s.kind !== 'recording') return s;
      return { kind: 'finishing', recipientId: s.recipientId, previous: s.previous, discarded: s.discarded };

    case 'RECORDING_READY':
      // Accepted while recording too: an interruption may finalise the recording without STOP.
      if (s.kind !== 'finishing' && s.kind !== 'recording') return s;
      return { kind: 'review', draft: e.draft, discarded: s.discarded };

    case 'RECORDING_FAILED':
      if (s.kind !== 'finishing' && s.kind !== 'recording' && s.kind !== 'requesting') return s;
      if (s.previous) return { kind: 'review', draft: s.previous, discarded: s.discarded };
      return { kind: 'error', error: 'recording-failed', recipientId: s.recipientId, draft: null, discarded: s.discarded };

    case 'CANCEL':
      if (s.kind === 'review') return { kind: 'confirm-discard', draft: s.draft, discarded: s.discarded };
      if (s.kind === 'error' && s.draft) return { kind: 'confirm-discard', draft: s.draft, discarded: s.discarded };
      if (s.kind === 'requesting' || s.kind === 'error') {
        return s.kind === 'requesting' && s.previous
          ? { kind: 'review', draft: s.previous, discarded: s.discarded }
          : { kind: 'idle', discarded: discardedOf(s) };
      }
      return s;

    case 'KEEP':
      if (s.kind !== 'confirm-discard') return s;
      return { kind: 'review', draft: s.draft, discarded: s.discarded };

    case 'CONFIRM_DISCARD':
      if (s.kind !== 'confirm-discard') return s;
      return { kind: 'idle', discarded: s.draft };

    case 'BACK_TO_DRAFT':
      if (s.kind !== 'error' || !s.draft || s.error === 'send-failed') return s;
      return { kind: 'review', draft: s.draft, discarded: s.discarded };

    case 'UNDO_DISCARD':
      if (s.kind !== 'idle' || !s.discarded) return s;
      return { kind: 'review', draft: s.discarded, discarded: null };

    case 'SEND':
      if (s.kind === 'review') return { kind: 'sending', draft: s.draft };
      if (s.kind === 'error' && s.error === 'send-failed' && s.draft) return { kind: 'sending', draft: s.draft };
      return s;

    case 'SEND_OK':
      if (s.kind !== 'sending') return s;
      return { kind: 'sent', recipientId: s.draft.recipientId, messageId: e.messageId };

    case 'SEND_FAILED':
      if (s.kind !== 'sending') return s;
      return { kind: 'error', error: 'send-failed', recipientId: s.draft.recipientId, draft: s.draft, discarded: null };

    case 'RESTORE_DRAFT':
      if (s.kind !== 'idle') return s;
      return { kind: 'review', draft: e.draft, discarded: s.discarded };

    case 'HOME':
      // HOME never destroys a draft: it parks it in review, which is persisted and restored on next visit.
      if (s.kind === 'sent') return { kind: 'idle', discarded: null };
      if (s.kind === 'error' && !s.draft) return { kind: 'idle', discarded: s.discarded };
      if (s.kind === 'requesting' && !s.previous) return { kind: 'idle', discarded: s.discarded };
      return s;
  }
}
