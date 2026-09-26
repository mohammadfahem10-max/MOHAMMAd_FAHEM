/* چاپ HTML به PDF با موتور مرورگر (Edge/Chrome/Chromium headless) — امن‌ترین راه برای فارسیِ راست‌به‌چپ.
   فونت همراه (Vazirmatn) پیش از چاپ در HTML تزریق می‌شود. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isPdf(p) {
  try { const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(5); fs.readSync(fd, b, 0, 5, 0); fs.closeSync(fd); return b.toString('latin1') === '%PDF-'; } catch (e) { return false; }
}

function mtimeOf(p) { try { return fs.statSync(p).mtimeMs; } catch (e) { return null; } }

/* روی ویندوز، لانچر Edge/Chrome (به‌ویژه وقتی برنامه با دسترسی مدیر اجرا شود: «Edge is running elevated»)
   پیش از نوشتن PDF با کد ۰ بیرون می‌آید و چاپ در پردازهٔ فرزند ادامه می‌یابد. پس پایان فرمان به معنای
   آماده‌بودن فایل نیست: تا پیدا شدن فایل تازه، ثابت ماندن حجمش و سالم بودن سرآیند %PDF- صبر می‌شود. */
async function waitForPdf(outPath, prevMtime, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let last = -1, stable = 0;
  while (Date.now() < end) {
    try {
      const st = fs.statSync(outPath);
      const fresh = prevMtime === null || st.mtimeMs !== prevMtime;
      if (fresh && st.size > 0 && st.size === last) {
        if (++stable >= 2 && isPdf(outPath)) return true;
      } else stable = 0;
      last = st.size;
    } catch (e) { /* هنوز ساخته نشده */ }
    await sleep(250);
  }
  return false;
}

/* پردازه‌های فرزند Edge پس از نوشتن PDF چند ثانیه پروفایل (user-data-dir) را قفل نگه می‌دارند و پاک‌کردن tmpDir
   به دست فراخواننده (server.js و آزمون) با EPERM می‌شکند. تا آزاد شدن قفل صبر می‌شود: تغییر نام آزمایشی پوشه
   فقط وقتی موفق است که هیچ پردازه‌ای دستگیرهٔ باز درون آن نداشته باشد؛ بلافاصله نام برگردانده می‌شود. */
async function waitProfileFree(dir, timeoutMs) {
  if (process.platform !== 'win32' || !fs.existsSync(dir)) return true;
  const probe = dir + '~free';
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { fs.renameSync(dir, probe); fs.renameSync(probe, dir); return true; } catch (e) { /* هنوز قفل است */ }
    await sleep(300);
  }
  return false;
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
  const fileUrl = pathToFileURL(htmlPath).href;
  const userData = path.join(tmpDir, 'profile');
  const base = ['--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${userData}`, '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000', `--print-to-pdf=${outPath}`, fileUrl];
  if (process.platform !== 'win32') base.unshift('--no-sandbox');
  let lastErr = null;
  const waitMs = opts.waitMs || 45000;
  for (const headless of ['--headless=new', '--headless']) {
    const prev = mtimeOf(outPath);
    let exited = true;
    try { await run(exe, [headless, ...base]); } catch (e) { lastErr = e; exited = false; }
    // خروج ۰: تا سقف waitMs صبر؛ خروج ناموفق: صبر کوتاه (شاید فرزند باز هم بنویسد)
    if (await waitForPdf(outPath, prev, exited ? waitMs : 3000)) { await waitProfileFree(userData, 30000); cleanup(htmlPath); return true; }
  }
  await waitProfileFree(userData, 15000);
  cleanup(htmlPath);
  throw new Error('چاپ PDF ناموفق: ' + (lastErr ? lastErr.message + ' ' + (lastErr.stderr || '') : 'خروجی خالی'));
}

function cleanup(p) { try { fs.unlinkSync(p); } catch (e) { /* ادامه */ } }

module.exports = { htmlToPdf, findBrowser, fontCss, FONT_MARK, waitForPdf, isPdf };
