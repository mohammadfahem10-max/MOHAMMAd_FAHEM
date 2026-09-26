#!/usr/bin/env node
/* آزمون سرتاسری رابط روی سایت نمونه با Chromium (Playwright از محیط توسعه؛ روی رایانهٔ کاربر لازم نیست).
   اجرا: node ابزار/build.js && node آزمون/e2e-overlay.js */
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { server } = require('../نمونه/serve.js');

const OUT = process.env.SABTMAN_E2E_OUT || path.join(__dirname, '..', 'dist', 'e2e');

async function main() {
  let playwright;
  try { playwright = require('playwright'); } catch (e) { playwright = require(path.join(process.env.NODE_GLOBAL_MODULES || '/opt/node22/lib/node_modules', 'playwright')); }
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await ctx.addCookies([{ name: 'sm_session', value: '1', url: base }]); // نشستِ واردشدهٔ سایت نمونه
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(base + '/portal/mechLetter/status-viwe');
  await page.waitForSelector('#sabtman-root .sm-launch');

  // ۱) بخش مکاتبات (fetch)
  await page.click('nav [data-sec=mech]');
  await page.waitForFunction(() => window.SabtMan.store.state.sections.size >= 1);
  await page.click('main [data-page="2"]'); // صفحهٔ دوم (پوشش صفحه‌بندی)
  await page.waitForFunction(() => window.SabtMan.store.state.sections.get('/mechLetter/GetStatusList').records.length === 6);
  // ۲) اسناد رسمی (XHR) + املاک + ثبت موقت + پروفایل
  for (const s of ['ssar', 'estate', 'ilenc', 'profile']) { await page.click(`nav [data-sec=${s}]`); await page.waitForTimeout(150); }
  await page.waitForFunction(() => window.SabtMan.store.state.sections.size >= 5);
  const sections = await page.evaluate(() => [...window.SabtMan.store.state.sections.values()].map((s) => ({ path: s.path, n: s.records.length, cols: s.columns.length, counters: s.counters.map((c) => c.key), label: window.SabtMan.store.labelFor(s.path) })));
  console.log('بخش‌ها:', sections);
  assert.strictEqual(sections.find((s) => s.path === '/mechLetter/GetStatusList').n, 6, 'شمار مکاتبات');
  assert.strictEqual(sections.find((s) => s.path === '/ssar/getalldocuments').n, 3, 'اسناد رسمی (XHR)');
  assert.strictEqual(sections.find((s) => s.path === '/profile/GetInfo').n, 1, 'پروفایل (شیء)');
  assert.ok(!sections.some((s) => s.path.includes('i18n')), 'پارازیت نباید بخش شود');
  assert.ok(sections.find((s) => s.path === '/mechLetter/GetStatusList').counters.includes('DocumentType'), 'شمارشگر نوع مدرک');

  // ۳) یادگیری «گزارشات» و «پیوست‌ها» از یک کلیک کاربر در سایت
  await page.click('nav [data-sec=mech]');
  await page.waitForSelector('[data-rep="910001"]');
  await page.click('main [data-page="2"]'); await page.waitForSelector('[data-rep="910005"]'); await page.click('main [data-page="1"]'); await page.waitForSelector('[data-rep="910001"]');
  await page.click('[data-rep="910001"]');
  await page.waitForFunction(() => window.SabtMan.store.linksFor('/mechLetter/GetStatusList', 'روند').length === 1);
  await page.click('[data-att="910001"]');
  await page.waitForFunction(() => window.SabtMan.store.linksFor('/mechLetter/GetStatusList', 'پیوست‌ها').length === 1);
  await page.click('[data-file="770001"]');
  await page.waitForFunction(() => window.SabtMan.store.linksFor('/mechLetter/GetStatusList', 'فایل').length === 1);
  const links = await page.evaluate(() => window.SabtMan.store.state.links.map((l) => ({ kind: l.kind, child: l.child, idField: l.idField, body: l.bodyTemplate, url: l.urlTemplate })));
  console.log('پیوندها:', links);

  // ۴) گرفتن روند همه از پنل
  await page.click('#sabtman-root .sm-launch');
  await page.click('#sabtman-root [data-path="/mechLetter/GetStatusList"]');
  await page.evaluate(() => { window.SabtMan.store.setSetting('delayMs', 50); });
  await page.click('#sabtman-root [data-act=tl-all]');
  await page.click('#sabtman-root [data-act=att-all]');
  await page.waitForFunction(() => window.SabtMan.store.state.sections.get('/mechLetter/GetStatusList').timelines.size === 6, null, { timeout: 15000 });
  await page.waitForFunction(() => !window.SabtMan.exporter.queue.items.length && !window.SabtMan.exporter.queue.running, null, { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, 'panel.png') });

  // ۵) پایان نشست → توقف نرم → ورود دوباره → ادامه
  await page.click('#sabtman-root [data-act=close]');
  await page.click('nav [data-sec=expire]');
  await page.waitForFunction(() => window.SabtMan.hook.sessionExpired);
  await page.click('#sabtman-root .sm-launch');
  await page.waitForSelector('#sabtman-root .sm-banner');
  await page.screenshot({ path: path.join(OUT, 'session-expired.png') });
  await page.click('#sabtman-root [data-act=close]');
  await page.click('nav [data-sec=login]');
  await page.waitForFunction(() => !window.SabtMan.hook.sessionExpired);
  await page.click('#sabtman-root .sm-launch');

  // ۶) مشاهدهٔ رکورد + پیش‌نمایش
  await page.click('#sabtman-root tr[data-key] [data-act=view]');
  await page.waitForSelector('#sabtman-root .sm-modal');
  await page.click('#sabtman-root [data-tab=sheet]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'sheet-preview.png') });
  const sheetHtml = await page.evaluate(() => document.querySelector('#sabtman-root iframe').srcdoc);
  assert.ok(sheetHtml.includes('تهیه و تنظیم: محمدعلی کریمی‌پور'), 'امضای رسمی');
  assert.ok(sheetHtml.includes('class="stamp"'), 'مهر ضدکپی');
  await page.click('#sabtman-root .sm-modal [data-act=x]');

  // ۷) دانلود کلی (PDF + متن) → بستهٔ zip
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#sabtman-root [data-act=dl-all]')]);
  const zipPath = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(zipPath);
  console.log('بستهٔ دانلود:', zipPath, fs.statSync(zipPath).size, 'بایت');
  assert.ok(dl.suggestedFilename().startsWith('sabtman__'), 'پیشوند بسته');
  const zipNode = require('../بک‌اند-فایل/lib/zip.js');
  const entries = zipNode.read(fs.readFileSync(zipPath));
  const manifest = JSON.parse(entries.find((e) => e.name === 'manifest.json').data.toString('utf8'));
  assert.strictEqual(manifest['مسیر'], '/mechLetter/GetStatusList', 'بسته باید برای بخش جاری باشد');
  assert.strictEqual(manifest['پوشه‌ها'].length, 6, 'شش پوشهٔ پرونده');
  assert.ok(entries.some((e) => e.name.endsWith('۲ پیوست‌ها/اخطاریه نمونه.pdf')), 'پیوست با نام اصل');
  assert.ok(entries.some((e) => /کارنامهٔ روند .*\.pdf\.html$/.test(e.name)), 'کارنامهٔ روند');

  // ۸) بستهٔ گزارش
  await page.click('#sabtman-root [data-act=report]');
  await page.waitForSelector('#sabtman-root .sm-modal iframe');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'report-preview.png') });
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#sabtman-root .sm-modal .mf [data-act=dl]')]);
  await dl2.saveAs(path.join(OUT, 'report-' + dl2.suggestedFilename()));

  // ۹) نقشهٔ کشف‌شده: بدون مقدار
  const map = await page.evaluate(() => window.SabtMan.hook.exportDiscovery());
  const mapText = JSON.stringify(map);
  assert.ok(!mapText.includes('910001') && !mapText.includes('کاربر نمونه'), 'نقشه نباید مقدار داشته باشد');
  console.log('نقشهٔ کشف‌شده:', map.درخواست‌ها.map((d) => d.m + ' ' + d.path));

  await browser.close();
  server.close();
  const real = errors.filter((e) => !/favicon|ERR_ABORTED|401/.test(e));
  if (real.length) { console.error('خطاهای صفحه:', real); process.exit(1); }
  console.log('✓ آزمون سرتاسری رابط گذشت');
}

main().catch((e) => { console.error(e); process.exit(1); });
