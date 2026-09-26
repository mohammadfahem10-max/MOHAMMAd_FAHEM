#!/usr/bin/env node
/* آزمون معماری نهایی (بخش ۸ دستور کار) بدون ویندوز: دو صفحهٔ Chromium نقش دو WebView2 را دارند —
   «سایت پنهان» (قلاب.js تزریق‌شده) و «رابط برنامه» (برنامه/index.html) — و Node نقش پوسته (رله، صف بسته‌ها، وضعیت) را.
   جریان: ورود درون برنامه (کد ملی → ارسال کد → کد پیامکی) → گردآوری پشت پرده → پیشخوان با شمار داده‌ها → دانلود همه → بسته در صف پوسته. */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { server } = require('../نمونه/serve.js');
const zipNode = require('../بک‌اند-فایل/lib/zip.js');

const OUT = path.join(__dirname, '..', 'dist', 'e2e');

async function main() {
  let playwright;
  try { playwright = require('playwright'); } catch (e) { playwright = require(path.join(process.env.NODE_GLOBAL_MODULES || '/opt/node22/lib/node_modules', 'playwright')); }
  fs.mkdirSync(OUT, { recursive: true });
  const inbox = fs.mkdtempSync(path.join(os.tmpdir(), 'sabtman-inbox-'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const siteScript = fs.readFileSync(path.join(__dirname, '..', 'dist', 'پوسته-ویندوزی', 'قلاب.js'), 'utf8');

  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const errors = [];

  // ---- «پوسته» در Node: رله بین دو صفحه + صف بسته‌ها ----
  const shell = { dest: 'E:\\ثبت من\\خروجی', jobs: [], files: [], logs: [] };
  const pageSite = await ctx.newPage();
  const pageUi = await ctx.newPage();
  global.__pages = { pageSite, pageUi };
  for (const [name, pg] of [['site', pageSite], ['ui', pageUi]]) { pg.on('pageerror', (e) => errors.push(name + ': ' + e)); pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|401|404/.test(m.text())) errors.push(name + ': ' + m.text()); }); }
  const deliver = (pg, obj) => pg.evaluate((o) => window.chrome && window.chrome.webview && window.chrome.webview.__deliver && window.chrome.webview.__deliver(o), obj).catch(() => {});
  const stateMsg = () => ({ type: 'state', dest: shell.dest, mode: 'pdf+text', service: { running: true, browser: 'chrome', busy: false, lastText: '' } });
  await pageSite.exposeFunction('__shellPost', (raw) => { const m = JSON.parse(raw); deliver(pageUi, m); });
  await pageUi.exposeFunction('__shellPost', (raw) => {
    const m = JSON.parse(raw);
    if (m.type === 'site-cmd') return deliver(pageSite, m);
    if (m.type === 'job') { const p = path.join(inbox, m.name); fs.writeFileSync(p, Buffer.from(m.base64, 'base64')); shell.jobs.push(p); return; }
    if (m.type === 'file') { shell.files.push(m.name); return; }
    if (m.type === 'browse') { shell.dest = 'D:\\مقصد تازه'; deliver(pageUi, { type: 'dest', path: shell.dest }); return; }
    if (m.type === 'ready' || m.type === 'state' || m.type === 'setConfig') return deliver(pageUi, stateMsg());
    if (m.type === 'logout') { return pageSite.goto(base + '/auth/logout').catch(() => {}); }
  });
  const fakeWebView = () => {
    const L = [];
    window.chrome = window.chrome || {};
    window.chrome.webview = { postMessage: (m) => window.__shellPost(typeof m === 'string' ? m : JSON.stringify(m)), addEventListener: (t, cb) => { if (t === 'message') L.push(cb); }, __deliver: (o) => L.forEach((cb) => cb({ data: o })) };
  };
  await pageSite.addInitScript(fakeWebView);
  await pageSite.addInitScript({ content: 'window.__sabtmanSiteConfig = {};\n' + siteScript });
  await pageUi.addInitScript(fakeWebView);

  // ---- شروع: سایت پنهان روی صفحهٔ ورود، رابط برنامه باز ----
  await pageUi.goto(base + '/__app/index.html');
  await pageUi.waitForSelector('[data-f=nat]');
  await pageSite.goto(base + '/');
  await pageUi.waitForFunction(() => !document.querySelector('[data-act=send]').disabled, null, { timeout: 15000 });
  await pageUi.screenshot({ path: path.join(OUT, 'app-login.png') });

  // ---- ورود: کد ملی → ارسال کد → کد پیامکی ----
  await pageUi.fill('[data-f=nat]', '0012345678');
  await pageUi.click('[data-act=send]');
  await pageUi.waitForSelector('[data-f=otp]', { timeout: 30000 });
  assert.ok(await pageUi.textContent('.ap-msg.ok'), 'پیام ارسال کد');
  // کد نادرست
  await pageUi.fill('[data-f=otp]', '9999');
  await pageUi.click('[data-act=login]');
  await pageUi.waitForFunction(() => document.querySelector('.ap-msg.err') && /نادرست/.test(document.querySelector('.ap-msg.err').textContent), null, { timeout: 30000 });
  // کد درست
  await pageUi.fill('[data-f=otp]', '1234');
  await pageUi.click('[data-act=login]');

  // ---- گردآوری پشت پرده → پیشخوان ----
  await pageUi.waitForSelector('.ap-progress', { timeout: 30000 });
  await pageUi.screenshot({ path: path.join(OUT, 'app-collecting.png') });
  await pageUi.waitForSelector('.ap-grid', { timeout: 180000 });
  await pageUi.waitForFunction(() => !window.SabtMan.exporter.queue.items.length && !window.SabtMan.exporter.queue.running, null, { timeout: 120000 });
  await pageUi.evaluate(() => window.SabtMan.app.go('dashboard'));
  await pageUi.screenshot({ path: path.join(OUT, 'app-dashboard.png') });
  const tiles = await pageUi.evaluate(() => [...document.querySelectorAll('.ap-tile')].map((t) => ({ title: t.querySelector('h3').textContent, big: (t.querySelector('.big') || {}).textContent || '' })));
  console.log('پیشخوان:', tiles);
  const sections = await pageUi.evaluate(() => [...window.SabtMan.store.state.sections.values()].map((s) => ({ path: s.path, n: s.records.length, tl: s.timelines.size, att: s.attachments.size })));
  console.log('بخش‌ها:', sections);
  const mech = sections.find((s) => s.path === '/mechLetter/GetStatusList');
  assert.ok(mech && mech.n === 6, 'مکاتبات با صفحه‌بندی کامل (۶ رکورد از ۲ صفحه)');
  assert.strictEqual(mech.tl, 6, 'روند همهٔ رکوردها از راه بازپخش در سایت پنهان');
  assert.ok(sections.find((s) => s.path === '/ssar/getalldocuments' && s.n === 3), 'اسناد رسمی');
  assert.ok(sections.find((s) => s.path === '/profile/GetInfo' && s.n === 1), 'پروفایل');
  assert.ok(tiles.find((t) => t.title === 'وضعیت مکاتبات' && /۶/.test(t.big)), 'کارت مکاتبات: ۶ داده');

  // ---- مشاهدهٔ بخش (پنل جاسازی‌شده) و دانلود همه → بسته در صف پوسته ----
  await pageUi.click('.ap-tile [data-view="/mechLetter/GetStatusList"]');
  await pageUi.waitForSelector('#sabtman-root table.sm-table');
  await pageUi.screenshot({ path: path.join(OUT, 'app-section.png') });
  await pageUi.click('#sabtman-root [data-act=dl-all]');
  await pageUi.waitForFunction(() => window.SabtMan.store.state.log.some((l) => /فرستاده شد/.test(l.text)), null, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(shell.jobs.length, 1, 'یک بستهٔ کار');
  const entries = zipNode.read(fs.readFileSync(shell.jobs[0]));
  const manifest = JSON.parse(entries.find((e) => e.name === 'manifest.json').data.toString('utf8'));
  assert.strictEqual(manifest['پوشه‌ها'].length, 6);
  assert.ok(entries.some((e) => /۲ پیوست‌ها\/اخطاریه نمونه\.pdf$/.test(e.name)), 'پیوست با نام اصل از سایت پنهان');
  assert.ok(entries.some((e) => /کارنامهٔ روند/.test(e.name)), 'کارنامهٔ روند');

  // ---- تنظیمات: انتخاب پوشهٔ مقصد از راه پوسته ----
  await pageUi.evaluate(() => window.SabtMan.app.go('settings'));
  await pageUi.click('[data-act=browse]');
  await pageUi.waitForFunction(() => /مقصد تازه/.test(document.querySelector('[data-role=dest]').textContent));
  await pageUi.screenshot({ path: path.join(OUT, 'app-settings.png') });

  // ---- پایان نشست → صفحهٔ ورود ----
  await pageSite.evaluate(() => fetch('/__mock/expire', { method: 'POST' }));
  const rep = await pageUi.evaluate(() => window.SabtMan.hook.replay({ method: 'POST', url: location.origin + '/mechLetter/GetStatusList', headers: { 'content-type': 'application/json' }, body: '{}' }).then((r) => 'ok:' + r.status).catch((e) => 'err:' + e.message + ':' + e.code));
  console.log('بازپخش پس از پایان نشست:', rep, '| sessionExpired:', await pageUi.evaluate(() => window.SabtMan.hook.sessionExpired));
  await pageUi.waitForSelector('[data-f=nat]', { timeout: 15000 });
  assert.ok(/نشست تمام شد/.test(await pageUi.textContent('.ap-msg')), 'پیام پایان نشست');

  await browser.close();
  server.close();
  fs.rmSync(inbox, { recursive: true, force: true });
  if (errors.length) { console.error('خطاهای صفحه:', errors); process.exit(1); }
  console.log('✓ آزمون معماری نهایی (ورود درون برنامه، سایت پنهان، پیشخوان) گذشت');
}

main().catch(async (e) => {
  console.error(e);
  try { if (global.__pages) { await global.__pages.pageUi.screenshot({ path: path.join(OUT, 'app-fail-ui.png') }); await global.__pages.pageSite.screenshot({ path: path.join(OUT, 'app-fail-site.png') }); console.log('UI:', await global.__pages.pageUi.evaluate(() => document.querySelector('.ap-main').innerText.slice(0, 600))); } } catch (x) { /* ادامه */ }
  process.exit(1);
});
