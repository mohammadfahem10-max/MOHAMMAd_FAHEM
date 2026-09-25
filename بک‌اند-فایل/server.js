#!/usr/bin/env node
/* سرویس فایل محلی «ثبت من» — فقط ماژول‌های داخلی Node (http, fs, path, zlib, child_process).
   - فقط روی 127.0.0.1 گوش می‌دهد؛ هیچ داده‌ای به بیرون نمی‌رود.
   - پوشهٔ دانلود را پایش می‌کند؛ بسته‌های sabtman__*.zip را در پوشهٔ مقصدِ انتخابی کاربر مرتب می‌کند.
   - صفحهٔ کنترل (تم طلوع): انتخاب مکان دانلود، وضعیت، گزارش کار.  */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const organize = require('./lib/organize');
const pdf = require('./lib/pdf');

const BASE = __dirname;
const CONFIG_PATH = path.join(BASE, 'تنظیمات.json');
const LOG_PATH = path.join(BASE, 'گزارش-کار.log');
const FONT_DIR = fs.existsSync(path.join(BASE, 'فونت')) ? path.join(BASE, 'فونت') : path.join(BASE, '..', 'دارایی‌ها', 'فونت');
const JOB_RE = /^sabtman__[a-z0-9]+(?: \(\d+\))?\.zip$/i;
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (s) => String(s).replace(/[0-9]/g, (d) => FA[+d]);

function defaultDownloads() {
  const home = os.homedir();
  return path.join(home, 'Downloads');
}
function defaultDest() {
  if (process.platform === 'win32' && fs.existsSync('E:\\')) return 'E:\\ثبت من\\خروجی';
  return path.join(os.homedir(), 'Documents', 'ثبت من');
}

const state = {
  config: { port: 8975, inbox: '', dest: '', browser: '', keepProcessed: true },
  log: [],
  stats: { processed: 0, failed: 0, pdfOk: 0, pdfFail: 0, lastJob: null },
  seen: new Map(),   // نام فایل → {size, ts}
  busy: false,
  version: '0.1.0',
};

function loadConfig() {
  try { Object.assign(state.config, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))); } catch (e) { /* اولین اجرا */ }
  if (!state.config.inbox) state.config.inbox = defaultDownloads();
  if (!state.config.dest) state.config.dest = defaultDest();
  for (const k of Object.keys(process.env)) {
    if (k === 'SABTMAN_PORT') state.config.port = Number(process.env[k]);
    if (k === 'SABTMAN_INBOX') state.config.inbox = process.env[k];
    if (k === 'SABTMAN_DEST') state.config.dest = process.env[k];
    if (k === 'SABTMAN_BROWSER') state.config.browser = process.env[k];
  }
}
function saveConfig() { fs.writeFileSync(CONFIG_PATH, JSON.stringify(state.config, null, 2), 'utf8'); }

function log(level, text) {
  const ts = new Date();
  const line = { ts: ts.getTime(), level, text };
  state.log.unshift(line);
  if (state.log.length > 300) state.log.length = 300;
  const stamp = ts.toISOString().replace('T', ' ').slice(0, 19);
  try { fs.appendFileSync(LOG_PATH, `[${stamp}] ${level.toUpperCase()} ${text}\n`); } catch (e) { /* ادامه */ }
  console.log(`[${level}] ${text}`);
}

/* ---------- پایش پوشهٔ دانلود ---------- */

function inboxDirs() {
  const dirs = [state.config.inbox];
  const sub = path.join(state.config.inbox, 'ثبت من'); // افزونه در این زیرپوشه ذخیره می‌کند
  if (fs.existsSync(sub)) dirs.push(sub);
  return dirs.filter((d) => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } });
}

async function scan() {
  if (state.busy) return;
  for (const dir of inboxDirs()) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (e) { continue; }
    for (const name of names) {
      if (!JOB_RE.test(name)) continue;
      const full = path.join(dir, name);
      let size;
      try { size = fs.statSync(full).size; } catch (e) { continue; }
      const prev = state.seen.get(full);
      if (!prev || prev.size !== size) { state.seen.set(full, { size, ts: Date.now(), stable: 0 }); continue; }
      prev.stable++;
      if (prev.stable < 2) continue; // دو بار پیاپی بدون تغییر اندازه → دانلود کامل شده
      state.busy = true;
      try { await handleJob(full); } finally { state.busy = false; state.seen.delete(full); }
    }
  }
}

