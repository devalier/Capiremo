# Architecture and decisions

## Principles (non-negotiable)

1. **Original audio is the message.** Every message carries playable source audio regardless of ASR/AI availability. If ASR or AI fails, the audio is sent anyway.
2. **Four separate layers**, never merged: original audio → raw machine transcription → AI suggestion (always `unverified`) → human-verified correction. Enforced in `src/state/messages.ts` and tested.
3. **No sending without an explicit SEND.** Enforced in `src/state/flow.ts`; tested exhaustively over event sequences.
4. **Learning only from verified, consented corrections.** `learningExamples()` is the only exit; corrections default to `usableForLearning: false` and `speakerApproved: null`.
5. **Mocks are honest.** The prototype's ASR reports "not connected", the interpreter abstains, delivery reports "saved on this device". Nothing claims success it didn't achieve.

## Speech pipeline (built)

```
record → SEND (audio saved/delivered first)
       → speech-to-text: off | server (OpenAI, vocabulary hint) | device (Whisper/transformers.js)
       → interpretation (speaker's messages only): Claude via proxy, 0–2 readings or abstain
       → stored as separate layers: asr / interpretations (unverified) / verified
```

- Proxy (`server/`, Cloudflare Worker): `APP_TOKEN` bearer auth, CORS allow-list, keys as Worker secrets, no storage or logging of content. Claude call uses structured output, `effort: medium`, prompt caching, and server-side refusal fallback.
- Training: confirmed recordings (`training` store) + consented message corrections → `learning.ts` builds (a) the speech-to-text hint (names, vocabulary, frequently missed words, confirmed sentences; ≤900 chars) and (b) up to 30 most recent heard→said examples for Claude. Evaluation is leave-one-out word accuracy on up to 15 recent recordings.
- Not done: fine-tuning or per-speaker acoustic models; the hint prompt and few-shot examples are the only adaptation.

## Current (Phase 1)

- React + TypeScript + Vite PWA, no router, no state library. Single high-contrast theme.
- Storage: IndexedDB (`messages` object store + `kv` for drafts, settings, contacts). Audio stored as `ArrayBuffer` + MIME type (safer than `Blob` on older iOS).
- Service worker: offline app shell only.
- Caregiver area gated by a typed code purely to stop accidental entry.

## Phase 2 — private messaging backend (proposed, not built)

Smallest thing that works for a handful of family members:

- **API:** small authenticated HTTP service (e.g. Node/Hono or Python/FastAPI) behind HTTPS.
- **Data:** Postgres (or SQLite for a single-family deployment) with tables: `users`, `devices`, `contacts`, `messages`, `audio_assets`, `interpretation_candidates`, `verified_corrections`, `personal_vocabulary`.
- **Audio:** object storage (S3-compatible), encrypted at rest, accessed via short-lived signed URLs; per-contact ACL checked before signing.
- **Auth:** caregiver-mediated enrollment. Caregiver creates the account and issues a one-time enrollment link/QR; the device receives a long-lived, revocable device token (stored in IndexedDB; rotated on use). No passwords for the speaker. Revocation and lost-phone flow from the caregiver side.
- **Delivery:** client uploads audio + metadata; server stores, then notifies recipients (Web Push where supported, otherwise polling while open). Client keeps the draft until the server acknowledges (`DeliveryService.deliver` → `delivered`). Outbox with retry on reconnect.
- **Processing queue:** ASR and interpretation run asynchronously after storage, never in the send path.
- **Secrets:** provider API keys server-side only.
- **Telemetry:** counts and timings only; no transcripts or audio in logs.

## Phase 3/4 — speech pipeline

- ASR: multilingual, language auto-detection allowed to switch mid-utterance (do not pin one locale). Candidates to evaluate against the Phase 0 corpus: Whisper-family models (hosted or self-hosted), cloud ASR with multi-language mode, and audio-capable LLMs as a separate candidate. Pick by measured WER/CER per language and on mixed utterances, plus named-entity and negation preservation.
- Interpretation: cautious system prompt (at most two readings, abstain when unsure, no invented content); input = raw ASR + recent messages' *verified* corrections + confirmed vocabulary only; output 0–2 candidates with uncertainty notes; abstention expected. Hard rule: never flip negation, names, times, quantities, medicine.
- Evaluation: false-confident reconstruction rate is the critical metric.

## Privacy & consent (decide before real recordings leave the device)

- Consent/authority for recording and AI processing; audio-only mode always available.
- Retention period for audio and transcripts; backup policy; export and deletion (already: "delete all data on this device").
- Data processor agreements for any ASR/LLM provider; prefer providers that do not train on inputs.
- No diagnosis or medical data in messaging tables.

## Fallback platform

If real-device testing shows the PWA can't deliver reliable recording/permissions on iOS: native Android (Kotlin/Compose or React Native) on a standard Pixel, side-loaded for a small set of devices. The state machine and message model port directly.
