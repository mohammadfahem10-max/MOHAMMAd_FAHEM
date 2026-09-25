#!/usr/bin/env node
/* آزمون پل پوستهٔ ویندوزی: window.chrome.webview شبیه‌سازی می‌شود؛ بستهٔ کار باید با postMessage (نه دانلود) به پوسته برسد،
   پیام‌های پوسته (state/dest/toggle/settings) در رابط اثر کنند، و فایل‌های دیگر با پیام «file» بروند. */
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { server } = require('../نمونه/serve.js');
const zipNode = require('../بک‌اند-فایل/lib/zip.js');

async function main() {
  let playwright;
  try { playwright = require('playwright'); } catch (e) { playwright = require(path.join(process.env.NODE_GLOBAL_MODULES || '/opt/node22/lib/node_modules', 'playwright')); }
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => {
    // شبیه‌ساز WebView2: پیام‌های رابط را نگه می‌دارد و می‌تواند پیام پوسته را تحویل دهد
    const listeners = [];
    window.__shellInbox = [];
    window.chrome = window.chrome || {};
    window.chrome.webview = {
      postMessage: (m) => { window.__shellInbox.push(typeof m === 'string' ? JSON.parse(m) : m); },
      addEventListener: (type, cb) => { if (type === 'message') listeners.push(cb); },
      __deliver: (obj) => listeners.forEach((cb) => cb({ data: obj })),
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let downloads = 0;
  page.on('download', () => downloads++);

  await page.goto(base + '/portal/mechLetter/status-viwe');
  await page.waitForSelector('#sabtman-root .sm-launch');
  // ۱) رابط هنگام شروع «ready» می‌فرستد
  await page.waitForFunction(() => window.__shellInbox.some((m) => m.type === 'ready'));

  // ۲) پیام state از پوسته → نوار پایین
  await page.evaluate(() => window.chrome.webview.__deliver({ type: 'state', dest: 'E:\\ثبت من\\خروجی', mode: 'pdf+text', service: { running: true, browser: 'msedge.exe', busy: false, lastText: 'آماده' } }));
  await page.click('#sabtman-root .sm-launch');
  await page.waitForFunction(() => /سرویس فایل فعال/.test(document.querySelector('#sabtman-root [data-role=shell]').textContent));

  // ۳) toggle از نوار بالای پوسته پنل را می‌بندد/باز می‌کند
  await page.evaluate(() => window.chrome.webview.__deliver({ type: 'toggle' }));
  await page.waitForFunction(() => !document.getElementById('sabtman-root').classList.contains('sm-open'));
  await page.evaluate(() => window.chrome.webview.__deliver({ type: 'toggle' }));
  await page.waitForFunction(() => document.getElementById('sabtman-root').classList.contains('sm-open'));

  // ۴) داده + دانلود کلی → پیام job (نه دانلود مرورگر)
  await page.click('#sabtman-root [data-act=close]');
  await page.click('nav [data-sec=mech]');
  await page.waitForFunction(() => window.SabtMan.store.state.sections.size >= 1);
  await page.click('#sabtman-root .sm-launch');
  await page.evaluate(() => window.SabtMan.store.setSetting('delayMs', 30));
  await page.click('#sabtman-root [data-act=dl-all]');
  await page.waitForFunction(() => window.__shellInbox.some((m) => m.type === 'job'), null, { timeout: 30000 });
  const job = await page.evaluate(() => window.__shellInbox.find((m) => m.type === 'job'));
  assert.ok(/^sabtman__[a-z0-9]+\.zip$/.test(job.name), 'نام بسته');
  const entries = zipNode.read(Buffer.from(job.base64, 'base64'));
  const manifest = JSON.parse(entries.find((e) => e.name === 'manifest.json').data.toString('utf8'));
  assert.strictEqual(manifest['پوشه‌ها'].length, 6, 'شش پوشهٔ پرونده');
  assert.strictEqual(downloads, 0, 'هیچ دانلود مرورگری نباید رخ دهد');

  // ۵) «settings» از پوسته → مودال تنظیمات با پوشهٔ مقصد و دکمه‌های انتخاب/بازکردن
  await page.evaluate(() => window.chrome.webview.__deliver({ type: 'settings' }));
  await page.waitForSelector('#sabtman-root .sm-modal [data-act=browse]');
  assert.ok((await page.textContent('#sabtman-root [data-role=dest]')).includes('E:\\ثبت من'));
  await page.click('#sabtman-root .sm-modal [data-act=browse]');
  await page.waitForFunction(() => window.__shellInbox.some((m) => m.type === 'browse'));
  await page.evaluate(() => window.chrome.webview.__deliver({ type: 'dest', path: 'D:\\مقصد تازه' }));
  await page.waitForFunction(() => document.querySelector('#sabtman-root [data-role=dest]').textContent.includes('مقصد تازه'));
  await page.click('#sabtman-root .sm-modal [data-act=x]');

  // ۶) نقشهٔ کشف‌شده → پیام file
  await page.click('#sabtman-root [data-act=map]');
  await page.waitForFunction(() => window.__shellInbox.some((m) => m.type === 'file' && /نقشهٔ کشف‌شده/.test(m.name)));
  await page.screenshot({ path: path.join(__dirname, '..', 'dist', 'e2e', 'shell-bridge.png') }).catch(() => {});

  await browser.close();
  server.close();
  const real = errors.filter((e) => !/favicon|ERR_ABORTED/.test(e));
  if (real.length) { console.error('خطاهای صفحه:', real); process.exit(1); }
  console.log('✓ آزمون پل پوسته گذشت');
}

main().catch((e) => { console.error(e); process.exit(1); });
