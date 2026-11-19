import { describe, expect, it } from 'vitest';
import type { Draft } from '../types';
import { draftAtRisk, flowReducer, initialFlow, type FlowEvent, type FlowState } from './flow';

const draft = (id = 'd1'): Draft => ({
  id,
  recipientId: 'paul',
  createdAt: 0,
  audio: { data: new ArrayBuffer(4), mimeType: 'audio/mp4', durationMs: 1000, demo: false },
  interrupted: false,
});

const run = (events: FlowEvent[], from: FlowState = initialFlow) => events.reduce(flowReducer, from);

const toReview = (d = draft()): FlowState =>
  run([{ type: 'TALK', recipientId: 'paul' }, { type: 'MIC_READY', at: 1 }, { type: 'STOP' }, { type: 'RECORDING_READY', draft: d }]);

const ALL_EVENTS: FlowEvent[] = [
  { type: 'TALK', recipientId: 'paul' },
  { type: 'MIC_READY', at: 1 },
  { type: 'MIC_FAILED', error: 'permission-denied' },
  { type: 'STOP' },
  { type: 'RECORDING_READY', draft: draft('x') },
  { type: 'RECORDING_FAILED' },
  { type: 'RECORD_AGAIN' },
  { type: 'CANCEL' },
  { type: 'KEEP' },
  { type: 'UNDO_DISCARD' },
  { type: 'BACK_TO_DRAFT' },
  { type: 'SEND_OK', messageId: 'm' },
  { type: 'SEND_FAILED' },
  { type: 'RESTORE_DRAFT', draft: draft('r') },
  { type: 'HOME' },
];

