'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');
const zipNode = require('../بک‌اند-فایل/lib/zip.js');

const S = load();
const U = S.util;

test('ارقام فارسی و پاکت پاسخ (هر دو حالت حروف)', () => {
  assert.equal(U.faDigits('1403/09/03-07:37'), '۱۴۰۳/۰۹/۰۳-۰۷:۳۷');
  assert.equal(U.enDigits('۱۲۳'), '123');
  assert.deepEqual(U.readEnvelope({ Success: true, Message: '', Data: [1] }), { ok: true, message: '', data: [1], isEnvelope: true });
  assert.deepEqual(U.readEnvelope({ success: false, message: 'x', data: null }), { ok: false, message: 'x', data: null, isEnvelope: true });
  assert.equal(U.readEnvelope({ foo: 1 }).isEnvelope, false);
});

test('تخت‌کردن رکورد تودرتو و نمایش عینِ داده', () => {
  const flat = U.flatten({ a: 1, b: { c: 'x', d: [1, 2] }, e: [{ f: 1 }], g: null, h: true });
  assert.deepEqual(Object.keys(flat), ['a', 'b.c', 'b.d', 'e[]', 'g', 'h']);
  assert.equal(flat['b.d'], '۱، ۲');
  assert.equal(U.formatValue(null), '—');
  assert.equal(U.formatValue(true), 'بله');
  assert.equal(U.formatValue('شماره 123'), 'شماره ۱۲۳');
});

test('تاریخ سامانه: تجزیه، تبدیل جلالی و مدت', () => {
  const ms = U.parseSystemDate('۱۴۰۳/۰۹/۰۳-۰۷:۳۷');
  assert.ok(ms);
  const d = new Date(ms);
  assert.deepEqual([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()], [2024, 11, 23, 7, 37]);
  assert.deepEqual(U.gregorianToJalali(2024, 11, 23), [1403, 9, 3]);
  assert.deepEqual(U.jalaliToGregorian(1403, 1, 1), [2024, 3, 20]);
  assert.equal(U.formatSystemDate(ms), '۱۴۰۳/۰۹/۰۳-۰۷:۳۷');
  assert.equal(U.formatDuration(2 * 86400000 + 3 * 3600000), '۲ روز و ۳ ساعت');
  assert.equal(U.parseSystemDate('متن'), null);
  assert.ok(U.looksLikeDate('۱۴۰۳/۰۹/۰۳'));
});

test('نام فایل امن و Content-Disposition فارسی', () => {
  assert.equal(U.safeFileName('نامه: نمونه/۱?'), 'نامه- نمونه-۱-');
  assert.equal(U.fileNameFromDisposition("attachment; filename*=UTF-8''%D8%B3%D9%86%D8%AF.pdf"), 'سند.pdf');
  assert.equal(U.fileNameFromDisposition('attachment; filename="a b.pdf"'), 'a b.pdf');
  assert.equal(U.fileNameFromUrl('https://x/y/%D8%B3%D9%86%D8%AF.pdf?x=1'), 'سند.pdf');
});

test('ZIP ساخته‌شده در مرورگر با خوانندهٔ سرویس خوانده می‌شود (نام فارسی)', () => {
  const bytes = U.buildZip([{ name: 'manifest.json', data: '{"a":1}' }, { name: 'files/۱/۱ اسناد/سند.pdf', data: new Uint8Array([1, 2, 3]) }]);
  const entries = zipNode.read(Buffer.from(bytes));
  assert.deepEqual(entries.map((e) => e.name), ['manifest.json', 'files/۱/۱ اسناد/سند.pdf']);
  assert.deepEqual([...entries[1].data], [1, 2, 3]);
  // و برعکس: ZIP فشردهٔ سرویس هم خوانده می‌شود
  const back = zipNode.read(zipNode.write([{ name: 'x/ی.txt', data: 'سلام' }]));
  assert.equal(back[0].data.toString('utf8'), 'سلام');
});

