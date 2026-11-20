# Capiremo

*Every voice deserves to be understood.*

Capiremo is a very simple voice-messaging app for people whose speech family can understand but dictation software cannot, and who find ordinary phone UIs too fiddly (small targets, swipes, long-presses, accidental archiving). It sends **the person's own voice**. Speech recognition and AI interpretation are planned as optional, clearly labelled layers on top — never as a replacement for the original audio.

**Status: prototype.** Messages stay on the phone (no family messaging server yet). Optional speech-to-text, AI interpretation and voice training work through a small API proxy you deploy yourself ([`server/`](server/README.md)); with it off, the app is audio-only and says so.

Licence: AGPL-3.0.

## What works now

| Flow | Notes |
|---|---|
| Home → person tile → **TALK** → **STOP** → review → **SEND** | Up to 4 contacts (default: Paul, Francesca, Izumi, Dan). Tap to start, tap to stop. No hold-to-talk, swipes or long-press. |
| Phone number setup | Tapping a contact with no number opens a full-screen keypad: big 1–9, +, 0 and delete keys, a country selector (flag + dial code; defaults to the phone's region, else Italy) and the number display. Saves in international (E.164) format. Typing **+** first enters a full international number and bypasses the country. Nothing is dialled or sent to the number yet; it is stored for the messaging backend. |
| Review: **LISTEN**, **SEND**, **RECORD AGAIN**, **CANCEL** | Nothing is ever sent automatically. |
| Messages → **PLAY** / **TEXT** | Newest first. Big PLAY per message, NEW badge for unplayed replies. **TEXT** (Aa) opens the message's text: *Machine heard* (raw speech-to-text), *AI guess — may be wrong* (0–2 readings, or "AI is not sure"), and *Confirmed by family* if someone verified it — always visually separate. **MAKE TEXT** transcribes on demand. |
| Speech-to-text | Admin → AI: **Off** (audio only), **Server** (OpenAI via the proxy; no fixed language, so English/Italian/mixed work) or **On this phone** (Whisper in the browser; audio never leaves the phone; model downloads once from huggingface.co). Runs automatically after SEND; never blocks or replaces the audio. |
| AI interpretation | Claude (`claude-opus-5-5`) via the proxy reads the raw transcript plus confirmed examples of this speaker and suggests at most two readings, or abstains. Instructed to keep names, negations, numbers and language as heard. |
| **Train voice** | Admin → Train voice. Record a phrase (or free speech), see what the machine heard, confirm what was actually said, save. Confirmed recordings adapt the system two ways: names/vocabulary/frequently-missed words and confirmed sentences become a **hint prompt for speech-to-text** (server engine), and "heard → said" pairs become **examples for the AI**. No model fine-tuning; only human-confirmed text is ever used. **Run check** re-measures word accuracy on saved recordings (each tested without its own example) so you can see whether it actually helps. |
| Draft safety | Draft saved to IndexedDB the moment recording stops. Reload, crash, HOME or backgrounding does not lose it. Backgrounding *during* recording finalises what was captured and keeps it as a draft marked "interrupted". |
| Delete safety | CANCEL asks for confirmation; a deleted recording can be brought back (survives reload) until the next recording is kept. RECORD AGAIN keeps the previous take until the new one is captured. |
| Demo fallback | No microphone API (plain HTTP, no mic) or permission denied → a clearly labelled synthetic "demo sound" can be used to exercise the flow. |
| Admin | Small ⚙ button under the contacts, then type `2468` (prevents accidental entry; **not** security). Train voice; AI settings with connection test; status (mic, storage persistence, installed or not); recipient view of every message with separate layers — original audio / raw machine transcription / AI suggestion (unverified) / human-confirmed meaning; "simulate a reply" recorder; contacts: rename, set/change/clear number (same keypad), photo, add/remove (1–4); label language (English / Italiano / both); beep and spoken-feedback toggles; delete all data. |
| Offline | Service worker caches the app shell; all data is local. |

## Privacy

- **Off:** nothing leaves the phone.
- **On this phone:** audio stays on the phone. Only the model is downloaded.
- **Server:** recordings go to OpenAI for transcription. With interpretation on, transcripts and confirmed training text go to Anthropic. The proxy stores nothing.

Get consent before turning this on. Delete all data from Admin.

## Run locally

Node 20+.

```sh
npm install
npm run dev          # http://localhost:5173 — mic works on localhost
npm test             # unit tests (state machine, message model)
npm run e2e          # build + Chromium end-to-end tests with a fake mic
                     # (uses a globally installed Playwright + Chromium)
npm run build        # production build in dist/
```

## Testing on the iPhone

The microphone only works in a **secure context** (HTTPS or `localhost`). An iPhone on `http://192.168.x.x` gets the demo fallback, not the mic.

**Option 1 — quick LAN test (self-signed HTTPS):**

```sh
npm run dev:https    # https://<laptop-ip>:5173
```

Safari warns about the certificate: *Show Details → visit this website*. Fine for checking recording in Safari; home-screen installs from a self-signed origin are unreliable — use option 2 for that.

**Option 2 — real HTTPS (recommended for the install test):** deploy `dist/` to any static HTTPS host. Included: `.github/workflows/pages.yml`. Enable *Settings → Pages → Source: GitHub Actions*, push to `main`, open `https://<owner>.github.io/capiremo/`. All data stays on the phone; the host only serves static files.

### Install to the Home Screen (no Apple developer account)

1. Open the HTTPS URL in **Safari**.
2. **Share** → **Add to Home Screen** → **Add**.
3. Open Capiremo from the new icon (full-screen, no address bar).
4. Tap a person → **TALK**. iOS asks for microphone permission — a caregiver should do this and tap **Allow**.
5. ⚙ Admin → check *Installed to home screen: yes* and *Persistent storage*.

Safari and the installed app have **separate storage**: messages recorded in Safari don't appear in the installed app.

## Known iOS restrictions (verify on the actual device)

Documented/commonly reported behaviour. Each must be confirmed on the target iPhone and iOS version — checklist in [`docs/ios-validation.md`](docs/ios-validation.md).

- **Format:** iOS Safari records `audio/mp4` (AAC) via MediaRecorder (iOS 14.3+). Older iOS → demo fallback only.
- **Permission prompts:** installed web apps may re-ask for microphone permission after being closed. Can't be suppressed from the web; set *Settings → Apps → Safari → Microphone → Allow* to reduce it.
- **Backgrounding / screen lock / incoming call** stops the microphone. The app keeps what was recorded as an interrupted draft; it cannot record in the background.
- **Screen sleep:** a Screen Wake Lock is requested while recording (iOS 16.4+; behaviour in installed apps varies).
- **Silent switch** mutes the start/stop beeps (Web Audio). Message playback uses `<audio>`; verify it still plays.
- **No Vibration API** on iOS → no haptics.
- **Storage eviction:** Safari may delete data of sites unused for ~7 days; Home-Screen apps are exempt — another reason to install. The app requests persistent storage; the caregiver page shows the result.
- **Push notifications** need iOS 16.4+ and an installed app; not used yet (no server).
- **Playback** needs a user tap — it always starts from PLAY.

If these make the PWA unworkable in practice, the fallback is a native Android app on a standard Pixel (see [`docs/architecture.md`](docs/architecture.md)).

## Layout

```
src/
  state/flow.ts          Pure talk→review→send state machine (all safety rules)
  state/useTalkFlow.ts   Effects: microphone, interruptions, persistence, sending
  state/messages.ts      Message model: audio / ASR / unverified suggestions / verified corrections
  audio/capture.ts       MediaRecorder wrapper + demo capture
  ai/client.ts           Calls to the proxy (transcribe / interpret / health) and on-device engine
  ai/whisper*.ts         On-device Whisper (transformers.js in a Web Worker; runtime self-hosted)
  ai/learning.ts         What training feeds in: confirmed pairs, vocabulary hints, example selection
  ai/score.ts            Word accuracy used by the training check
  ai/useAi.ts            Transcribe + interpret pipeline for messages
  services/              Delivery interface (this-device-only for now)
server/                  Cloudflare Worker API proxy (keys server-side) — see server/README.md
  storage/store.ts       IndexedDB store (+ in-memory store for tests)
  screens/               Home, Person, PhoneSetup (keypad), Talk (record/review/sent/errors), Messages, Caregiver
  phone.ts               Keypad input + E.164 conversion (tested)
e2e/flow.test.mjs        Chromium end-to-end tests with a fake microphone
docs/                    Architecture & privacy decisions, iOS validation checklist
```

## Roadmap

1. **Phase 1 (this)** — UX + local record/playback. Test with the real user and caregiver on the real phone.
2. **Phase 2** — private family messaging backend: auth, encrypted audio storage, delivery, retries. Audio-only must work end-to-end before any AI.
3. **Phase 3** — multilingual ASR (English/Italian, code-switching), evaluated against human transcriptions.
4. **Phase 4** — cautious interpretation suggestions with abstention, shown to recipients as unverified.
5. **Phase 5** — personalisation from explicitly confirmed, consented corrections only.

Non-goals for now: WhatsApp integration, App Store distribution, automatic sending, medical assessment.

## Contributing

Issues and PRs welcome. Accessibility changes should be justified by observed use with real users, not checklists alone.