describe('talk flow', () => {
  it('happy path: talk → record → stop → review → send → sent', () => {
    let s = run([{ type: 'TALK', recipientId: 'paul' }]);
    expect(s.kind).toBe('requesting');
    s = run([{ type: 'MIC_READY', at: 5 }], s);
    expect(s).toMatchObject({ kind: 'recording', startedAt: 5 });
    s = run([{ type: 'STOP' }], s);
    expect(s.kind).toBe('finishing');
    s = run([{ type: 'RECORDING_READY', draft: draft() }], s);
    expect(s.kind).toBe('review');
    s = run([{ type: 'SEND' }], s);
    expect(s.kind).toBe('sending');
    s = run([{ type: 'SEND_OK', messageId: 'm1' }], s);
    expect(s).toEqual({ kind: 'sent', recipientId: 'paul', messageId: 'm1' });
  });

  it('never reaches sending without an explicit SEND (exhaustive over 3-step event sequences)', () => {
    const starts: FlowState[] = [initialFlow, toReview(), run([{ type: 'TALK', recipientId: 'paul' }, { type: 'MIC_READY', at: 1 }])];
    for (const start of starts)
      for (const a of ALL_EVENTS)
        for (const b of ALL_EVENTS)
          for (const c of ALL_EVENTS) expect(run([a, b, c], start).kind).not.toBe('sending');
  });

  it('interruption while recording keeps the audio as a draft (no STOP needed)', () => {
    const d = { ...draft(), interrupted: true };
    const s = run([{ type: 'TALK', recipientId: 'paul' }, { type: 'MIC_READY', at: 1 }, { type: 'RECORDING_READY', draft: d }]);
    expect(s).toMatchObject({ kind: 'review', draft: d });
  });

  it('TALK is ignored while a draft is pending', () => {
    const r = toReview();
    expect(flowReducer(r, { type: 'TALK', recipientId: 'stefania' })).toBe(r);
  });

  it('cancel requires confirmation; KEEP returns to the same draft', () => {
    const d = draft();
    let s = run([{ type: 'CANCEL' }], toReview(d));
    expect(s.kind).toBe('confirm-discard');
    s = run([{ type: 'KEEP' }], s);
    expect(s).toMatchObject({ kind: 'review', draft: d });
  });

  it('discard can be undone', () => {
    const d = draft();
    let s = run([{ type: 'CANCEL' }, { type: 'CONFIRM_DISCARD' }], toReview(d));
    expect(s).toEqual({ kind: 'idle', discarded: d });
    expect(draftAtRisk(s)).toBeNull();
    s = run([{ type: 'UNDO_DISCARD' }], s);
    expect(s).toMatchObject({ kind: 'review', draft: d });
  });

  it('undo survives starting (but not completing) a new recording', () => {
    const d = draft();
    let s = run([{ type: 'CANCEL' }, { type: 'CONFIRM_DISCARD' }, { type: 'TALK', recipientId: 'paul' }], toReview(d));
    s = run([{ type: 'CANCEL' }], s);
    expect(s).toEqual({ kind: 'idle', discarded: d });
  });

  it('record again keeps the previous take until the new one exists', () => {
    const d1 = draft('d1');
    let s = run([{ type: 'RECORD_AGAIN' }], toReview(d1));
    expect(draftAtRisk(s)).toBe(d1);
    // mic fails → previous take still there and reachable
    s = run([{ type: 'MIC_FAILED', error: 'permission-denied' }], s);
    expect(s).toMatchObject({ kind: 'error', draft: d1 });
    s = run([{ type: 'BACK_TO_DRAFT' }], s);
    expect(s).toMatchObject({ kind: 'review', draft: d1 });
  });

  it('record again: failed capture falls back to previous take', () => {
    const d1 = draft('d1');
    const s = run([{ type: 'RECORD_AGAIN' }, { type: 'MIC_READY', at: 1 }, { type: 'STOP' }, { type: 'RECORDING_FAILED' }], toReview(d1));
    expect(s).toMatchObject({ kind: 'review', draft: d1 });
  });

  it('record again: cancel before mic is ready returns to previous take', () => {
    const d1 = draft('d1');
    const s = run([{ type: 'RECORD_AGAIN' }, { type: 'CANCEL' }], toReview(d1));
    expect(s).toMatchObject({ kind: 'review', draft: d1 });
  });

  it('record again: new take replaces previous', () => {
    const d2 = draft('d2');
    const s = run([{ type: 'RECORD_AGAIN' }, { type: 'MIC_READY', at: 1 }, { type: 'STOP' }, { type: 'RECORDING_READY', draft: d2 }], toReview());
    expect(s).toMatchObject({ kind: 'review', draft: d2 });
  });

  it('send failure keeps the draft and allows retry', () => {
    const d = draft();
    let s = run([{ type: 'SEND' }, { type: 'SEND_FAILED' }], toReview(d));
    expect(s).toMatchObject({ kind: 'error', error: 'send-failed', draft: d });
    expect(draftAtRisk(s)).toBe(d);
    s = run([{ type: 'SEND' }], s);
    expect(s.kind).toBe('sending');
  });

  it('HOME never drops a pending draft', () => {
    for (const s of [toReview(), run([{ type: 'CANCEL' }], toReview()), run([{ type: 'SEND' }], toReview())]) {
      expect(draftAtRisk(flowReducer(s, { type: 'HOME' }))).toBe(draftAtRisk(s));
    }
  });

  it('permission denied without draft → error → HOME → idle', () => {
    let s = run([{ type: 'TALK', recipientId: 'paul' }, { type: 'MIC_FAILED', error: 'permission-denied' }]);
    expect(s).toMatchObject({ kind: 'error', error: 'permission-denied', draft: null });
    s = run([{ type: 'HOME' }], s);
    expect(s.kind).toBe('idle');
  });

  it('can retry TALK directly from a mic error', () => {
    const s = run([{ type: 'TALK', recipientId: 'paul' }, { type: 'MIC_FAILED', error: 'unsupported' }, { type: 'TALK', recipientId: 'paul' }]);
    expect(s.kind).toBe('requesting');
  });

  it('restores a persisted draft only from idle', () => {
    const d = draft('saved');
    expect(run([{ type: 'RESTORE_DRAFT', draft: d }])).toMatchObject({ kind: 'review', draft: d });
    const r = toReview();
    expect(flowReducer(r, { type: 'RESTORE_DRAFT', draft: d })).toBe(r);
  });

  it('a draft is never silently lost by any single event except confirmed discard or successful send', () => {
    const states: FlowState[] = [
      toReview(),
      run([{ type: 'CANCEL' }], toReview()),
      run([{ type: 'SEND' }], toReview()),
      run([{ type: 'SEND' }, { type: 'SEND_FAILED' }], toReview()),
      run([{ type: 'RECORD_AGAIN' }], toReview()),
      run([{ type: 'RECORD_AGAIN' }, { type: 'MIC_READY', at: 1 }], toReview()),
      run([{ type: 'RECORD_AGAIN' }, { type: 'MIC_READY', at: 1 }, { type: 'STOP' }], toReview()),
    ];
    const allowed = new Set(['CONFIRM_DISCARD', 'SEND_OK', 'RECORDING_READY']);
    for (const s of states)
      for (const e of [...ALL_EVENTS, { type: 'SEND' } as FlowEvent, { type: 'CONFIRM_DISCARD' } as FlowEvent]) {
        if (allowed.has(e.type)) continue;
        expect(draftAtRisk(flowReducer(s, e)), `${s.kind} + ${e.type}`).not.toBeNull();
      }
  });
});
