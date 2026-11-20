// Side effects for the talk flow: microphone, interruption handling, persistence, sending.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { CaptureError, MAX_RECORDING_MS, demoCapture, micCapture, type Capture } from '../audio/capture';
import { beep } from '../audio/feedback';
import type { DeliveryService } from '../services/types';
import type { Store } from '../storage/store';
import type { AudioClip, Draft, Message, UserId } from '../types';
import { draftAtRisk, flowReducer, initialFlow, type FlowState } from './flow';
import { messageFromDraft } from './messages';

export interface Services {
  store: Store;
  delivery: DeliveryService;
}

export function newId(prefix: string) {
  const rnd = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rnd}`;
}

interface Options {
  services: Services;
  forceDemo: boolean;
  sounds: boolean;
  onMessage: (m: Message) => void;
  afterSend?: (m: Message) => void;
}

export function useTalkFlow({ services, forceDemo, sounds, onMessage, afterSend }: Options) {
  const [flow, dispatch] = useReducer(flowReducer, initialFlow);
  const capture = useRef<Capture | null>(null);
  const demoNext = useRef(false);
  const interruptedFlag = useRef(false);
  const maxReached = useRef(false);
  const loaded = useRef(false);
  const flowRef = useRef<FlowState>(flow);
  flowRef.current = flow;

  // Restore a draft saved before a reload/crash, and the undo slot.
  useEffect(() => {
    (async () => {
      const [current, discarded] = await Promise.all([
        services.store.getDraft('current'),
        services.store.getDraft('discarded'),
      ]);
      if (discarded) {
        // Reconstruct undo availability without inventing state transitions.
        dispatch({ type: 'RESTORE_DRAFT', draft: discarded });
        dispatch({ type: 'CANCEL' });
        dispatch({ type: 'CONFIRM_DISCARD' });
      }
      if (current) dispatch({ type: 'RESTORE_DRAFT', draft: current });
      loaded.current = true;
    })();
  }, [services.store]);

  // Persist whatever must not be lost.
  useEffect(() => {
    if (!loaded.current) return;
    const atRisk = draftAtRisk(flow);
    if (flow.kind === 'sending') return; // keep saved until delivery succeeds
    void services.store.putDraft('current', atRisk);
    if (flow.kind !== 'sent') void services.store.putDraft('discarded', 'discarded' in flow ? flow.discarded : null);
    else void services.store.putDraft('discarded', null);
  }, [flow, services.store]);

  const finalise = useCallback(
    async (recipientId: UserId) => {
      const c = capture.current;
      capture.current = null;
      if (!c) return;
      let audio: AudioClip;
      try {
        audio = await c.stop();
      } catch {
        dispatch({ type: 'RECORDING_FAILED' });
        return;
      }
      const draft: Draft = {
        id: newId('draft'),
        recipientId,
        createdAt: Date.now(),
        audio,
        interrupted: interruptedFlag.current,
      };
      if (sounds) beep('stop');
      dispatch({ type: 'RECORDING_READY', draft });
    },
    [sounds],
  );

  // Start microphone when requested.
  useEffect(() => {
    if (flow.kind !== 'requesting') return;
    let cancelled = false;
    const useDemo = forceDemo || demoNext.current;
    demoNext.current = false;
    interruptedFlag.current = false;
    maxReached.current = false;
    const c = useDemo ? demoCapture() : micCapture();
    capture.current = c;
    c.onInterrupted(() => {
      if (flowRef.current.kind === 'recording') {
        interruptedFlag.current = true;
        void finalise(flowRef.current.recipientId);
      }
    });
    c.start().then(
      () => {
        if (cancelled) return c.dispose();
        if (sounds) beep('start');
        dispatch({ type: 'MIC_READY', at: Date.now() });
      },
      (e: unknown) => {
        capture.current = null;
        if (cancelled) return;
        dispatch({ type: 'MIC_FAILED', error: e instanceof CaptureError ? e.kind : 'recording-failed' });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.kind === 'requesting' ? flow : null]);

  // Stop requested.
  useEffect(() => {
    if (flow.kind === 'finishing') void finalise(flow.recipientId);
  }, [flow, finalise]);

  // Interruptions: app hidden / page being unloaded while recording → keep what we have.
  useEffect(() => {
    const onHide = () => {
      const s = flowRef.current;
      if (document.visibilityState === 'hidden' && s.kind === 'recording') {
        interruptedFlag.current = true;
        void finalise(s.recipientId);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [finalise]);

  // Max length guard and screen wake lock while recording.
  useEffect(() => {
    if (flow.kind !== 'recording') return;
    const timer = setTimeout(() => {
      maxReached.current = true;
      dispatch({ type: 'STOP' });
    }, MAX_RECORDING_MS);
    let lock: { release(): Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      clearTimeout(timer);
      void lock?.release().catch(() => {});
    };
  }, [flow]);

  // Sending: audio is saved and delivered first; ASR/interpretation are optional extras afterwards.
  useEffect(() => {
    if (flow.kind !== 'sending') return;
    const draft = flow.draft;
    (async () => {
      const id = newId('msg');
      let msg = messageFromDraft(draft, id, 'saved-on-device');
      try {
        await services.store.putMessage(msg);
        const res = await services.delivery.deliver(msg);
        if (!res.ok) throw new Error(res.reason);
        msg = { ...msg, status: res.status };
        await services.store.putMessage(msg);
        await services.store.putDraft('current', null);
      } catch {
        dispatch({ type: 'SEND_FAILED' });
        return;
      }
      onMessage(msg);
      if (sounds) beep('sent');
      dispatch({ type: 'SEND_OK', messageId: id });

      // Optional AI processing happens afterwards and never blocks or replaces the audio.
      afterSend?.(msg);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.kind === 'sending' ? flow : null]);

  const talk = useCallback((recipientId: UserId, demo = false) => {
    demoNext.current = demo;
    dispatch({ type: 'TALK', recipientId });
  }, []);

  const recordAgain = useCallback((demo = false) => {
    demoNext.current = demo;
    dispatch({ type: 'RECORD_AGAIN' });
  }, []);

  const level = useCallback(() => capture.current?.level() ?? null, []);

  return { flow, dispatch, talk, recordAgain, level, maxReached: maxReached.current };
}
