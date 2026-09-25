#!/usr/bin/env node
/* ساخت خروجی‌ها بدون هیچ وابستگی: فقط ماژول‌های داخلی Node.
   - dist/sabt-man.bundle.js   : رابط کامل (هسته‌ها + تم + فونت همراه)
   - dist/پوسته-ویندوزی/        : خروجی نهایی — قلاب.js (تزریق در WebView2ِ پنهانِ سایت) + برنامه/ (رابط دیدنی) + کد C# + ساخت.cmd + بک‌اند-فایل + فونت
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const UI = path.join(ROOT, 'رابط');
const REPORTS = path.join(ROOT, 'گزارش‌ها');
const FONTS = path.join(ROOT, 'دارایی‌ها', 'فونت');

const CORE_ORDER = [
  path.join(UI, 'core', 'util.js'),
  path.join(UI, 'core', 'hook.js'),
  path.join(UI, 'core', 'store.js'),
  path.join(UI, 'core', 'bridge.js'),
  path.join(REPORTS, 'official.js'),
  path.join(REPORTS, 'reports.js'),
  path.join(UI, 'core', 'export.js'),
  path.join(UI, 'core', 'panel.js'),
];

function read(p) { return fs.readFileSync(p, 'utf8'); }
function b64(p) { return fs.readFileSync(p).toString('base64'); }

/** CSS فونت همراه (base64) — در پنل و پیش‌نمایش‌ها؛ سرویس هم همین را در PDF تزریق می‌کند */
function fontCss() {
  const reg = b64(path.join(FONTS, 'Vazirmatn-Regular.woff2'));
  const bold = b64(path.join(FONTS, 'Vazirmatn-Bold.woff2'));
  return `@font-face{font-family:'Vazirmatn';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${reg}) format('woff2');}
@font-face{font-family:'Vazirmatn';font-style:normal;font-weight:700;font-display:swap;src:url(data:font/woff2;base64,${bold}) format('woff2');}`;
}

function bundle(opts) {
  opts = opts || {};
  const parts = ['/* ثبت من — رابط تزریقی (ساخته‌شده با ابزار/build.js) */', '"use strict";', '(function(){', 'window.SabtMan = window.SabtMan || {};'];
  if (opts.bridge) parts.push(`window.__sabtmanBridge = ${JSON.stringify(opts.bridge)};`);
  for (const f of CORE_ORDER) parts.push(`/* ---- ${path.relative(ROOT, f)} ---- */`, read(f));
  parts.push(`window.SabtMan.themeCss = ${JSON.stringify(read(path.join(UI, 'theme.css')))};`);
  parts.push(`window.SabtMan.fontCss = ${JSON.stringify(fontCss())};`);
  parts.push('/* ---- رابط/overlay.js ---- */', read(path.join(UI, 'overlay.js')));
  parts.push('})();');
  return parts.join('\n');
}

function copyDir(src, dst, filter) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (filter && !filter(s)) continue;
    if (e.isDirectory()) copyDir(s, d, filter);
    else fs.copyFileSync(s, d);
  }
}

/** بستهٔ سمتِ سایت (قلاب.js): قلاب + رله + خودکارسازی — بی‌رابط، در WebView2ِ پنهان */
function siteBundle() {
  const files = [path.join(UI, 'core', 'util.js'), path.join(UI, 'core', 'hook.js'), path.join(UI, 'site', 'relay.js'), path.join(UI, 'site', 'automation.js'), path.join(UI, 'site', 'entry.js')];
  const parts = ['/* ثبت من — قلاب سمتِ سایت (ساخته‌شده با ابزار/build.js) */', '"use strict";', '(function(){', 'window.SabtMan = window.SabtMan || {};'];
  for (const f of files) parts.push(`/* ---- ${path.relative(ROOT, f)} ---- */`, read(f));
  parts.push('})();');
  return parts.join('\n');
}

