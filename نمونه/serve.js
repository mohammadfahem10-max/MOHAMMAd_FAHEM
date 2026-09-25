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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const bodyText = Buffer.concat(chunks).toString('utf8');
    let body = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch (e) { body = {}; }
    const p = url.pathname;

    if (p === '/' || p === '/portal' || p.startsWith('/portal/')) {
      let html = fs.readFileSync(path.join(__dirname, 'سایت', 'index.html'), 'utf8');
      if (url.searchParams.has('noinject')) html = html.replace('<script src="/__overlay/sabt-man.bundle.js"></script>', ''); // برای آزمون افزونه
      return send(res, 200, html, { 'content-type': 'text/html; charset=utf-8' });
    }
    if (p === '/__overlay/sabt-man.bundle.js') {
      const f = path.join(ROOT, 'dist', 'sabt-man.bundle.js');
      if (!fs.existsSync(f)) return send(res, 404, '/* ابتدا node ابزار/build.js را اجرا کنید */', { 'content-type': 'application/javascript' });
      return send(res, 200, fs.readFileSync(f), { 'content-type': 'application/javascript; charset=utf-8' });
    }
    if (p === '/__mock/expire') { expired = true; return send(res, 200, { ok: true }); }
    if (p === '/__mock/login') { expired = false; return send(res, 200, { ok: true }); }
    if (expired && !p.startsWith('/account/')) return send(res, 401, { Success: false, Message: 'Unauthorized', Data: null });
    if (p === '/account/login') { expired = false; return send(res, 200, { Success: true, Message: '', Data: { token: 'x' } }); }

    if (p === '/mechLetter/GetStatusList') return send(res, 200, readJson('mechLetter-status.json'));
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
