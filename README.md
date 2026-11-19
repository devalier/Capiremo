# Capiremo

*Every voice deserves to be understood.*

Capiremo is a very simple voice-messaging app for people whose speech family can understand but dictation software cannot, and who find ordinary phone UIs too fiddly (small targets, swipes, long-presses, accidental archiving). It sends **the person's own voice**. Speech recognition and AI interpretation are planned as optional, clearly labelled layers on top — never as a replacement for the original audio.

**Status: Phase 1 prototype** — on-device UX and recording flow. No server yet: messages stay on the phone. No speech-to-text or AI is connected, and the app says so rather than faking it.

Licence: AGPL-3.0.

## What works now

| Flow | Notes |
|---|---|
| Home → person tile → **TALK** → **STOP** → review → **SEND** | Tap to start, tap to stop. No hold-to-talk, swipes or long-press. |
| Review: **LISTEN**, **SEND**, **RECORD AGAIN**, **CANCEL** | Nothing is ever sent automatically. |
| Messages → **PLAY** | Newest first, one big button per message, NEW badge for unplayed replies. |
| Draft safety | Draft saved to IndexedDB the moment recording stops. Reload, crash, HOME or backgrounding does not lose it. Backgrounding *during* recording finalises what was captured and keeps it as a draft marked "interrupted". |
| Delete safety | CANCEL asks for confirmation; a deleted recording can be brought back (survives reload) until the next recording is kept. RECORD AGAIN keeps the previous take until the new one is captured. |
| Demo fallback | No microphone API (plain HTTP, no mic) or permission denied → a clearly labelled synthetic "demo sound" can be used to exercise the flow. |
| Caregiver area | Small "Caregiver" link at the bottom of Home, then type `2468` (prevents accidental entry; **not** security). Status (mic, storage persistence, installed or not); recipient view of every message with separate layers — original audio / raw machine transcription / AI suggestion (unverified) / human-confirmed meaning; "simulate a reply" recorder; contact names and photos; label language (English / Italiano / both); beep and spoken-feedback toggles; delete all data. |
| Offline | Service worker caches the app shell; all data is local. |

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
5. Caregiver area → check *Installed to home screen: yes* and *Persistent storage*.

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
  services/types.ts      ASR, interpretation, delivery interfaces
  services/mock.ts       Honest no-op implementations (not connected / abstain / this device only)
  storage/store.ts       IndexedDB store (+ in-memory store for tests)
  screens/               Home, Person, Talk (record/review/sent/errors), Messages, Caregiver
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