test('انبار: آرایه، شیء، پوشش صفحه‌بندی، شمارشگر و نام پرونده', () => {
  const st = S.store;
  const cap = (path, json, body) => ({ method: 'POST', url: 'https://x' + path, path, status: 200, json, ts: 1, requestHeaders: {}, requestBody: body || null });
  const s1 = st.ingest(cap('/mechLetter/GetStatusList', { Success: true, Message: '', Data: { TotalCount: 2, Items: [{ Id: 910001, DocumentType: 'ابلاغیه', DocumentNumber: '۱۲۳', CurrentStatus: 'ارسال شده', LastChangeDate: '۱۴۰۳/۰۹/۰۳-۰۷:۳۷' }, { Id: 910002, DocumentType: 'نامه وارده', DocumentNumber: '۱۲۴', CurrentStatus: 'شروع', LastChangeDate: '۱۴۰۳/۰۹/۰۴-۰۷:۳۷' }] } }));
  assert.equal(s1.records.length, 2);
  assert.equal(s1.shape, 'wrapped:Items');
  assert.ok(s1.counters.find((c) => c.key === 'DocumentType').values.some((v) => v.label === 'ابلاغیه' && v.count === 1));
  assert.equal(s1.dateField, 'LastChangeDate');
  assert.equal(st.caseNameOf(s1, s1.records[0]), '۱۲۳');
  assert.equal(st.labelFor('/mechLetter/GetStatusList'), 'وضعیت مکاتبات — فهرست وضعیت');
  const s2 = st.ingest(cap('/profile/GetInfo', { success: true, data: { fullName: 'نمونه', nationalCode: '۰۰۰', loginHistory: [{ date: '۱۴۰۳/۰۱/۰۱' }] } }));
  assert.equal(s2.shape, 'object');
  assert.equal(s2.records.length, 1);
  assert.ok('loginHistory[]' in s2.records[0].flat);
  assert.equal(st.ingest(cap('/i18n/fa.json', { hello: 'x' })), null, 'پارازیت');
  assert.equal(st.ingest(cap('/x/y', { Success: true, Data: null })), null);
  // یادگیری پیوند «گزارشات» از بدنهٔ درخواست
  const child = st.ingest(cap('/mechLetter/GetReports', { Success: true, Data: [{ Status: 'شروع', ActionDate: '۱۴۰۳/۰۹/۰۱-۰۸:۰۰' }, { PreviousStatus: 'شروع', Status: 'ارسال شده', ActionDate: '۱۴۰۳/۰۹/۰۳-۰۷:۳۷' }] }, '{"letterId":910001}'));
  assert.equal(child.hidden, true);
  const links = st.linksFor('/mechLetter/GetStatusList', 'روند');
  assert.equal(links.length, 1);
  assert.equal(links[0].bodyTemplate, '{"letterId":{{id}}}');
  assert.equal(links[0].idField, 'Id');
  assert.deepEqual(st.buildRequest(links[0], s1.records[1]).body, '{"letterId":910002}');
  assert.ok(s1.timelines.has(s1.records[0].key));
  assert.ok(!st.sectionList().some((s) => s.path === '/mechLetter/GetReports'), 'بخش فرزند در فهرست نیست');
});

test('گزارش‌ها: مدت مراحل، جریان وضعیت، معطل و تازه، برگهٔ رسمی', () => {
  const st = S.store;
  const section = st.state.sections.get('/mechLetter/GetStatusList');
  const now = S.util.parseSystemDate('۱۴۰۳/۰۹/۲۰-۰۰:۰۰');
  const tl = S.reports.analyzeTimeline(section.timelines.get(section.records[0].key).rows, now);
  assert.equal(tl.steps.length, 2);
  assert.equal(S.util.formatDuration(tl.steps[0].durationMs), '۱ روز و ۲۳ ساعت و ۳۷ دقیقه');
  assert.equal(tl.last.status, 'ارسال شده');
  const rep = S.reports.build(section, { now, pendingDays: 7, recentDays: 30 });
  assert.equal(rep.withTimeline, 1);
  assert.equal(rep.pending.length, 1);
  assert.equal(rep.recent.length, 1);
  assert.ok(rep.flow.some((f) => f.label === 'شروع ← ارسال شده'));
  const html = S.reports.recordSheetHtml(section, section.records[0]);
  assert.ok(html.includes('تهیه و تنظیم: محمدعلی کریمی‌پور') && html.includes('class="stamp"') && html.includes('size: A4'));
  assert.ok(!/AI|هوش مصنوعی|Claude/i.test(html), 'بی‌نشانهٔ هوش مصنوعی');
  assert.ok(!/[0-9]/.test(html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, '')), 'همهٔ ارقام متن فارسی');
  const sheets = S.reports.excelSheets(rep);
  assert.ok(sheets.find((s) => s.name === 'رخدادها').rows.length === 3);
});

test('خروجی متن و md همهٔ فیلدها و روند را دارد', () => {
  const st = S.store;
  const section = st.state.sections.get('/mechLetter/GetStatusList');
  const txt = S.exporter.recordText(section, section.records[0]);
  const md = S.exporter.recordMarkdown(section, section.records[0]);
  assert.ok(txt.includes('DocumentType: ابلاغیه') && txt.includes('روند / رخدادها'));
  assert.ok(md.includes('| DocumentNumber | ۱۲۳ |') && md.includes('## روند / رخدادها'));
});