/** بستهٔ رابط برنامه (برنامه/app.js): S.hook = remote-hook؛ پنل جاسازی‌شده؛ صفحه‌های ورود/گردآوری/پیشخوان/تنظیمات */
function appBundle() {
  const files = [path.join(UI, 'core', 'util.js'), path.join(UI, 'core', 'bridge.js'), path.join(UI, 'core', 'remote-hook.js'), path.join(UI, 'core', 'store.js'),
    path.join(REPORTS, 'official.js'), path.join(REPORTS, 'reports.js'), path.join(UI, 'core', 'export.js'), path.join(UI, 'core', 'panel.js')];
  const parts = ['/* ثبت من — رابط برنامه (ساخته‌شده با ابزار/build.js) */', '"use strict";', '(function(){', 'window.SabtMan = window.SabtMan || {};'];
  for (const f of files) parts.push(`/* ---- ${path.relative(ROOT, f)} ---- */`, read(f));
  parts.push(`window.SabtMan.themeCss = ${JSON.stringify(read(path.join(UI, 'theme.css')))};`);
  parts.push(`window.SabtMan.fontCss = ${JSON.stringify(fontCss())};`);
  parts.push(`(function(){ const s = document.createElement('style'); s.id = 'sabtman-style'; s.textContent = window.SabtMan.fontCss + '\\n' + window.SabtMan.themeCss; (document.head || document.documentElement).appendChild(s); })();`);
  parts.push('/* ---- رابط/برنامه/app.js ---- */', read(path.join(UI, 'برنامه', 'app.js')));
  parts.push('})();');
  return parts.join('\n');
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // ۱) بستهٔ عمومی (رابط درون صفحهٔ سایت؛ برای آزمون روی سایت شبیه‌ساز)
  fs.writeFileSync(path.join(DIST, 'sabt-man.bundle.js'), bundle({}));

  // ۲) پوستهٔ ویندوزی: قلاب سمتِ سایت + رابط برنامه + سرویس + فونت + کد C# و اسکریپت ساخت
  const shellDir = path.join(DIST, 'پوسته-ویندوزی');
  copyDir(path.join(ROOT, 'پوسته-ویندوزی'), shellDir);
  fs.writeFileSync(path.join(shellDir, 'قلاب.js'), siteBundle());
  const appDir = path.join(shellDir, 'برنامه');
  fs.mkdirSync(appDir, { recursive: true });
  fs.copyFileSync(path.join(UI, 'برنامه', 'index.html'), path.join(appDir, 'index.html'));
  fs.copyFileSync(path.join(UI, 'برنامه', 'app.css'), path.join(appDir, 'app.css'));
  fs.writeFileSync(path.join(appDir, 'app.js'), appBundle());
  // themes.js میزبان در مخزن نیست؛ جای‌نگهدار تا وقتی ساخت.cmd نسخهٔ واقعی را کپی کند
  fs.writeFileSync(path.join(appDir, 'themes.js'), '/* تم‌های میزبان شخصی (themes.js) اینجا کپی می‌شود؛ بدون آن، تم‌های پیش‌فرض برنامه به کار می‌رود. */\n');
  copyDir(path.join(ROOT, 'بک‌اند-فایل'), path.join(shellDir, 'بک‌اند-فایل'));
  copyDir(FONTS, path.join(shellDir, 'بک‌اند-فایل', 'فونت'));
  copyDir(FONTS, path.join(appDir, 'font'));

  // ۳) راهنما
  fs.copyFileSync(path.join(ROOT, 'README.md'), path.join(DIST, 'README.md'));

  const sizes = ['sabt-man.bundle.js', path.join('پوسته-ویندوزی', 'قلاب.js'), path.join('پوسته-ویندوزی', 'برنامه', 'app.js')].map((f) => `${f}: ${Math.round(fs.statSync(path.join(DIST, f)).size / 1024)} KB`);
  console.log('ساخته شد در dist/\n  ' + sizes.join('\n  '));
}

if (require.main === module) build();
module.exports = { build, bundle, siteBundle, appBundle, fontCss, CORE_ORDER };
