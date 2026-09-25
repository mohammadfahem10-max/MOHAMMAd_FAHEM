#!/usr/bin/env node
/* آزمون افزونه (Load unpacked) در Chromium: تزریق در دنیای اصلی صفحه + پل دانلود به زیرپوشهٔ «ثبت من». */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { server } = require('../نمونه/serve.js');

async function main() {
  let playwright;
  try { playwright = require('playwright'); } catch (e) { playwright = require(path.join(process.env.NODE_GLOBAL_MODULES || '/opt/node22/lib/node_modules', 'playwright')); }
  const ext = path.join(__dirname, '..', 'dist', 'افزونه');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sabtman-ext-'));
  const downloads = path.join(userData, 'dl');
  fs.mkdirSync(downloads);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await playwright.chromium.launchPersistentContext(userData, {
    headless: true, channel: 'chromium', viewport: { width: 1300, height: 850 }, downloadsPath: downloads, acceptDownloads: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  console.log('service worker افزونه:', sw ? sw.url() : 'یافت نشد');
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('console:', m.type(), m.text()));
  await page.goto(base + '/portal/estate/list-estate?noinject=1');
  await page.waitForSelector('#sabtman-root .sm-launch', { timeout: 15000 });
  const bridge = await page.evaluate(() => window.__sabtmanBridge);
  assert.strictEqual(bridge, 'extension', 'پرچم پل افزونه');
  await page.click('nav [data-sec=estate]');
  await page.waitForFunction(() => window.SabtMan.store.state.sections.size >= 1);
  await page.click('#sabtman-root .sm-launch');
  await page.click('#sabtman-root [data-path="/estate/GetEstatePersonList"]');
  // دانلودِ chrome.downloads رویداد صفحه نیست؛ در Chromium headless ممکن است بسته بماند و پل پس از ۱۰ ثانیه به دانلود معمولی برگردد.
  const dlPromise = page.waitForEvent('download', { timeout: 40000 }).catch(() => null);
  await page.click('#sabtman-root [data-act=dl-all]');
  const candidates = [path.join(downloads, 'ثبت من'), downloads, path.join(os.homedir(), 'Downloads', 'ثبت من')];
  let found = null, state = '';
  for (let i = 0; i < 80 && !found; i++) {
    await page.waitForTimeout(500);
    state = await page.evaluate(() => document.documentElement.getAttribute('data-sabtman-bridge'));
    if (state && state.startsWith('fallback')) break;
    for (const d of candidates) {
      try { const f = fs.readdirSync(d).find((n) => /^sabtman__.*\.zip$/.test(n)); if (f) { found = path.join(d, f); break; } } catch (e) { /* نیست */ }
    }
  }
  if (!found) { const dl = await dlPromise; if (dl) { found = path.join(downloads, dl.suggestedFilename()); await dl.saveAs(found); } }
  console.log('وضعیت پل:', state, '| بسته:', found);
  assert.ok(found, 'بسته نه از راه background و نه از راه پشتیبان ذخیره نشد');
  await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 8000))]);
  server.close();
  console.log('✓ آزمون افزونه گذشت');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
