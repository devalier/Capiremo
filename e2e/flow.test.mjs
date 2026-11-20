// End-to-end checks against the production build, in Chromium with a fake microphone.
// Run: npm run e2e   (uses the globally installed Playwright; WebKit/iOS still needs real-device testing)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
const SHOTS = new globalThis.URL('./artifacts/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

let server;
let browser;

before(async () => {
  server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(URL)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
});

after(async () => {
  await browser?.close();
  if (server) process.kill(-server.pid);
});

async function phone({ mic = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: mic ? ['microphone'] : [],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto(URL);
  return { ctx, page, errors };
}

const btn = (page, name) => page.getByRole('button', { name, exact: false });

const key = (page, k) => page.getByRole('button', { name: k, exact: true });

/** Tap a contact; if no number is set yet, enter one on the keypad first. */
async function openContact(page, name = 'Paul', digits = '3331234567') {
  await btn(page, name).click();
  if (await page.locator('.keypad').isVisible()) {
    for (const d of digits) await key(page, d).click();
    await btn(page, 'SAVE').click();
  }
  await btn(page, 'TALK').waitFor();
}

async function record(page, ms = 1500) {
  await openContact(page);
  await btn(page, 'TALK').click();
  await page.getByText('Recording…').waitFor();
  await page.waitForTimeout(ms);
  await btn(page, 'STOP').click();
  await page.getByText('Your message to Paul').waitFor();
}

test('record → review → send → messages → play', async () => {
  const { ctx, page, errors } = await phone();
  await page.screenshot({ path: `${SHOTS}home.png` });
  await openContact(page);
  await page.screenshot({ path: `${SHOTS}person.png` });
  await btn(page, 'TALK').click();
  await page.getByText('Recording…').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}recording.png` });
  await btn(page, 'STOP').click();
  await page.getByText('Your message to Paul').waitFor();
  await page.screenshot({ path: `${SHOTS}review.png` });
  assert.equal(await page.getByText('DEMO SOUND').count(), 0, 'real (fake-device) mic should not be marked demo');

  await btn(page, 'LISTEN').click();
  await btn(page, 'SEND').click();
  await page.getByText('Sent to Paul').waitFor();
  await page.getByText('not delivered yet').waitFor(); // honest local-only status
  await page.screenshot({ path: `${SHOTS}sent.png` });

  await btn(page, 'MESSAGES').click();
  const items = page.locator('.msg');
  assert.equal(await items.count(), 1);
  await page.screenshot({ path: `${SHOTS}messages.png` });
  await btn(page, 'Play: You').click();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('nothing is auto-sent; a draft survives reload', async () => {
  const { ctx, page } = await phone();
  await record(page);
  await page.reload();
  await page.getByText('Unsent message for Paul').waitFor();
  await page.screenshot({ path: `${SHOTS}restored.png` });
  await btn(page, 'OPEN').click();
  await page.getByText('Your message to Paul').waitFor();
  await btn(page, 'HOME').click();
  await openContact(page);
  await btn(page, 'MESSAGES').click();
  assert.equal(await page.locator('.msg').count(), 0, 'no message was sent');
  await ctx.close();
});

test('cancel needs confirmation and can be undone', async () => {
  const { ctx, page } = await phone();
  await record(page);
  await btn(page, 'CANCEL').click();
  await page.getByText('Delete this recording?').waitFor();
  await page.screenshot({ path: `${SHOTS}confirm.png` });
  await btn(page, 'NO, KEEP IT').click();
  await page.getByText('Your message to Paul').waitFor();
  await btn(page, 'CANCEL').click();
  await btn(page, 'YES, DELETE').click();
  await btn(page, 'BRING BACK DELETED RECORDING').waitFor();
  await page.waitForTimeout(300); // let the IndexedDB write commit (a real reload is never this fast)
  await page.reload(); // undo survives reload
  await btn(page, 'BRING BACK DELETED RECORDING').click();
  await page.getByText('Your message to Paul').waitFor();
  await ctx.close();
});

test('interruption while recording keeps the audio', async () => {
  const { ctx, page } = await phone();
  await openContact(page);
  await btn(page, 'TALK').click();
  await page.getByText('Recording…').waitFor();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByText('The recording was interrupted').waitFor();
  await btn(page, 'SEND').waitFor();
  await ctx.close();
});

test('microphone denied → clear message → demo fallback', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.goto(URL);
  await openContact(page);
  await btn(page, 'TALK').click();
  await page.getByText('The microphone is not allowed').waitFor();
  await page.screenshot({ path: `${SHOTS}denied.png` });
  await btn(page, 'USE DEMO SOUND').click();
  await page.getByText('Recording…').waitFor();
  await page.waitForTimeout(800);
  await btn(page, 'STOP').click();
  await page.getByText('DEMO SOUND').waitFor();
  await ctx.close();
});

test('caregiver: gate, simulated reply, recipient layers', async () => {
  const { ctx, page } = await phone();
  await record(page, 800);
  await btn(page, 'SEND').click();
  await page.getByText('Sent to Paul').waitFor();
  await btn(page, 'HOME').click();

  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByLabel('Code').fill('2468');
  await page.getByText('Machine transcription (raw)').waitFor();
  await page.getByText('Not transcribed (speech-to-text is off)').waitFor();
  await page.getByText('AI suggestion — unverified guess').waitFor();
  await page.getByPlaceholder('What was actually meant').fill('Hello son');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Confirmed meaning (human-verified)').waitFor();
  await page.getByText('speaker approval: not asked').waitFor();

  await btn(page, 'Record reply').click();
  await page.waitForTimeout(800);
  await btn(page, 'Stop and save').click();
  await page.screenshot({ path: `${SHOTS}caregiver.png`, fullPage: true });
  await btn(page, 'Done').click();

  await page.locator('.tile .badge').first().waitFor();
  await page.screenshot({ path: `${SHOTS}home-new.png` });
  await openContact(page);
  await btn(page, 'MESSAGES').click();
  assert.equal(await page.locator('.msg').count(), 2);
  await btn(page, 'Play: Paul').click();
  await page.waitForTimeout(300);
  await btn(page, 'HOME').click();
  assert.equal(await page.locator('.tile .badge').count(), 0, 'played message no longer NEW');
  await ctx.close();
});

test('no horizontal overflow and primary targets are large', async () => {
  const { ctx, page } = await phone();
  const tiles = await page.locator('.tile').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.equal(tiles.length, 4);
  assert.ok(tiles.every((h) => h >= 120), `small tile: ${tiles}`);
  for (const step of [async () => {}, async () => openContact(page)]) {
    await step();
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw, `horizontal overflow ${sw} > ${cw}`);
  }
  const talk = await btn(page, 'TALK').boundingBox();
  assert.ok(talk.height >= 140, `TALK height ${talk.height}`);
  const all = await page.locator('button.big').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.ok(all.every((h) => h >= 72), `small button: ${all}`);
  await ctx.close();
});

test('default contacts; keypad with country selector; caregiver renames and changes numbers', async () => {
  const { ctx, page, errors } = await phone();
  for (const n of ['Paul', 'Francesca', 'Izumi', 'Dan']) await btn(page, n).waitFor();

  // No number yet → keypad, full screen, no HOME bar
  await btn(page, 'Izumi').click();
  await page.locator('.keypad').waitFor();
  assert.equal(await btn(page, 'HOME').count(), 0);
  await page.screenshot({ path: `${SHOTS}keypad.png` });
  const keys = await page.locator('.key').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  assert.equal(keys.length, 12);
  assert.ok(keys.every((r) => r.height >= 72 && r.width >= 100), 'keys are large');
  assert.ok(await btn(page, 'SAVE').isDisabled(), 'save disabled while empty');

  // Choose Japan, type national number with trunk 0
  await page.locator('.country-btn').click();
  await page.screenshot({ path: `${SHOTS}countries.png` });
  await page.getByRole('button', { name: /Japan/ }).click();
  for (const d of '09012345678') await key(page, d).click();
  await key(page, 'Delete last digit').click();
  await key(page, '8').click();
  await btn(page, 'SAVE').click();
  await page.getByText('+81 901 234 5678').waitFor();

  // Cancel leaves number unset
  await btn(page, 'HOME').click();
  await btn(page, 'Dan').click();
  await page.locator('.keypad').waitFor();
  await btn(page, 'CANCEL').click();
  await btn(page, 'Dan').click();
  await page.locator('.keypad').waitFor();

  // '+' typed first → international, country button disabled
  await key(page, '+').click();
  assert.ok(await page.locator('.country-btn').isDisabled());
  for (const d of '447700900123') await key(page, d).click();
  await btn(page, 'SAVE').click();
  await page.getByText('+44 770 090 0123').waitFor();
  await btn(page, 'HOME').click();

  // Caregiver: rename, change number, add/remove capped at 4
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByLabel('Code').fill('2468');
  assert.equal(await btn(page, '+ Add contact').count(), 0, 'already 4 contacts');
  await page.getByLabel('Name of Dan').fill('Daniel');
  const izumi = page.locator('.cg-contact').nth(2);
  await izumi.getByRole('button', { name: 'Change number' }).click();
  await page.locator('.keypad').waitFor();
  for (const d of '3339876543') await key(page, d).click();
  await page.locator('.country-btn').click();
  await page.getByRole('button', { name: /Italia/ }).click();
  await btn(page, 'SAVE').click();
  await page.getByText('+39 333 987 6543').waitFor(); // back in caregiver, still unlocked
  await page.locator('.cg-contact').nth(3).getByRole('button', { name: 'Remove contact' }).click();
  await btn(page, 'Yes, remove').click();
  await btn(page, '+ Add contact').waitFor();
  await page.screenshot({ path: `${SHOTS}caregiver-contacts.png`, fullPage: true });
  await btn(page, 'Done').click();
  await page.reload();
  assert.equal(await page.locator('.tile').count(), 3);
  assert.equal(await page.getByText('Daniel').count(), 0);
  await page.screenshot({ path: `${SHOTS}home-3.png` });
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- AI: mocked Capiremo server ----------
const API = 'https://api.capiremo.test';
const TOKEN = 'family-token-0123456789';

/** Fake server: records requests; transcription always returns "chow pole come sty". */
async function mockServer(ctx, { interpretReply } = {}) {
  const log = { transcribe: [], interpret: [] };
  await ctx.route(`${API}/**`, async (route) => {
    const req = route.request();
    const path = new globalThis.URL(req.url()).pathname;
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (req.headers().authorization !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, headers, body: '{"error":"unauthorised"}' });
    if (path === '/health')
      return route.fulfill({ headers, body: JSON.stringify({ ok: true, transcribe: true, interpret: true, model: 'claude-opus-5-5', transcribeModel: 'gpt-4o-transcribe' }) });
    if (path === '/transcribe') {
      const body = req.postDataBuffer()?.toString('latin1') ?? '';
      const prompt = /name="prompt"\r\n\r\n([^\r]*)/.exec(body)?.[1] ?? '';
      log.transcribe.push({ prompt, bytes: body.length });
      return route.fulfill({ headers, body: JSON.stringify({ text: 'chow pole come sty', language: null, provider: 'openai:gpt-4o-transcribe' }) });
    }
    if (path === '/interpret') {
      const input = JSON.parse(req.postData());
      log.interpret.push(input);
      const reply = interpretReply?.(input) ?? {
        readings: [{ text: 'Ciao Paul, come stai?', uncertainty_notes: ['"sty" could be "stai"'] }],
        indeterminate: false,
        note: '',
      };
      return route.fulfill({ headers, body: JSON.stringify({ ...reply, model: 'claude-opus-5-5' }) });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });
  return log;
}

async function openAdmin(page) {
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  if (await page.getByLabel('Code').isVisible()) await page.getByLabel('Code').fill('2468');
  await page.getByRole('heading', { name: 'Admin' }).waitFor();
}

async function connectServer(page) {
  await openAdmin(page);
  await page.getByLabel('Speech-to-text engine').selectOption('server');
  await page.getByLabel('Server address').fill(API);
  await page.getByLabel('Access token').fill(TOKEN);
  await btn(page, 'Save server').click();
  await btn(page, 'Test connection').click();
  await page.getByText('Connected. Speech-to-text: gpt-4o-transcribe. Interpretation: claude-opus-5-5.').waitFor();
}

test('admin gear is small and does not crowd the four contacts', async () => {
  const { ctx, page } = await phone();
  const gear = await page.getByRole('button', { name: 'Admin', exact: true }).boundingBox();
  assert.ok(gear.width <= 52 && gear.height <= 52 && gear.width >= 44, `gear ${gear.width}x${gear.height}`);
  const lastTile = await page.locator('.tile').last().boundingBox();
  assert.ok(lastTile.y + lastTile.height <= gear.y + 1, 'gear below tiles');
  assert.ok(gear.y + gear.height <= 844, 'gear visible without scrolling');
  await ctx.close();
});

test('message text: machine transcript and AI guess, shown separately', async () => {
  const { ctx, page, errors } = await phone();
  const log = await mockServer(ctx);
  await connectServer(page);
  await btn(page, 'Done').click();

  await record(page, 1000);
  await btn(page, 'SEND').click();
  await page.getByText('Sent to Paul').waitFor();
  await btn(page, 'MESSAGES').click();
  await btn(page, 'TEXT: You').click();
  await page.getByText('Machine heard').waitFor();
  await page.getByText('chow pole come sty').waitFor();
  await page.getByText('AI guess — may be wrong').waitFor();
  await page.getByText('Ciao Paul, come stai?').waitFor();
  await page.screenshot({ path: `${SHOTS}message-text.png` });
  assert.equal(log.transcribe.length, 1);
  assert.match(log.transcribe[0].prompt, /^Paul, Francesca, Izumi, Dan/);
  assert.ok(log.transcribe[0].bytes > 1000, 'audio uploaded');
  assert.equal(log.interpret[0].asrText, 'chow pole come sty');
  assert.deepEqual(log.interpret[0].examples, []);

  // Collapses; PLAY still independent
  await btn(page, 'HIDE TEXT: You').click();
  assert.equal(await page.getByText('Machine heard').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('AI abstains → says it is unsure, keeps the raw transcript', async () => {
  const { ctx, page } = await phone();
  await mockServer(ctx, { interpretReply: () => ({ readings: [], indeterminate: true, note: 'Too garbled.' }) });
  await connectServer(page);
  await btn(page, 'Done').click();
  await record(page, 800);
  await btn(page, 'SEND').click();
  await btn(page, 'MESSAGES').click();
  await btn(page, 'TEXT: You').click();
  await page.getByText('AI is not sure what was meant').waitFor();
  await page.getByText('Too garbled.').waitFor();
  await page.getByText('chow pole come sty').waitFor();
  assert.equal(await page.getByText('AI guess — may be wrong').count(), 0);
  await ctx.close();
});

test('speech-to-text off: message has no text, offers nothing to transcribe', async () => {
  const { ctx, page } = await phone();
  await record(page, 800);
  await btn(page, 'SEND').click();
  await btn(page, 'MESSAGES').click();
  await btn(page, 'TEXT: You').click();
  await page.getByText('No text yet').waitFor();
  await page.getByText('Speech-to-text is off').waitFor();
  assert.equal(await btn(page, 'MAKE TEXT').count(), 0);
  await ctx.close();
});

test('train: record phrase, confirm, examples and hints feed later requests; check is leave-one-out', async () => {
  const { ctx, page, errors } = await phone();
  const log = await mockServer(ctx);
  await connectServer(page);
  await btn(page, 'Train voice').click();
  await page.getByRole('heading', { name: 'Train' }).waitFor();
  const phrase = await page.getByTestId('phrase').textContent();
  assert.equal(phrase, 'Ciao Paul, come stai?');

  for (let i = 0; i < 2; i++) {
    await btn(page, '● Record').click();
    await page.waitForTimeout(700);
    await btn(page, '■ Stop').click();
    await page.getByTestId('train-heard').waitFor();
    if (i === 1) {
      // second recording: correct the prefilled text by hand
      await page.getByPlaceholder('Type exactly what was said').fill('Paul, vieni domenica');
    }
    await btn(page, 'Save as confirmed').click();
  }
  await page.getByText('Saved recordings (2)').waitFor();
  await page.getByLabel('Vocabulary').fill('Torino\nnonna');
  await btn(page, 'Save words').click();
  await page.screenshot({ path: `${SHOTS}train.png`, fullPage: true });

  // Improvement check: each recording is evaluated without its own example
  const before = log.interpret.length;
  await btn(page, 'Run check').click();
  await page.getByText('Checked 2 recordings.').waitFor();
  const checks = log.interpret.slice(before);
  assert.equal(checks.length, 2);
  for (const c of checks) assert.equal(c.examples.length, 1, 'leave-one-out');
  const checkPrompts = log.transcribe.slice(-2).map((t) => t.prompt);
  assert.ok(checkPrompts.every((p) => p.includes('Torino, nonna')), 'vocabulary hint');
  assert.ok(checkPrompts.some((p) => !p.includes('Paul, vieni domenica')), 'own sentence excluded from hint');
  assert.notEqual(await page.getByTestId('score-raw').textContent(), '—');
  assert.notEqual(await page.getByTestId('score-ai').textContent(), '—');
  await page.screenshot({ path: `${SHOTS}train-check.png`, fullPage: true });

  // Training persists and is used for real messages
  await page.goto(URL);
  await openContact(page);
  await btn(page, 'TALK').click();
  await page.getByText('Recording…').waitFor();
  await page.waitForTimeout(600);
  await btn(page, 'STOP').click();
  await btn(page, 'SEND').click();
  await btn(page, 'MESSAGES').click();
  await btn(page, 'TEXT: You').click();
  await page.getByText('Ciao Paul, come stai?').first().waitFor();
  const last = log.interpret.at(-1);
  assert.equal(last.examples.length, 2);
  assert.deepEqual(last.examples.map((e) => e.meant).sort(), ['Ciao Paul, come stai?', 'Paul, vieni domenica']);
  assert.deepEqual(last.vocabulary, ['Torino', 'nonna']);
  assert.deepEqual(errors, []);
  await ctx.close();
});