async function handleJob(zipPath) {
  log('info', `بستهٔ تازه: ${path.basename(zipPath)}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sabtman-'));
  try {
    fs.mkdirSync(state.config.dest, { recursive: true });
    const res = await organize.processJob(zipPath, { dest: state.config.dest, fontDir: FONT_DIR, browser: state.config.browser, log, tmpDir });
    state.stats.processed++;
    for (const f of res.folders) { state.stats.pdfOk += f.pdfOk; state.stats.pdfFail += f.pdfFail; }
    state.stats.lastJob = { name: path.basename(zipPath), section: res.manifest['بخش'], folders: res.folders.map((f) => f.path), ts: Date.now() };
    archiveJob(zipPath);
  } catch (e) {
    state.stats.failed++;
    log('err', `پردازش «${path.basename(zipPath)}» ناموفق: ${e.message}`);
    try { const bad = path.join(path.dirname(zipPath), 'ناموفق'); fs.mkdirSync(bad, { recursive: true }); fs.renameSync(zipPath, path.join(bad, path.basename(zipPath))); } catch (e2) { /* ادامه */ }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function archiveJob(zipPath) {
  try {
    if (!state.config.keepProcessed) { fs.unlinkSync(zipPath); return; }
    const done = path.join(path.dirname(zipPath), 'پردازش‌شده');
    fs.mkdirSync(done, { recursive: true });
    fs.renameSync(zipPath, path.join(done, path.basename(zipPath)));
    const old = fs.readdirSync(done).filter((n) => JOB_RE.test(n)).map((n) => ({ n, t: fs.statSync(path.join(done, n)).mtimeMs })).sort((a, b) => b.t - a.t).slice(30);
    for (const o of old) fs.unlinkSync(path.join(done, o.n));
  } catch (e) { log('warn', 'جابه‌جایی بستهٔ پردازش‌شده: ' + e.message); }
}

/* ---------- ابزارهای ویندوز ---------- */

function browseFolder(initial) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    const ps = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'پوشهٔ مقصد خروجی ثبت من'; $d.ShowNewFolderButton = $true; ${initial ? `$d.SelectedPath = '${initial.replace(/'/g, "''")}';` : ''} if ($d.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $d.SelectedPath }`;
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout).trim() || null));
  });
}
function openFolder(dir) {
  try {
    if (process.platform === 'win32') spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { /* ادامه */ }
}

/* ---------- HTTP ---------- */

function json(res, status, obj) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function readBody(req) { return new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => { try { r(JSON.parse(Buffer.concat(c).toString('utf8') || '{}')); } catch (e) { r({}); } }); }); }

function snapshot() {
  return {
    نسخه: state.version, تنظیمات: state.config, آمار: state.stats, گزارش: state.log.slice(0, 60), مشغول: state.busy,
    مرورگر: pdf.findBrowser(state.config.browser), پوشه‌های‌پایش: inboxDirs(), فونت: fs.existsSync(path.join(FONT_DIR, 'Vazirmatn-Regular.woff2')),
    مقصد‌موجود: fs.existsSync(state.config.dest),
  };
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    let html = fs.readFileSync(path.join(BASE, 'www', 'index.html'), 'utf8');
    html = html.replace('/*SABTMAN_FONT*/', pdf.fontCss(FONT_DIR));
    return res.end(html);
  }
  if (req.method === 'GET' && p === '/api/state') return json(res, 200, snapshot());
  if (req.method === 'POST' && p === '/api/config') {
    const body = await readBody(req);
    for (const k of ['inbox', 'dest', 'browser']) if (typeof body[k] === 'string') state.config[k] = body[k].trim();
    if (typeof body.keepProcessed === 'boolean') state.config.keepProcessed = body.keepProcessed;
    try { fs.mkdirSync(state.config.dest, { recursive: true }); } catch (e) { return json(res, 400, { ok: false, error: 'پوشهٔ مقصد ساخته نشد: ' + e.message }); }
    saveConfig();
    log('ok', `تنظیمات ذخیره شد — مقصد: ${state.config.dest}`);
    return json(res, 200, { ok: true, ...snapshot() });
  }
  if (req.method === 'POST' && p === '/api/browse') {
    const body = await readBody(req);
    const picked = await browseFolder(body.which === 'inbox' ? state.config.inbox : state.config.dest);
    return json(res, 200, { ok: Boolean(picked), path: picked, پشتیبانی: process.platform === 'win32' });
  }
  if (req.method === 'POST' && p === '/api/open') { const body = await readBody(req); openFolder(body.which === 'inbox' ? state.config.inbox : state.config.dest); return json(res, 200, { ok: true }); }
  if (req.method === 'POST' && p === '/api/scan') { await scan(); return json(res, 200, { ok: true, ...snapshot() }); }
  if (req.method === 'POST' && p === '/api/test-pdf') {
    const out = path.join(state.config.dest, 'آزمون چاپ.pdf');
    try {
      fs.mkdirSync(state.config.dest, { recursive: true });
      await pdf.htmlToPdf(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>/*SABTMAN_FONT*/ body{font-family:Vazirmatn;padding:40px}</style></head><body><h1>آزمون چاپ PDF فارسی</h1><p>ارقام: ۰۱۲۳۴۵۶۷۸۹ — تاریخ: ۱۴۰۳/۰۹/۰۳-۰۷:۳۷</p></body></html>`, out, { fontDir: FONT_DIR, browser: state.config.browser });
      log('ok', 'آزمون چاپ PDF موفق: ' + out);
      return json(res, 200, { ok: true, path: out });
    } catch (e) { log('err', 'آزمون چاپ PDF: ' + e.message); return json(res, 500, { ok: false, error: e.message }); }
  }
  json(res, 404, { ok: false, error: 'ناشناخته' });
}

function start() {
  loadConfig();
  const server = http.createServer((req, res) => handle(req, res).catch((e) => json(res, 500, { ok: false, error: e.message })));
  server.listen(state.config.port, '127.0.0.1', () => {
    log('ok', `سرویس ثبت من روی http://127.0.0.1:${state.config.port} — پایش: ${inboxDirs().join(' | ') || '(پوشهٔ دانلود پیدا نشد)'} — مقصد: ${state.config.dest}`);
    if (!pdf.findBrowser(state.config.browser)) log('warn', 'مرورگر Edge/Chrome برای چاپ PDF پیدا نشد؛ برگه‌ها به‌صورت HTML ذخیره می‌شوند تا مسیر مرورگر را در تنظیمات بدهید.');
    setInterval(() => scan().catch((e) => log('err', 'پایش: ' + e.message)), 1500);
  });
  return server;
}

if (require.main === module) start();
module.exports = { start, scan, handleJob, state, loadConfig };
