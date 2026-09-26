#!/usr/bin/env node
/* سرور نمونه (فقط برای آزمون؛ جای سایت واقعی): همان الگوی POST /{ماژول}/{عملیات} و پاکت {Success/Data}.
   رابط از dist/sabt-man.bundle.js تزریق می‌شود تا کل جریان بدون دسترسی به سایت واقعی آزموده شود. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(__dirname, 'داده');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

let expired = false; // شبیه‌سازی پایان نشست

function tinyPdf(title) {
  const text = `BT /F1 18 Tf 72 720 Td (${title}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
function tinyPng() {
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
  const crc = (b) => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc(8 * 8 * 4 + 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const o = y * 33 + 1 + x * 4; raw[o] = 15; raw[o + 1] = 108; raw[o + 2] = 189; raw[o + 3] = 255; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'content-type': 'application/json; charset=utf-8' }, headers || {}));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const encodeName = (n) => `attachment; filename*=UTF-8''${encodeURIComponent(n)}`;

function loginPage(step, err) {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>ورود — سایت نمونه</title>
<style>body{font-family:Tahoma;background:#eef;padding:40px}form{background:#fff;padding:20px;max-width:360px;margin:auto}input{display:block;width:100%;margin:8px 0;padding:6px}.text-danger{color:#c00}</style></head><body>
<h2>ورود به سامانهٔ نمونه</h2>${err ? `<div class="text-danger">${err}</div>` : ''}
${step === 'otp' ? `<form method="post" action="/auth/verify"><label>کد یک‌بارمصرف</label><input name="otpCode" placeholder="کد پیامکی" autocomplete="one-time-code"><button type="submit">ورود</button></form>`
  : `<form method="post" action="/auth/sendcode"><label>کد ملی</label><input name="nationalCode" placeholder="کد ملی" maxlength="10"><button type="submit">ارسال کد</button></form>`}
</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const bodyText = Buffer.concat(chunks).toString('utf8');
    let body = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch (e) { body = Object.fromEntries(new URLSearchParams(bodyText)); }
    const p = url.pathname;

    // ---- شبیه‌سازی ورود سایت (کد ملی → ارسال کد → کد پیامکی؛ کوکی نشست) ----
    const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]));
    const loggedIn = cookies.sm_session === '1' && !expired;
    if (p === '/' || p === '/login') {
      if (loggedIn) return send(res, 302, '', { location: '/portal' });
      return send(res, 200, loginPage(url.searchParams.get('step') || 'nat', url.searchParams.get('err')), { 'content-type': 'text/html; charset=utf-8' });
    }
    if (p === '/auth/sendcode') { if (!/^\d{10}$/.test(String(body.nationalCode || ''))) return send(res, 200, loginPage('nat', 'کد ملی نامعتبر است'), { 'content-type': 'text/html; charset=utf-8' }); return send(res, 302, '', { location: '/login?step=otp' }); }
    if (p === '/auth/verify') {
      if (String(body.otpCode) !== '1234') return send(res, 200, loginPage('otp', 'کد نادرست است'), { 'content-type': 'text/html; charset=utf-8' });
      expired = false;
      return send(res, 302, '', { location: '/portal', 'set-cookie': 'sm_session=1; Path=/' });
    }
    if (p === '/auth/logout') return send(res, 302, '', { location: '/', 'set-cookie': 'sm_session=; Path=/; Max-Age=0' });
    if (p === '/portal' || p.startsWith('/portal/')) {
      if (!loggedIn && url.searchParams.get('nologin') === null) return send(res, 302, '', { location: '/' });
      let html = fs.readFileSync(path.join(__dirname, 'سایت', 'index.html'), 'utf8');
      if (url.searchParams.has('noinject')) html = html.replace('<script src="/__overlay/sabt-man.bundle.js"></script>', ''); // صفحه بدون تزریق (برای آزمون تزریق بیرونی)
      return send(res, 200, html, { 'content-type': 'text/html; charset=utf-8' });
    }
    if (p === '/__overlay/sabt-man.bundle.js') {
      const f = path.join(ROOT, 'dist', 'sabt-man.bundle.js');
      if (!fs.existsSync(f)) return send(res, 404, '/* ابتدا node ابزار/build.js را اجرا کنید */', { 'content-type': 'application/javascript' });
      return send(res, 200, fs.readFileSync(f), { 'content-type': 'application/javascript; charset=utf-8' });
    }
    if (p.startsWith('/__app/')) {
      const f = path.join(ROOT, 'dist', 'پوسته-ویندوزی', 'برنامه', decodeURIComponent(p.slice(7)));
      if (!fs.existsSync(f)) return send(res, 404, 'نیست', { 'content-type': 'text/plain' });
      const ct = f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      return send(res, 200, fs.readFileSync(f), { 'content-type': ct + '; charset=utf-8' });
    }
    if (p === '/__mock/expire') { expired = true; return send(res, 200, { ok: true }); }
    if (p === '/__mock/login') { expired = false; return send(res, 200, { ok: true }); }
    if ((expired || !loggedIn) && !p.startsWith('/account/') && !p.startsWith('/__')) return send(res, 401, { Success: false, Message: 'Unauthorized', Data: null });
    if (p === '/account/login') { expired = false; return send(res, 200, { Success: true, Message: '', Data: { token: 'x' } }); }

    if (p === '/mechLetter/GetStatusList') {
      const all = readJson('mechLetter-status.json');
      const size = Number(body.pageSize) || 4, page = Number(body.pageIndex) || 1;
      const items = all.Data.Items.slice((page - 1) * size, page * size);
      return send(res, 200, { Success: true, Message: '', Data: { TotalCount: all.Data.Items.length, PageIndex: page, PageSize: size, Items: items } });
    }
    if (p === '/mechLetter/GetReports') { const d = readJson('mechLetter-reports.json')[String(body.letterId)]; return send(res, 200, d || { Success: false, Message: 'یافت نشد', Data: [] }); }
    if (p === '/mechLetter/GetAttachments') { const d = readJson('mechLetter-attachments.json')[String(body.letterId)]; return send(res, 200, d || { Success: true, Message: '', Data: [] }); }
    if (p === '/mechLetter/DownloadFile') {
      const id = url.searchParams.get('fileId');
      const all = readJson('mechLetter-attachments.json');
      for (const rows of Object.values(all)) for (const r of rows.Data) if (String(r.FileId) === id) {
        if (r.FileType === 'png') return send(res, 200, tinyPng(), { 'content-type': 'image/png', 'content-disposition': encodeName(r.FileName) });
        return send(res, 200, tinyPdf('Sample ' + id), { 'content-type': 'application/pdf', 'content-disposition': encodeName(r.FileName) });
      }
      return send(res, 404, { Success: false, Message: 'یافت نشد', Data: null });
    }
    if (p === '/ssar/getalldocuments') return send(res, 200, readJson('ssar-getalldocuments.json'));
    if (p === '/ssar/getdocumenttext') return send(res, 200, { Success: true, Message: '', Data: { DocumentId: body.documentId, Text: 'متنِ نمونهٔ سند شمارهٔ ' + body.documentId + '\nاین متن ساختگی است.' } });
    if (p === '/estate/GetEstatePersonList') return send(res, 200, readJson('estate-GetEstatePersonList.json'));
    if (p.startsWith('/estate/deedimage/')) return send(res, 200, tinyPng(), { 'content-type': 'image/png', 'content-disposition': encodeName('سند تک‌برگ ' + p.split('/').pop() + '.png') });
    if (p === '/ilenc/GetTempIssues') return send(res, 200, readJson('ilenc-temp-issues.json'));
    if (p === '/profile/GetInfo') return send(res, 200, readJson('profile-info.json'));
    if (p === '/i18n/fa.json') return send(res, 200, { hello: 'سلام' });
    send(res, 404, { Success: false, Message: 'ناشناخته', Data: null });
  });
});

const PORT = Number(process.env.PORT || 8765);
if (require.main === module) server.listen(PORT, '127.0.0.1', () => console.log(`سایت نمونه: http://127.0.0.1:${PORT}/portal`));
module.exports = { server, tinyPdf, tinyPng };
