/* فهرست گزارش‌ها (بیش از ۱۰ نوع). هر گزارش: {id, name, desc, icon, scope, build(ctx)}.
   scope: 'case' یک پرونده | 'cases' چند/همهٔ پرونده‌های اجرایی | 'section' یک بخش | 'sections' چند بخش | 'none'.
   build → {title, subtitle, bodyHtml, sheets, md, records, person, logo}. خروجی رسمی با official.render آماده می‌شود. */
(function (S) {
  'use strict';
  const U = S.util;
  const R = () => S.reports;
  const O = () => S.official;
  const esc = U.escapeHtml;
  const n = U.faDigits;

  function st() { return S.store; }
  function execCases() { return st().state.sections.get('/executive/getallcases'); }
  function execDocs() { return st().state.sections.get('/executive/documents'); }
  function labelOf(sec) { return st().labelFor(sec.path); }
  function person() { const p = st().state.sections.get('/user/GetUserProfile') || st().state.sections.get('/user/getuserinfo'); const rec = p && p.records[0]; const nm = rec && S.siteMap.personName(rec.flat); return nm ? nm.full + (nm.father ? ' فرزند ' + nm.father : '') + (nm.nationalCode ? ' — کد ملی ' + n(nm.nationalCode) : '') : ''; }

  /* ---------- استخراج رخدادها از مدارک اجرایی ---------- */
  function docEvents(docsSec, rec) {
    const tl = docsSec.timelines.get(rec.key);
    if (!tl) return [];
    const a = R().analyzeTimeline(tl.rows);
    return a.steps.map((s) => ({ ts: s.ts, dateText: s.dateText, prev: s.prev, status: s.status, durationMs: s.durationMs, durationText: s.durationMs !== null ? U.formatDuration(s.durationMs) : '—', open: s.open, docType: rec.flat.documentTypeName, docNo: rec.flat.documentNo, caseNo: rec.flat.caseNo, caseName: 'پروندهٔ ' + n(rec.flat.caseNo) }));
  }
  function allEvents(docsSec, docs) {
    const out = [];
    for (const r of (docs || docsSec.records)) out.push(...docEvents(docsSec, r));
    return out.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  /** نوعِ رخداد از روی متن وضعیت جاری */
  function eventKind(status) {
    const s = String(status || '');
    if (/رويت|رؤیت|رویت|مشاهده|ابلاغ شده/.test(s)) return 'ابلاغ و رویت';
    if (/تاييد|تأیید|تایید/.test(s)) return 'تأیید';
    if (/ارسال شده|ارسال/.test(s)) return 'ارسال';
    if (/ثبت|تنظيم|تنظیم|پيش نويس|پیش‌نویس|تشكيل|تشکیل/.test(s)) return 'ثبت و تنظیم';
    return 'سایر';
  }
  const KINDS = ['تأیید', 'ابلاغ و رویت', 'ارسال', 'ثبت و تنظیم', 'سایر'];

  function hourBuckets(events, filterKind) {
    const b = new Array(24).fill(0);
    for (const e of events) { if (e.ts === null || e.ts === undefined) continue; if (filterKind && eventKind(e.status) !== filterKind) continue; b[new Date(e.ts).getHours()]++; }
    return b;
  }
  function countBy(arr, keyFn) { const m = new Map(); for (const x of arr) { const k = keyFn(x); m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); }
  function sortDayKeys(m) { return [...m.entries()].sort((a, b) => U.enDigits(a[0]).localeCompare(U.enDigits(b[0]))); }

  function cell(x) { return String(x).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
  function mdTable(head, rows) { return [`| ${head.map(cell).join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n'); }
  function mdDoc(title, blocks) { return [`# ${title}`, '', `تهیه و تنظیم: محمدعلی کریمی‌پور — ${U.formatSystemDate()}`, '', ...blocks].join('\n') + '\n'; }

  /* ================= گزارش‌ها ================= */

  const REPORTS = [
    /* ۱ */ { id: 'exec-dossier', name: 'کارنامهٔ روند پرونده', desc: 'یک پروندهٔ اجرایی: مشخصات، همهٔ مدارک و خط زمانی کامل هر مدرک.', icon: 'gavel', scope: 'case',
      build(ctx) { const cs = execCases(); const rec = ctx.caseRec; const html = R().caseSheetHtml(rec, { fontCss: ctx.fontCss, logo: ctx.logo, person: ctx.person }); const d = R().caseDossier(rec); return { title: 'کارنامهٔ روند — ' + st().caseNameOf(cs, rec), html, md: S.exporter.caseMarkdown(rec, d), sheets: caseSheets(d), records: d.items.length }; } },

    /* ۲ */ { id: 'exec-book', name: 'دفترچهٔ همهٔ پرونده‌های اجرایی', desc: 'کارنامهٔ روند همهٔ پرونده‌های انتخابی، پشت سر هم، با خلاصهٔ کلی در آغاز.', icon: 'stack', scope: 'cases',
      build(ctx) {
        const cs = execCases(), docsSec = execDocs();
        const cases = ctx.cases;
        const dossiers = cases.map((c) => R().caseDossier(c));
        const totDocs = dossiers.reduce((a, d) => a + d.items.length, 0);
        const totEv = dossiers.reduce((a, d) => a + d.items.reduce((x, it) => x + (it.rec.flat.eventCount || 0), 0), 0);
        let body = O().kpis([{ label: 'پرونده', value: cases.length }, { label: 'مدرک', value: totDocs }, { label: 'رخداد', value: totEv }, { label: 'جاری', value: cases.filter((c) => /جاري|جاری/.test(c.flat.caseState)).length, tone: 'a' }]);
        body += '<h2>فهرست پرونده‌ها</h2>' + O().rowsTable(cases.map((c) => ({ no: c.flat.no, unitName: c.flat.unitName, caseState: c.flat.caseState, docCount: c.flat.docCount, eventCount: c.flat.eventCount, lastChange: c.flat.lastChange })), null, { label: (k) => st().fieldLabel(cs, k) });
        cases.forEach((c, i) => { body += '<div class="divider"></div>' + caseBlock(c, dossiers[i], cs, docsSec); });
        const md = mdDoc('دفترچهٔ پرونده‌های اجرایی', [mdTable(['شمارهٔ پرونده', 'واحد اجرا', 'وضعیت', 'مدارک', 'رخدادها'], cases.map((c) => [c.flat.no, c.flat.unitName, c.flat.caseState, c.flat.docCount, c.flat.eventCount]))]);
        return { title: 'دفترچهٔ پرونده‌های اجرایی', subtitle: n(cases.length) + ' پرونده', bodyHtml: body, sheets: booksSheets(cases, dossiers), md, records: totDocs, official: true };
      } },

    /* ۳ */ { id: 'events', name: 'گزارش رویدادها', desc: 'همهٔ رخدادهای پرونده‌های انتخابی به ترتیب زمان: تاریخ، پرونده، مدرک، گذار وضعیت و ماندگاری.', icon: 'timeline', scope: 'cases',
      build(ctx) {
        const { docsSec, docs } = caseDocsFor(ctx.cases);
        let ev = allEvents(docsSec, docs);
        ev = filterEvents(ev, ctx.filter);
        let body = O().kpis([{ label: 'رخداد', value: ev.length }, { label: 'مدرک', value: docs.length }, { label: 'پرونده', value: ctx.cases.length }, { label: 'تازه‌ترین', value: ev.length ? ev[ev.length - 1].dateText : '—' }]);
        body += '<h2>شمارش رخداد بر نوع</h2>' + O().bars(countBy(ev, (e) => eventKind(e.status)).map(([l, c]) => ({ label: l, value: c })));
        body += '<h2>جدول کامل رخدادها (به ترتیب زمان)</h2>' + O().eventsTable(ev);
        const md = mdDoc('گزارش رویدادها', [mdTable(['#', 'تاریخ', 'پرونده', 'نوع مدرک', 'وضعیت پیشین', 'وضعیت جاری', 'ماندگاری'], ev.map((e, i) => [n(i + 1), e.dateText, e.caseName, e.docType, e.prev || '—', e.status, e.durationText]))]);
        return { title: 'گزارش رویدادها', subtitle: n(ev.length) + ' رخداد', bodyHtml: body, sheets: [{ name: 'رویدادها', rows: [['#', 'تاریخ و ساعت', 'شمارهٔ پرونده', 'نوع مدرک', 'شمارهٔ مدرک', 'وضعیت پیشین', 'وضعیت جاری', 'ماندگاری'], ...ev.map((e, i) => [n(i + 1), e.dateText, e.caseNo, e.docType, e.docNo || '—', e.prev || '—', e.status, e.durationText])] }], md, records: ev.length, official: true };
      } },

    /* ۴ */ { id: 'exec-docs', name: 'گزارش مدارک اجرایی', desc: 'همهٔ مدارک پرونده‌های اجرایی در یک جدول: نوع، شماره، وضعیت جاری، شمار رخداد و آخرین تغییر.', icon: 'doc', scope: 'cases',
      build(ctx) {
        const { docsSec, docs: docs0 } = caseDocsFor(ctx.cases);
        const docs = R().filterRecords(docsSec, docs0, ctx.filter);
        let body = O().kpis([{ label: 'مدرک', value: docs.length }, { label: 'نوع مدرک', value: new Set(docs.map((d) => d.flat.documentTypeName)).size }, { label: 'رخداد', value: docs.reduce((a, d) => a + (d.flat.eventCount || 0), 0) }]);
        body += '<h2>شمارش بر نوع مدرک</h2>' + O().bars(countBy(docs, (d) => U.formatValue(d.flat.documentTypeName)).map(([l, c]) => ({ label: l, value: c })));
        body += '<h2>شمارش بر وضعیت جاری</h2>' + O().bars(countBy(docs, (d) => U.formatValue(d.flat.currentState)).map(([l, c]) => ({ label: l, value: c })));
        body += '<h2>جدول کامل مدارک</h2><table><thead><tr><th>#</th><th>شمارهٔ پرونده</th><th>نوع مدرک</th><th>شمارهٔ مدرک</th><th>وضعیت جاری</th><th>رخداد</th><th>آخرین تغییر</th></tr></thead><tbody>' + docs.map((d, i) => `<tr><td class="num">${n(i + 1)}</td><td class="num">${esc(U.formatValue(d.flat.caseNo))}</td><td>${esc(U.formatValue(d.flat.documentTypeName))}</td><td class="num">${esc(U.formatValue(d.flat.documentNo))}</td><td>${O().pill(d.flat.currentState)}</td><td class="num">${n(d.flat.eventCount || 0)}</td><td class="num">${esc(U.formatValue(d.flat.lastChange))}</td></tr>`).join('') + '</tbody></table>';
        const md = mdDoc('گزارش مدارک اجرایی', [mdTable(['#', 'پرونده', 'نوع مدرک', 'شمارهٔ مدرک', 'وضعیت جاری', 'رخداد', 'آخرین تغییر'], docs.map((d, i) => [n(i + 1), d.flat.caseNo, d.flat.documentTypeName, d.flat.documentNo || '—', d.flat.currentState, d.flat.eventCount || 0, d.flat.lastChange]))]);
        return { title: 'گزارش مدارک اجرایی', subtitle: n(docs.length) + ' مدرک', bodyHtml: body, sheets: [{ name: 'مدارک', rows: [['#', 'شمارهٔ پرونده', 'واحد اجرا', 'نوع مدرک', 'شمارهٔ مدرک', 'وضعیت پیشین', 'وضعیت جاری', 'رخداد', 'آخرین تغییر'], ...docs.map((d, i) => [n(i + 1), d.flat.caseNo, d.flat.unitName, d.flat.documentTypeName, d.flat.documentNo || '—', d.flat.previousState || '—', d.flat.currentState, d.flat.eventCount || 0, d.flat.lastChange])] }], md, records: docs.length, official: true };
      } },

    /* ۵ */ { id: 'hours', name: 'تحلیل ساعتی رخدادها', desc: 'در چه ساعت‌هایی از شبانه‌روز تأیید، ابلاغ، ارسال و ثبت رخ داده است؛ به تفکیک نوع رخداد.', icon: 'clock', scope: 'cases',
      build(ctx) {
        const { docsSec, docs } = caseDocsFor(ctx.cases);
        const ev = allEvents(docsSec, docs);
        let body = O().kpis([{ label: 'رخداد', value: ev.length }, { label: 'تأیید', value: ev.filter((e) => eventKind(e.status) === 'تأیید').length, tone: 'a' }, { label: 'ابلاغ و رویت', value: ev.filter((e) => eventKind(e.status) === 'ابلاغ و رویت').length, tone: 'w' }, { label: 'ارسال', value: ev.filter((e) => eventKind(e.status) === 'ارسال').length }]);
        body += '<h2>توزیع ساعتی همهٔ رخدادها</h2>' + O().hours(hourBuckets(ev));
        for (const kind of KINDS) { const b = hourBuckets(ev, kind); if (!b.some((x) => x)) continue; body += `<h3>ساعت‌های «${esc(kind)}»</h3>` + O().hours(b); }
        // جدول ساعت × نوع
        body += '<h2>جدول ساعت × نوع رخداد</h2><table><thead><tr><th>ساعت</th>' + KINDS.map((k) => `<th>${esc(k)}</th>`).join('') + '<th>جمع</th></tr></thead><tbody>';
        const perKind = KINDS.map((k) => hourBuckets(ev, k));
        for (let h = 0; h < 24; h++) { const row = perKind.map((b) => b[h]); const sum = row.reduce((a, b) => a + b, 0); if (!sum) continue; body += `<tr><td class="num">${n(h)}:۰۰</td>${row.map((v) => `<td class="num">${v ? n(v) : '—'}</td>`).join('')}<td class="num">${n(sum)}</td></tr>`; }
        body += '</tbody></table>';
        const sheetRows = [['ساعت', ...KINDS, 'جمع']];
        for (let h = 0; h < 24; h++) { const row = perKind.map((b) => b[h]); sheetRows.push([n(h) + ':۰۰', ...row.map((v) => n(v)), n(row.reduce((a, b) => a + b, 0))]); }
        const md = mdDoc('تحلیل ساعتی رخدادها', [mdTable(['ساعت', ...KINDS, 'جمع'], sheetRows.slice(1).map((r) => r))]);
        return { title: 'تحلیل ساعتی رخدادها', subtitle: 'تأیید، ابلاغ، ارسال و ثبت بر حسب ساعت', bodyHtml: body, sheets: [{ name: 'ساعت×نوع', rows: sheetRows }], md, records: ev.length, official: true };
      } },

    /* ۶ */ { id: 'durations', name: 'گزارش مدت مراحل', desc: 'میانگین، کمینه و بیشینهٔ زمان ماندن در هر وضعیت — برای دیدن مراحل کند و گلوگاه‌ها.', icon: 'clock', scope: 'cases',
      build(ctx) { const { docsSec, docs } = caseDocsFor(ctx.cases); const rep = R().build(withRecords(docsSec, docs), ctx.opts);
        let body = O().kpis([{ label: 'وضعیت', value: rep.stepAvg.length }, { label: 'رخداد', value: rep.allEvents.length }, { label: 'کندترین مرحله', value: rep.stepAvg[0] ? U.formatDuration(rep.stepAvg[0].avgMs) : '—' }]);
        body += '<h2>میانگین ماندگاری هر وضعیت</h2>' + O().bars(rep.stepAvg.slice(0, 20).map((r) => ({ label: r.status.length > 26 ? r.status.slice(0, 26) + '…' : r.status, value: Math.round(r.avgMs / 3600000) })), { suffix: ' ساعت' });
        body += '<h2>جدول مدت مراحل</h2><table><thead><tr><th>وضعیت</th><th>تعداد</th><th>میانگین</th><th>کمینه</th><th>بیشینه</th></tr></thead><tbody>' + rep.stepAvg.map((r) => `<tr><td>${esc(r.status)}</td><td class="num">${n(r.count)}</td><td>${U.formatDuration(r.avgMs)}</td><td>${U.formatDuration(r.minMs)}</td><td>${U.formatDuration(r.maxMs)}</td></tr>`).join('') + '</tbody></table>';
        const md = mdDoc('گزارش مدت مراحل', [mdTable(['وضعیت', 'تعداد', 'میانگین', 'کمینه', 'بیشینه'], rep.stepAvg.map((r) => [r.status, r.count, U.formatDuration(r.avgMs), U.formatDuration(r.minMs), U.formatDuration(r.maxMs)]))]);
        return { title: 'گزارش مدت مراحل', subtitle: 'تحلیل زمان ماندگاری وضعیت‌ها', bodyHtml: body, sheets: [{ name: 'مدت مراحل', rows: [['وضعیت', 'تعداد', 'میانگین', 'کمینه', 'بیشینه'], ...rep.stepAvg.map((r) => [r.status, n(r.count), U.formatDuration(r.avgMs), U.formatDuration(r.minMs), U.formatDuration(r.maxMs)])] }], md, records: rep.allEvents.length, official: true };
      } },

    /* ۷ */ { id: 'flow', name: 'گزارش جریان وضعیت‌ها', desc: 'گذارهای وضعیت (از … به …) و شمار هر گذار — مسیرهای پرتکرار پرونده‌ها.', icon: 'refresh', scope: 'cases',
      build(ctx) { const { docsSec, docs } = caseDocsFor(ctx.cases); const rep = R().build(withRecords(docsSec, docs), ctx.opts);
        let body = O().kpis([{ label: 'گذار متمایز', value: rep.flow.length }, { label: 'رخداد', value: rep.allEvents.length }]);
        body += '<h2>پرتکرارترین گذارهای وضعیت</h2>' + O().bars(rep.flow.slice(0, 18).map((f) => ({ label: f.label.length > 34 ? f.label.slice(0, 34) + '…' : f.label, value: f.count })));
        body += '<h2>جدول کامل گذارها</h2>' + O().rowsTable(rep.flow.map((f) => ({ 'گذار وضعیت': f.label, 'تعداد': n(f.count) })));
        const md = mdDoc('گزارش جریان وضعیت‌ها', [mdTable(['گذار وضعیت', 'تعداد'], rep.flow.map((f) => [f.label, f.count]))]);
        return { title: 'گزارش جریان وضعیت‌ها', subtitle: 'گذارهای وضعیت', bodyHtml: body, sheets: [{ name: 'گذارها', rows: [['گذار وضعیت', 'تعداد'], ...rep.flow.map((f) => [f.label, n(f.count)])] }], md, records: rep.flow.length, official: true };
      } },

    /* ۸ */ { id: 'timedist', name: 'گزارش توزیع زمانی', desc: 'شمار رخداد در هر روز، هر ماه و هر ساعت — روند فعالیت پرونده‌ها در طول زمان.', icon: 'calendar', scope: 'cases',
      build(ctx) { const { docsSec, docs } = caseDocsFor(ctx.cases); const rep = R().build(withRecords(docsSec, docs), ctx.opts);
        let body = O().kpis([{ label: 'رخداد', value: rep.allEvents.length }, { label: 'روز فعال', value: rep.daily.length }, { label: 'ماه فعال', value: rep.monthly.length }]);
        body += '<h2>رخداد ماهانه</h2>' + O().bars(rep.monthly.map((x) => ({ label: x.label, value: x.count })));
        body += '<h2>توزیع ساعتی</h2>' + O().bars(rep.hourly.map((x) => ({ label: x.label + ':۰۰', value: x.count })));
        body += '<h2>رخداد روزانه (پرکارترین روزها)</h2>' + O().rowsTable([...rep.daily].sort((a, b) => b.count - a.count).slice(0, 30).map((x) => ({ 'روز': x.label, 'رخداد': n(x.count) })));
        const md = mdDoc('گزارش توزیع زمانی', [mdTable(['ماه', 'رخداد'], rep.monthly.map((x) => [x.label, x.count]))]);
        return { title: 'گزارش توزیع زمانی', subtitle: 'روزانه، ماهانه و ساعتی', bodyHtml: body, sheets: [{ name: 'ماهانه', rows: [['ماه', 'رخداد'], ...rep.monthly.map((x) => [x.label, n(x.count)])] }, { name: 'روزانه', rows: [['روز', 'رخداد'], ...rep.daily.map((x) => [x.label, n(x.count)])] }, { name: 'ساعتی', rows: [['ساعت', 'رخداد'], ...rep.hourly.map((x) => [x.label, n(x.count)])] }], md, records: rep.allEvents.length, official: true };
      } },

    /* ۹ */ { id: 'pending', name: 'گزارش معطل‌ها', desc: 'مدارکی که بیش از آستانهٔ تعیین‌شده بی‌تغییر مانده‌اند و هنوز به وضعیت نهایی نرسیده‌اند.', icon: 'alert', scope: 'cases',
      build(ctx) { const { docsSec, docs } = caseDocsFor(ctx.cases); const rep = R().build(withRecords(docsSec, docs), ctx.opts);
        let body = O().kpis([{ label: 'معطل', value: rep.pending.length, tone: rep.pending.length ? 'w' : 'a' }, { label: 'کل مدارک دارای روند', value: rep.withTimeline }, { label: 'آستانه (روز)', value: ctx.opts.pendingDays || 7 }]);
        body += rep.pending.length ? '<h2>مدارک معطل</h2>' + listRecordsHtml(rep.pending) : '<div class="note">هیچ مدرکی بیش از آستانه معطل نمانده است. آفرین!</div>';
        const md = mdDoc('گزارش معطل‌ها', [mdTable(['پرونده', 'نوع', 'وضعیت جاری', 'آخرین تغییر', 'از آخرین تغییر'], rep.pending.map((p) => [p.caseName, p.type, p.analysis.last ? p.analysis.last.status : p.status, p.analysis.last ? p.analysis.last.dateText : '—', U.formatDuration(p.analysis.ageMs)]))]);
        return { title: 'گزارش معطل‌ها', subtitle: n(rep.pending.length) + ' مورد معطل', bodyHtml: body, sheets: [recSheet('معطل‌ها', rep.pending)], md, records: rep.pending.length, official: true };
      } },

    /* ۱۰ */ { id: 'unseen', name: 'گزارش ابلاغیه‌های رویت‌نشده', desc: 'ابلاغیه‌هایی که هنوز رویت نشده‌اند — برای پیگیری فوری.', icon: 'eye', scope: 'cases',
      build(ctx) { const { docsSec, docs } = caseDocsFor(ctx.cases); const rep = R().build(withRecords(docsSec, docs), ctx.opts);
        const unseen = rep.perRecord.filter((p) => p.analysis && /ابلاغ/.test(String(p.type)) && !p.analysis.seen);
        let body = O().kpis([{ label: 'رویت‌نشده', value: unseen.length, tone: unseen.length ? 'e' : 'a' }, { label: 'کل ابلاغیه‌ها', value: rep.perRecord.filter((p) => /ابلاغ/.test(String(p.type))).length }]);
        body += unseen.length ? '<h2>ابلاغیه‌های رویت‌نشده</h2>' + listRecordsHtml(unseen) : '<div class="note">همهٔ ابلاغیه‌ها رویت شده‌اند.</div>';
        const md = mdDoc('ابلاغیه‌های رویت‌نشده', [mdTable(['پرونده', 'وضعیت جاری', 'آخرین تغییر'], unseen.map((p) => [p.caseName, p.analysis.last ? p.analysis.last.status : '—', p.analysis.last ? p.analysis.last.dateText : '—']))]);
        return { title: 'ابلاغیه‌های رویت‌نشده', subtitle: n(unseen.length) + ' مورد', bodyHtml: body, sheets: [recSheet('رویت‌نشده', unseen)], md, records: unseen.length, official: true };
      } },

    /* ۱۱ */ { id: 'summary', name: 'خلاصهٔ مدیریتی', desc: 'یک‌نگاه: شمار پرونده‌ها، مدارک و رخدادها، وضعیت‌ها، معطل‌ها، رویت‌نشده‌ها و روند ماهانه.', icon: 'dashboard', scope: 'all',
      build(ctx) {
        const cs = execCases(), docsSec = execDocs(), ssar = st().state.sections.get('/ssar/getalldocuments'), estate = st().state.sections.get('/estate/GetEstatePersonList'), comp = st().state.sections.get('/company/getsinglefootprint');
        const rep = docsSec ? R().build(docsSec, ctx.opts) : null;
        let body = O().kpis([{ label: 'پرونده‌های اجرایی', value: cs ? cs.records.length : 0 }, { label: 'مدارک اجرایی', value: docsSec ? docsSec.records.length : 0 }, { label: 'رخداد', value: rep ? rep.allEvents.length : 0 }, { label: 'اسناد رسمی', value: ssar ? ssar.records.length : 0 }, { label: 'املاک', value: estate ? estate.records.length : 0 }, { label: 'شرکت‌ها', value: comp ? comp.records.length : 0 }]);
        if (rep) {
          body += O().kpis([{ label: 'معطل', value: rep.pending.length, tone: rep.pending.length ? 'w' : 'a' }, { label: 'رویت‌نشده', value: rep.unseen.length, tone: rep.unseen.length ? 'e' : 'a' }, { label: 'تازه', value: rep.recent.length, tone: 'a' }]);
          body += '<h2>وضعیت پرونده‌های اجرایی</h2>' + O().bars(((cs && cs.counters || []).find((c) => c.key === 'caseState') || { values: [] }).values.map((v) => ({ label: v.label, value: v.count })));
          body += '<h2>پرکاربردترین انواع مدرک</h2>' + O().bars(rep.byType.slice(0, 8).map((x) => ({ label: x.label, value: x.count })));
          body += '<h2>روند رخدادها بر ماه</h2>' + O().bars(rep.monthly.map((x) => ({ label: x.label, value: x.count })));
          if (rep.pending.length) body += '<h2>مهم‌ترین معطل‌ها</h2>' + listRecordsHtml(rep.pending.slice(0, 8));
        }
        const md = mdDoc('خلاصهٔ مدیریتی', [`- پرونده‌های اجرایی: ${n(cs ? cs.records.length : 0)}`, `- مدارک اجرایی: ${n(docsSec ? docsSec.records.length : 0)}`, `- اسناد رسمی: ${n(ssar ? ssar.records.length : 0)} · املاک: ${n(estate ? estate.records.length : 0)} · شرکت‌ها: ${n(comp ? comp.records.length : 0)}`]);
        return { title: 'خلاصهٔ مدیریتی داده‌های ثبت', subtitle: 'یک‌نگاه به همهٔ داده‌ها', bodyHtml: body, sheets: [{ name: 'خلاصه', rows: [['شاخص', 'مقدار'], ['پرونده‌های اجرایی', n(cs ? cs.records.length : 0)], ['مدارک اجرایی', n(docsSec ? docsSec.records.length : 0)], ['رخداد', n(rep ? rep.allEvents.length : 0)], ['اسناد رسمی', n(ssar ? ssar.records.length : 0)], ['املاک', n(estate ? estate.records.length : 0)], ['شرکت‌ها', n(comp ? comp.records.length : 0)], ['معطل', n(rep ? rep.pending.length : 0)], ['رویت‌نشده', n(rep ? rep.unseen.length : 0)]] }], md, records: docsSec ? docsSec.records.length : 0, official: true };
      } },

    /* ۱۲ */ { id: 'combined', name: 'گزارش جامع بخش‌ها', desc: 'گزارش کامل چند بخش انتخابی با جدول، شمارش‌ها، معطل‌ها و خط زمانی؛ اجزای دلخواه.', icon: 'grid', scope: 'sections',
      build(ctx) { const merged = R().combine(ctx.sections, ctx.filter); const rep = R().build(merged, ctx.opts); return { title: 'گزارش جامع داده‌های ثبت', subtitle: n(merged.records.length) + ' رکورد از ' + n(ctx.sections.length) + ' بخش', html: R().sectionReportHtml(rep, { parts: ctx.parts, fontCss: ctx.fontCss, logo: ctx.logo, person: ctx.person, title: 'گزارش جامع داده‌های ثبت' }), md: S.exporter.reportMarkdown(rep), sheets: R().excelSheets(rep), records: merged.records.length }; } },

    /* ۱۳ */ { id: 'section', name: 'گزارش یک بخش', desc: 'گزارش کامل یک بخش (اسناد رسمی، املاک، شرکت‌ها…): جدول کامل، شمارش‌ها و اجزای دلخواه.', icon: 'doc', scope: 'section',
      build(ctx) { const sec = ctx.section; const records = R().filterRecords(sec, sec.records, ctx.filter); const rep = R().build(Object.assign({}, sec, { records }), ctx.opts); return { title: 'گزارش ' + labelOf(sec), subtitle: n(records.length) + ' رکورد', html: R().sectionReportHtml(rep, { parts: ctx.parts, fontCss: ctx.fontCss, logo: ctx.logo, person: ctx.person }), md: S.exporter.reportMarkdown(rep), sheets: R().excelSheets(rep), records: records.length }; } },
  ];

  /* ---------- کمک‌ها ---------- */
  function withRecords(sec, records) { return Object.assign({}, sec, { records }); }
  /** بخش مدارک اجرایی؛ اگر نبود، بخش خالی امن */
  function docsSafe() { return execDocs() || { path: '/executive/documents', records: [], timelines: new Map(), attachments: new Map(), details: new Map(), columns: [], counters: [], combined: false }; }
  function caseDocsFor(cases) { const d = execDocs(); if (!d) return { docsSec: docsSafe(), docs: [] }; const keys = new Set(cases.map((c) => c.flat.no + '|' + c.flat.subNo)); return { docsSec: d, docs: d.records.filter((x) => keys.has(x.flat.caseNo + '|' + x.flat.caseSubNo)) }; }
  function filterEvents(ev, f) {
    if (!f) return ev;
    const from = f.from ? U.parseSystemDate(f.from) : null, to = f.to ? U.parseSystemDate(f.to) : null;
    const q = f.q ? U.enDigits(String(f.q)).trim() : '';
    return ev.filter((e) => { if (from && (e.ts === null || e.ts < from)) return false; if (to && (e.ts === null || e.ts > to + 86399999)) return false; if (q && !U.enDigits(`${e.status} ${e.prev} ${e.docType} ${e.caseNo} ${e.docNo}`).includes(q)) return false; return true; });
  }
  function listRecordsHtml(items) {
    return '<table class="avoid"><thead><tr><th>پرونده</th><th>نوع</th><th>وضعیت جاری</th><th>آخرین تغییر</th><th>از آخرین تغییر</th></tr></thead><tbody>' + items.map((p) => `<tr><td class="num">${esc(p.caseName || '—')}</td><td>${esc(p.type)}</td><td>${O().pill(p.analysis.last ? p.analysis.last.status : p.status)}</td><td class="num">${esc(p.analysis.last ? p.analysis.last.dateText : '—')}</td><td>${U.formatDuration(p.analysis.ageMs)}</td></tr>`).join('') + '</tbody></table>';
  }
  function recSheet(name, items) { return { name, rows: [['پرونده', 'نوع', 'وضعیت جاری', 'آخرین تغییر', 'از آخرین تغییر'], ...items.map((p) => [p.caseName || '—', p.type, p.analysis.last ? p.analysis.last.status : p.status, p.analysis.last ? p.analysis.last.dateText : '—', U.formatDuration(p.analysis.ageMs)])] }; }
  function caseBlock(caseRec, dossier, cs, docsSec) {
    let h = `<h2>${esc(st().caseNameOf(cs, caseRec))} <span class="badge">${esc(U.formatValue(caseRec.flat.caseState))}</span></h2>`;
    h += `<div class="grid2"><div>واحد اجرا: <b>${esc(U.formatValue(caseRec.flat.unitName))}</b></div><div>شمار مدارک: <b>${n(dossier.items.length)}</b></div></div>`;
    for (const it of dossier.items) { h += `<h3>${esc(U.formatValue(it.rec.flat.documentTypeName))}${it.rec.flat.documentNo ? ' — ' + n(it.rec.flat.documentNo) : ''} — ${O().pill(it.rec.flat.currentState)}</h3>`; if (it.analysis && it.analysis.steps.length) h += O().eventsTable(it.analysis.steps.map((s) => ({ dateText: s.dateText, prev: s.prev, status: s.status, durationText: s.durationMs !== null ? U.formatDuration(s.durationMs) : '—', docType: it.rec.flat.documentTypeName, caseName: '' }))); }
    return h;
  }
  function caseSheets(d) {
    return [{ name: 'مدارک', rows: [['#', 'نوع مدرک', 'شمارهٔ مدرک', 'وضعیت پیشین', 'وضعیت جاری', 'آخرین تغییر', 'رخداد'], ...d.items.map((it, i) => [n(i + 1), U.formatValue(it.rec.flat.documentTypeName), U.formatValue(it.rec.flat.documentNo), U.formatValue(it.rec.flat.previousState), U.formatValue(it.rec.flat.currentState), U.formatValue(it.rec.flat.lastChange), n(it.rec.flat.eventCount || 0)])] },
      { name: 'رخدادها', rows: [['مدرک', 'شمارهٔ مدرک', 'تاریخ و ساعت', 'وضعیت پیشین', 'وضعیت جاری', 'ماندگاری'], ...d.items.flatMap((it) => it.analysis ? it.analysis.steps.map((s) => [U.formatValue(it.rec.flat.documentTypeName), U.formatValue(it.rec.flat.documentNo), s.dateText, s.prev || '—', s.status, s.durationMs !== null ? U.formatDuration(s.durationMs) : '—']) : [])] }];
  }
  function booksSheets(cases, dossiers) {
    const rows = [['#', 'شمارهٔ پرونده', 'واحد اجرا', 'وضعیت', 'مدارک', 'رخداد', 'آخرین تغییر']];
    cases.forEach((c, i) => rows.push([n(i + 1), U.formatValue(c.flat.no), U.formatValue(c.flat.unitName), U.formatValue(c.flat.caseState), n(c.flat.docCount || dossiers[i].items.length), n(c.flat.eventCount || 0), U.formatValue(c.flat.lastChange)]));
    const ev = [['شمارهٔ پرونده', 'نوع مدرک', 'شمارهٔ مدرک', 'تاریخ و ساعت', 'وضعیت پیشین', 'وضعیت جاری', 'ماندگاری']];
    cases.forEach((c, i) => dossiers[i].items.forEach((it) => { if (it.analysis) it.analysis.steps.forEach((s) => ev.push([U.formatValue(c.flat.no), U.formatValue(it.rec.flat.documentTypeName), U.formatValue(it.rec.flat.documentNo), s.dateText, s.prev || '—', s.status, s.durationMs !== null ? U.formatDuration(s.durationMs) : '—'])); }));
    return [{ name: 'پرونده‌ها', rows }, { name: 'رخدادها', rows: ev }];
  }

  function byId(id) { return REPORTS.find((r) => r.id === id); }
  /** ساخت خروجی یک گزارش؛ اگر builder فقط bodyHtml داد، با official.render رسمی می‌شود */
  function build(report, ctx) {
    ctx = Object.assign({ fontCss: S.fontCss || '', logo: S.logoData || '', person: person() }, ctx);
    const out = report.build(ctx);
    if (!out.html) out.html = O().render({ title: out.title, subtitle: out.subtitle, bodyHtml: out.bodyHtml, footer: out.title, fontCss: ctx.fontCss, logo: ctx.logo, person: ctx.person });
    if (!out.md) out.md = mdDoc(out.title, []);
    return out;
  }

  S.catalog = { REPORTS, byId, build, person, eventKind, KINDS };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
