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
  assert.ok(txt.includes('Document Type: ابلاغیه') && txt.includes('روند / رخدادها'), 'برچسب انسانی‌شدهٔ فیلد ناشناخته + روند');
  assert.ok(md.includes('| Document Number | ۱۲۳ |') && md.includes('## روند / رخدادها'));
});


test('نقشهٔ سایت: پرونده‌های اجرایی، مدارک و رخدادها با برچسب فارسی، گزارش TIFF و کارنامهٔ پرونده', () => {
  const st = S.store;
  const cap = (path, body, json) => ({ method: 'POST', url: 'https://my.ssaa.ir' + path, path, status: 200, json, ts: Date.now(), requestHeaders: { authorization: 'Bearer x' }, requestBody: body, contentType: 'application/json' });
  st.ingest(cap('/executive/getallcases', 'pageIndex=1&pageSize=100', { success: true, message: '', data: { xCaseInformationList: [{ no: '140204029116000150', subNo: '1.0', archiveNo: '140200244', caseState: 'جاري', unitName: 'واحد اجراي اسناد رسمي مهدي شهر' }, { no: '140204001107000797', subNo: '1.0', archiveNo: '1', caseState: 'مختومه', unitName: 'رباط كريم' }] } }));
  const cases = st.state.sections.get('/executive/getallcases');
  assert.equal(cases.records.length, 2);
  assert.equal(st.labelFor('/executive/getallcases'), 'پرونده‌های اجرایی');
  assert.equal(st.fieldLabel(cases, 'caseState'), 'وضعیت پرونده');
  assert.equal(cases.records[0].key, '140204029116000150|1.0');
  st.ingest(cap('/executive/getcasedocuments', 'caseNo=140204029116000150&caseSubNo=1.0', { success: true, message: '', data: { xCaseDocuments: [
    { documentId: 'd1', documentTypeId: 't1', documentNo: null, documentTypeName: 'اجرائيه', xCaseDocumentWorkFloItems: [{ changeDateTime: '1402/12/16-10:00', previousState: 'تاييد ثبت اوليه', nextState: 'تاييد تكميل' }, { changeDateTime: '1402/12/16-09:41', previousState: 'تنظيم شده', nextState: 'تاييد ثبت اوليه' }] },
    { documentId: 'd2', documentTypeId: 't2', documentNo: '140205129116000942', documentTypeName: 'ابلاغيه', xCaseDocumentWorkFloItems: [{ changeDateTime: '1402/12/16-14:00', previousState: 'تاييد شده جهت ارسال', nextState: 'رويت نتيجه ابلاغ شده' }] },
  ] } }));
  const docs = st.state.sections.get('/executive/documents');
  assert.equal(docs.records.length, 2);
  const d1 = docs.records[0];
  assert.equal(d1.flat.currentState, 'تاييد تكميل', 'رخدادها به ترتیب زمان مرتب می‌شوند');
  assert.equal(d1.flat.previousState, 'تاييد ثبت اوليه');
  assert.equal(d1.flat.eventCount, 2);
  assert.equal(d1.flat.unitName, 'واحد اجراي اسناد رسمي مهدي شهر', 'واحد اجرا از پرونده به مدرک می‌رسد');
  assert.ok(docs.timelines.get(d1.key).rows.length === 2);
  assert.equal(cases.records[0].flat.docCount, 2);
  assert.equal(cases.records[0].flat.eventCount, 3);
  assert.equal(st.caseNameOf(docs, docs.records[1]), 'ابلاغيه ۱۴۰۲۰۵۱۲۹۱۱۶۰۰۰۹۴۲ — پروندهٔ ۱۴۰۲۰۴۰۲۹۱۱۶۰۰۰۱۵۰');
  // فهرست گزارش‌های رسمی یک مدرک و فایل TIFF آن
  st.ingest(cap('/executive/getdocumentreports', 'docTypeId=t1&docId=d1&caseNo=140204029116000150&caseSubNo=1.0', { success: true, message: '', data: { reportTypes: [{ reportTypeName: 'چاپ اجراییه جاری', objectId: 'd1', reportTypeCode: '1', reportCommand: null }] } }));
  assert.equal(docs.details.get(d1.key).rows.length, 1);
  st.ingest(cap('/executive/getreport', 'caseNo=140204029116000150&caseSubNo=1.0&documentTypeId=t1&documentId=d1&reportCommand=null&reportTypeCode=1', { success: true, message: '', data: { base64FileResult: Buffer.from('II*\0abc').toString('base64'), fileType: 'ImageTiff' } }));
  assert.equal(d1.files.length, 1);
  const f = st.state.files.get(d1.files[0]);
  assert.ok(f && /\.tif$/.test(f.fileName) && f.bytes.length === 7, 'فایل TIFF با نام فارسی');
  // صف فایل‌ها از روی نقشه
  const q = S.exporter.queue; q.items.length = 0;
  const added = S.exporter.enqueueTyped(docs, [docs.records[1]], 'گزارش‌ها');
  assert.equal(added, 1);
  assert.ok(q.items[0].req.body.includes('docId=d2') && q.items[0].req.body.includes('caseNo=140204029116000150'));
  q.items.length = 0;
  // کارنامهٔ پرونده و گزارش جامع
  const html = S.reports.caseSheetHtml(cases.records[0]);
  assert.ok(html.includes('کارنامهٔ روند') && html.includes('ابلاغيه') && html.includes('نسخهٔ کنترل‌شده'), 'مهر ضدکپی طبق قانون ۶۴');
  const merged = S.reports.combine([cases, docs], {});
  assert.equal(merged.records.length, 4);
  const rep = S.reports.build(merged, {});
  assert.ok(rep.allEvents.length === 3 && rep.byType.length >= 2);
  const sec = S.reports.sectionReportHtml(rep, { parts: ['counts', 'table'] });
  assert.ok(sec.includes('نوع مدرک') && !sec.includes('خط زمانی هر رکورد'));
  // فیلتر بازهٔ زمانی
  const only = S.reports.filterRecords(docs, docs.records, { from: '1402/12/16', to: '1402/12/16', status: ['تاييد تكميل'] });
  assert.equal(only.length, 1);
  // بستهٔ پرونده‌های اجرایی
  return S.exporter.buildExecutiveJob([cases.records[0]], 'pdf+text', { withFiles: false }).then((job) => {
    const names = job.entries.map((e) => e.name);
    assert.ok(names.some((x) => /کارنامهٔ روند .*\.pdf\.html$/.test(x)) && names.some((x) => /\.tif$/.test(x)) && names.some((x) => /\.md$/.test(x)));
    assert.equal(job.manifest['پوشه‌ها'][0]['برگه‌ها'][0].name, 'مدارک');
  });
});
