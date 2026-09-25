#!/usr/bin/env node
/* ساخت خروجی‌ها بدون هیچ وابستگی: فقط ماژول‌های داخلی Node.
   - dist/sabt-man.bundle.js   : رابط کامل (هسته‌ها + تم + فونت همراه)
   - dist/پوسته-ویندوزی/        : خروجی نهایی — رابط.js (تزریق در WebView2) + کد C# + ساخت.cmd + بک‌اند-فایل + فونت
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

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // ۱) بستهٔ عمومی (برای آزمون و WebView2)
  fs.writeFileSync(path.join(DIST, 'sabt-man.bundle.js'), bundle({}));

  // ۲) پوستهٔ ویندوزی: رابط تزریقی + سرویس + فونت + کد C# و اسکریپت ساخت (خروجی نهایی به دستور کارفرما)
  const shellDir = path.join(DIST, 'پوسته-ویندوزی');
  copyDir(path.join(ROOT, 'پوسته-ویندوزی'), shellDir);
  fs.writeFileSync(path.join(shellDir, 'رابط.js'), bundle({ bridge: 'webview' }));
  copyDir(path.join(ROOT, 'بک‌اند-فایل'), path.join(shellDir, 'بک‌اند-فایل'));
  copyDir(FONTS, path.join(shellDir, 'بک‌اند-فایل', 'فونت'));

  // ۵) راهنما
  fs.copyFileSync(path.join(ROOT, 'README.md'), path.join(DIST, 'README.md'));

  const sizes = ['sabt-man.bundle.js', path.join('پوسته-ویندوزی', 'رابط.js')].map((f) => `${f}: ${Math.round(fs.statSync(path.join(DIST, f)).size / 1024)} KB`);
  console.log('ساخته شد در dist/\n  ' + sizes.join('\n  '));
}

if (require.main === module) build();
module.exports = { build, bundle, fontCss, CORE_ORDER };
