// Runs speech-to-text and interpretation for messages and training examples, using only
// confirmed learning material. Results are written as separate layers on the message.

import { useCallback, useMemo, useRef } from 'react';
import { withAsr, withInterpretations } from '../state/messages';
import type { Settings } from '../storage/store';
import type { AsrResult, AudioClip, Contact, Message, TrainingExample } from '../types';
import { SPEAKER_ID } from '../types';
import { interpret, interpretAvailable, transcribe, type InterpretResult } from './client';
import { learningPairs, recogniserPrompt, selectExamples } from './learning';

interface Deps {
  settings: Settings;
  contacts: Contact[];
  vocabulary: string[];
  training: TrainingExample[];
  messages: Message[];
  saveMessage: (m: Message) => void;
}

export function useAi({ settings, contacts, vocabulary, training, messages, saveMessage }: Deps) {
  const ai = settings.ai;
  const pairs = useMemo(() => learningPairs(training, messages), [training, messages]);
  const prompt = useMemo(() => recogniserPrompt(contacts, vocabulary, pairs), [contacts, vocabulary, pairs]);
  const running = useRef(new Set<string>());

  const runInterpret = useCallback(
    (asrText: string, excludeId?: string): Promise<InterpretResult> =>
      interpret(ai, {
        asrText,
        examples: selectExamples(pairs, excludeId),
        vocabulary: vocabulary.slice(0, 150),
        contacts: contacts.map((c) => c.name).filter(Boolean),
      }),
    [ai, pairs, vocabulary, contacts],
  );

  /** excludeId leaves one confirmed example out of the hint (fair measurement on that example). */
  const runTranscribe = useCallback(
    (audio: AudioClip, excludeId?: string): Promise<AsrResult> =>
      transcribe(ai, audio, excludeId ? recogniserPrompt(contacts, vocabulary, pairs.filter((p) => p.id !== excludeId)) : prompt),
    [ai, prompt, contacts, vocabulary, pairs],
  );

  /** Transcribe a message and, for the speaker's own messages, ask for an interpretation. */
  const processMessage = useCallback(
    async (m: Message) => {
      if (running.current.has(m.id)) return;
      running.current.add(m.id);
      try {
        let msg = withAsr(m, { status: 'pending' });
        saveMessage(msg);
        const asr = await runTranscribe(m.audio);
        msg = withAsr(msg, asr);
        const wantsAi = m.senderId === SPEAKER_ID && asr.status === 'done' && asr.text.trim() && interpretAvailable(ai);
        if (wantsAi) {
          msg = { ...msg, ai: { status: 'pending', note: '', model: null } };
          saveMessage(msg);
          const r = await runInterpret((asr as { text: string }).text, m.id);
          if (r.status === 'done') msg = { ...withInterpretations(msg, r.candidates), ai: { status: 'done', note: r.note, model: r.model } };
          else if (r.status === 'abstained') msg = { ...withInterpretations(msg, []), ai: { status: 'abstained', note: r.note, model: r.model } };
          else msg = { ...msg, ai: { status: 'failed', note: r.note, model: null } };
        }
        saveMessage(msg);
      } finally {
        running.current.delete(m.id);
      }
    },
    [ai, runInterpret, runTranscribe, saveMessage],
  );

  return { prompt, pairs, processMessage, runTranscribe, runInterpret };
}

/** A message left mid-processing (app closed) is shown as not yet transcribed. */
export function recoverInterrupted(m: Message): Message {
  let out = m;
  if (out.asr.status === 'pending') out = { ...out, asr: { status: 'not-requested' } };
  if (out.ai?.status === 'pending') out = { ...out, ai: undefined };
  return out;
}
