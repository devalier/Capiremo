# Capiremo server (API proxy)

A small Cloudflare Worker. It holds the provider API keys so they never sit on the phone, and passes requests through:

| Endpoint | Does |
|---|---|
| `GET /health` | Shows which services are configured |
| `POST /transcribe` | Audio → OpenAI speech-to-text (no fixed language, so English, Italian or both work). Takes an optional vocabulary hint built from training. |
| `POST /interpret` | Raw transcript plus confirmed training examples → Claude (`claude-opus-5-5`) → 0–2 possible readings, or "not sure". |

Every request needs `Authorization: Bearer <APP_TOKEN>`. Browsers are only accepted from the origins listed in `ALLOWED_ORIGINS`. The server does not store or log audio or text.

## Deploy (about 10 minutes, free tier is enough)

You need a Cloudflare account, an OpenAI API key and an Anthropic API key. Set a **monthly spend limit** on both provider accounts.

```sh
cd server
npm install
npx wrangler login                       # opens a browser to authorise
npx wrangler secret put APP_TOKEN        # paste a long random string, e.g. from: openssl rand -hex 24
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy                      # prints https://capiremo-api.<you>.workers.dev
```

On the phone, go to the home screen → ⚙ → code 2468 → **AI**, then:
- **Speech-to-text:** Server (OpenAI)
- **Server address:** the `workers.dev` URL
- **Access token:** the same `APP_TOKEN`

Then tap **Save server** and **Test connection**.

If the app is hosted somewhere other than `https://devalier.github.io`, add that origin to `ALLOWED_ORIGINS` in `wrangler.toml` and deploy again.

## Configuration (`wrangler.toml` `[vars]`)

| Var | Default | |
|---|---|---|
| `ALLOWED_ORIGINS` | GitHub Pages + localhost | Comma-separated |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Interpretation model. If Claude declines a request for safety reasons, the server-side fallback (`fallbacks: "default"`) retries it on another Claude model and reports which model answered. |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-transcribe` | Must accept a `prompt` for vocabulary hints |

## Cost (rough)

| Step | Cost |
|---|---|
| Transcription | Fractions of a cent per short voice message |
| Interpretation | About 2–4k input tokens per message with 30 training examples; at Opus 5.5 rates ($4 / $20 per million tokens) that is roughly 1–2¢ per message |
| Training "Run check" | Up to 15 transcriptions + 15 interpretations per run |

## Local development

```sh
npm test            # unit tests (provider calls mocked)
npx wrangler dev    # http://localhost:8787 — create server/.dev.vars with APP_TOKEN=..., OPENAI_API_KEY=..., ANTHROPIC_API_KEY=...
```

`.dev.vars` is git-ignored. Never commit keys.
