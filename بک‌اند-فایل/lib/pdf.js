/* چاپ HTML به PDF با موتور مرورگر (Edge/Chrome/Chromium headless) — امن‌ترین راه برای فارسیِ راست‌به‌چپ.
   فونت همراه (Vazirmatn) پیش از چاپ در HTML تزریق می‌شود. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const FONT_MARK = '/*SABTMAN_FONT*/';
let fontCssCache = null;

function fontCss(fontDir) {
  if (fontCssCache) return fontCssCache;
  const load = (f) => { const p = path.join(fontDir, f); return fs.existsSync(p) ? fs.readFileSync(p).toString('base64') : null; };
  const reg = load('Vazirmatn-Regular.woff2'), bold = load('Vazirmatn-Bold.woff2');
  fontCssCache = reg ? `@font-face{font-family:'Vazirmatn';font-weight:400;src:url(data:font/woff2;base64,${reg}) format('woff2');}\n` +
    (bold ? `@font-face{font-family:'Vazirmatn';font-weight:700;src:url(data:font/woff2;base64,${bold}) format('woff2');}` : '') : '';
  return fontCssCache;
}

function candidates() {
  const list = [];
  if (process.env.SABTMAN_BROWSER) list.push(process.env.SABTMAN_BROWSER);
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    for (const r of roots) {
      list.push(path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      list.push(path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      list.push(path.join(r, 'Chromium', 'Application', 'chrome.exe'));
    }
  } else {
    list.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/opt/pw-browsers/chromium', '/snap/bin/chromium');
    try { for (const d of fs.readdirSync('/opt/pw-browsers')) if (d.startsWith('chromium-')) list.push(path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')); } catch (e) { /* نیست */ }
  }
  return list;
}

let browserCache;
function findBrowser(configured) {
  if (configured && fs.existsSync(configured)) return configured;
  if (browserCache !== undefined) return browserCache;
  browserCache = candidates().find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;
  return browserCache;
}

function run(exe, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { timeout: timeoutMs || 90000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr || '').slice(0, 800) })); else resolve(String(stdout || ''));
    });
  });
}

/**
 * html (رشته) → فایل PDF در outPath. opts: {fontDir, browser, tmpDir}
 * خروجی: true اگر ساخته شد؛ در غیر این صورت خطا می‌دهد.
 */
async function htmlToPdf(html, outPath, opts) {
  opts = opts || {};
  const exe = findBrowser(opts.browser);
  if (!exe) throw new Error('مرورگر Edge/Chrome برای چاپ PDF پیدا نشد (می‌توانید مسیر را در تنظیمات سرویس بدهید).');
  const tmpDir = opts.tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sabtman-'));
  const htmlPath = path.join(tmpDir, `p${Date.now()}${Math.random().toString(36).slice(2, 6)}.html`);
  const prepared = html.includes(FONT_MARK) ? html.replace(FONT_MARK, fontCss(opts.fontDir || '')) : html;
  fs.writeFileSync(htmlPath, prepared, 'utf8');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/').replace(/^\//, '');
  const userData = path.join(tmpDir, 'profile');
  const base = ['--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${userData}`, '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000', `--print-to-pdf=${outPath}`, fileUrl];
  if (process.platform !== 'win32') base.unshift('--no-sandbox');
  let lastErr = null;
  for (const headless of ['--headless=new', '--headless']) {
    try {
      await run(exe, [headless, ...base]);
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) { cleanup(htmlPath); return true; }
    } catch (e) { lastErr = e; }
  }
  cleanup(htmlPath);
  throw new Error('چاپ PDF ناموفق: ' + (lastErr ? lastErr.message + ' ' + (lastErr.stderr || '') : 'خروجی خالی'));
}

function cleanup(p) { try { fs.unlinkSync(p); } catch (e) { /* ادامه */ } }

module.exports = { htmlToPdf, findBrowser, fontCss, FONT_MARK };
