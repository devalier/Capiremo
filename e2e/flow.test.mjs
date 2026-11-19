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

  await page.getByRole('button', { name: 'Caregiver' }).click();
  await page.getByLabel('Code').fill('2468');
  await page.getByText('Machine transcription (raw)').waitFor();
  await page.getByText('No speech-to-text service is connected').waitFor();
  await page.getByText('AI suggestion — unverified guess').waitFor();
  await page.getByPlaceholder('What was actually meant').fill('Hello son');
  await btn(page, 'Save').click();
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
  assert.equal(await page.getByText('Stefania').count(), 0);

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
  await page.getByRole('button', { name: 'Caregiver' }).click();
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
