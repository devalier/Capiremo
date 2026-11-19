// Renders public/icons/icon.svg to the PNG sizes the manifest and iOS need.
// Requires Playwright with Chromium available (not a project dependency).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // global install is fine
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (f) => new URL(`../public/icons/${f}`, import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size, file, { maskable = false, rounded = true } = {}) {
  await page.setViewportSize({ width: size, height: size });
  let s = svg;
  if (!rounded) s = s.replace('rx="96"', 'rx="0"');
  const inner = maskable ? `<div style="width:100%;height:100%;background:#0b1a2b;display:flex;align-items:center;justify-content:center"><div style="width:80%;height:80%">${s}</div></div>` : s;
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${inner.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: out(file), omitBackground: !maskable && rounded });
}

await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-512-maskable.png', { maskable: true, rounded: false });
await render(180, 'apple-touch-icon.png', { rounded: false }); // iOS applies its own mask
await browser.close();
