'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zip = require('../بک‌اند-فایل/lib/zip.js');
const xlsx = require('../بک‌اند-فایل/lib/xlsx.js');
const pdf = require('../بک‌اند-فایل/lib/pdf.js');
const organize = require('../بک‌اند-فایل/lib/organize.js');
const { load } = require('./load.js');

const FONT_DIR = path.join(__dirname, '..', 'دارایی‌ها', 'فونت');

test('xlsx: بستهٔ معتبر با برگه‌های راست‌به‌چپ', () => {
  const buf = xlsx.build([{ name: 'فهرست', rows: [['پوشه', 'نام'], ['۱ اسناد', 'سند <۱>.pdf']] }, { name: 'روند', rows: [] }]);
  const entries = zip.read(buf);
  const names = entries.map((e) => e.name);
  assert.ok(names.includes('[Content_Types].xml') && names.includes('xl/worksheets/sheet1.xml') && names.includes('xl/worksheets/sheet2.xml'));
  const sheet = entries.find((e) => e.name === 'xl/worksheets/sheet1.xml').data.toString('utf8');
  assert.ok(sheet.includes('rightToLeft="1"') && sheet.includes('سند &lt;۱&gt;.pdf'));
});

test('organize: بستهٔ کار → پوشهٔ پرونده با زیرپوشه‌ها، فایل اصل دست‌نخورده، فهرست.xlsx و PDF', async () => {
  const S = load();
  const st = S.store;
  st.ingest({ method: 'POST', url: 'https://x/mechLetter/GetStatusList', path: '/mechLetter/GetStatusList', status: 200, ts: 1, requestHeaders: {}, requestBody: null,
    json: { Success: true, Data: [{ Id: 1, DocumentNumber: 'نامه ۱۲۳', DocumentType: 'ابلاغیه', CurrentStatus: 'ارسال شده', LastChangeDate: '۱۴۰۳/۰۹/۰۳-۰۷:۳۷' }] } });
  const section = st.state.sections.get('/mechLetter/GetStatusList');
  section.timelines.set(section.records[0].key, { path: '/r', rows: [{ Status: 'شروع', ActionDate: '۱۴۰۳/۰۹/۰۱-۰۸:۰۰' }, { PreviousStatus: 'شروع', Status: 'ارسال شده', ActionDate: '۱۴۰۳/۰۹/۰۳-۰۷:۳۷' }], ts: 1 });
  const job = await S.exporter.buildJob(section, section.records, 'pdf+text', { withFiles: false });
  const original = Buffer.from([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
  job.entries.push({ name: 'files/۱/۱ اسناد/اصل سند.pdf', data: new Uint8Array(original) });
  job.manifest['پوشه‌ها'][0]['فایل‌ها'].push({ path: 'files/۱/۱ اسناد/اصل سند.pdf', sub: '۱ اسناد', name: 'اصل سند.pdf', kind: 'اصل' });
  job.entries[0].data = JSON.stringify(job.manifest);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sabtman-test-'));
  const zipPath = path.join(tmp, 'sabtman__test.zip');
  fs.writeFileSync(zipPath, Buffer.from(S.util.buildZip(job.entries)));
  const dest = path.join(tmp, 'خروجی');
  const logs = [];
  const res = await organize.processJob(zipPath, { dest, fontDir: FONT_DIR, log: (l, t) => logs.push(l + ' ' + t), tmpDir: tmp });
  const caseDir = path.join(dest, 'وضعیت مکاتبات — فهرست وضعیت', 'نامه ۱۲۳');
  assert.equal(res.folders[0].path, caseDir);
  for (const sub of organize.SUBFOLDERS) assert.ok(fs.existsSync(path.join(caseDir, sub)), sub);
  assert.ok(fs.readFileSync(path.join(caseDir, '۱ اسناد', 'اصل سند.pdf')).equals(original), 'فایل اصل دست‌نخورده');
  assert.ok(fs.existsSync(path.join(caseDir, '۴ گزارش‌ها', 'نامه ۱۲۳.txt')) && fs.existsSync(path.join(caseDir, '۴ گزارش‌ها', 'نامه ۱۲۳.md')));
  assert.ok(fs.existsSync(path.join(caseDir, '۳ روند و رخدادها', 'روند نامه ۱۲۳.json')));
  assert.ok(fs.existsSync(path.join(caseDir, 'فهرست.xlsx')));
  const sheets = zip.read(fs.readFileSync(path.join(caseDir, 'فهرست.xlsx'))).map((e) => e.name);
  assert.ok(sheets.includes('xl/worksheets/sheet2.xml'), 'برگهٔ روند');
  const reports = fs.readdirSync(path.join(caseDir, '۴ گزارش‌ها'));
  const tl = fs.readdirSync(path.join(caseDir, '۳ روند و رخدادها'));
  if (pdf.findBrowser()) {
    assert.ok(reports.includes('نامه ۱۲۳.pdf'), 'PDF برگهٔ رکورد: ' + reports.join(','));
    assert.ok(tl.includes('کارنامهٔ روند نامه ۱۲۳.pdf'), 'PDF کارنامه: ' + tl.join(','));
    assert.ok(fs.readFileSync(path.join(caseDir, '۴ گزارش‌ها', 'نامه ۱۲۳.pdf')).slice(0, 4).toString() === '%PDF');
  } else {
    assert.ok(reports.includes('نامه ۱۲۳.html'), 'بدون مرورگر: HTML نگه داشته می‌شود');
  }
  // اجرای دوباره: فایل یکسان دوباره نوشته نمی‌شود، PDF تازه نام یکتا می‌گیرد
  fs.writeFileSync(zipPath, Buffer.from(S.util.buildZip(job.entries)));
  await organize.processJob(zipPath, { dest, fontDir: FONT_DIR, log: () => {}, tmpDir: tmp });
  assert.equal(fs.readdirSync(path.join(caseDir, '۱ اسناد')).length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});
