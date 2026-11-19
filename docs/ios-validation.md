# iOS real-device validation checklist

Run on the target iPhone, as an installed Home-Screen app, before testing with the real user. Record iOS version and results.

| # | Check | How | Result |
|---|---|---|---|
| 1 | Install works | Safari → Share → Add to Home Screen; opens full-screen | |
| 2 | Mic permission | First TALK shows prompt; Allow; recording starts | |
| 3 | Permission persistence | Close app (swipe away), reopen, TALK — re-prompted? How often? | |
| 4 | Recording format | Caregiver → Messages: duration correct; plays back | |
| 5 | Playback with silent switch ON | Play a message | |
| 6 | Beeps with silent switch ON/OFF | Start/stop recording | |
| 7 | Lock screen during recording | Press side button while recording; unlock; draft present, marked interrupted, plays | |
| 8 | Switch app during recording | Home gesture while recording; return | |
| 9 | Incoming call during recording | Call the phone while recording | |
| 10 | Kill app during review | Record, stop, swipe app away; reopen → "Unsent message" banner | |
| 11 | Screen stays on while recording | Record > auto-lock time | |
| 12 | Storage persistence | Caregiver → Persistent storage value; data still there after a week unused | |
| 13 | Long recording | 2–3 minutes; plays back fully | |
| 14 | Offline | Airplane mode; open app; record; "send" (local) | |
| 15 | Accidental input | Rapid double-taps on TALK/STOP/SEND; tap edges; no unintended send/delete | |
| 16 | Text size | iOS Larger Text setting on; nothing clipped | |
| 17 | VoiceOver | Buttons announce their labels | |

## Observation with the real user (Phase 1)

Measure, don't assume: unassisted completion, unintended taps, accidental navigation, time to send, cancelled drafts, comfort. Note which labels (English / Italian / both) work best.
