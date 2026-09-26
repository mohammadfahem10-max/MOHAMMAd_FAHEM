/* گزارش‌های رخداد/روند: جدول کامل، خط زمانی، مدت هر مرحله، جریان وضعیت، شمارش‌ها، روزانه/ماهانه، توزیع ساعتی،
   معطل‌ها، رویت‌نشده‌ها، تازه‌ها، و «کارنامهٔ روند» رسمی هر پرونده. همه با ارقام فارسی و عینِ دادهٔ سامانه. */
(function (S) {
  'use strict';
  const U = S.util;

  const DATE_KEY = /(date|time|تاریخ|زمان|ساعت)/i;
  const PREV_KEY = /(prev|previous|last|old|from|پیشین|قبل)/i;
  const STATUS_KEY = /(status|state|step|stage|action|وضعیت|مرحله|اقدام)/i;
  const TYPE_KEY = /(type|kind|نوع)/i;
  const NO_KEY = /(number|no$|code|شماره|کد)/i;
  const USER_KEY = /(user|actor|by|unit|office|کاربر|واحد|دفتر|اقدام‌کننده)/i;
  const NOTE_KEY = /(desc|note|comment|text|subject|title|شرح|توضیح|موضوع|عنوان)/i;

  function pick(keys, re, exclude) {
    return keys.find((k) => re.test(k) && (!exclude || !exclude.test(k))) || null;
  }

  /** نگاشت خودکار ستون‌های یک فهرست رخداد */
  function detectFields(flats) {
    const keys = [];
    const seen = new Set();
    for (const f of flats) for (const k of Object.keys(f)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
    const dateKeys = keys.filter((k) => DATE_KEY.test(k) || flats.some((f) => U.looksLikeDate(f[k])));
    const date = dateKeys.find((k) => flats.some((f) => U.looksLikeDate(f[k]))) || dateKeys[0] || null;
    const PURE_STATUS = /(status|state|وضعیت)/i;
    const prev = keys.find((k) => PURE_STATUS.test(k) && PREV_KEY.test(k)) || keys.find((k) => STATUS_KEY.test(k) && PREV_KEY.test(k)) || null;
    const status = keys.find((k) => PURE_STATUS.test(k) && !PREV_KEY.test(k)) || keys.find((k) => STATUS_KEY.test(k) && !PREV_KEY.test(k)) || null;
    const type = pick(keys, TYPE_KEY, STATUS_KEY);
    const number = pick(keys, NO_KEY, DATE_KEY);
    const user = pick(keys, USER_KEY, DATE_KEY);
    const note = pick(keys, NOTE_KEY, STATUS_KEY);
    return { date, prev, status, type, number, user, note, keys };
  }

  /** یک زنجیرهٔ روند را مرتب و مدت‌بندی می‌کند. rows: آرایهٔ شیء خام */
  function analyzeTimeline(rows, nowMs) {
    const flats = rows.map((r) => (r.flat ? r.flat : U.flatten(r)));
    const f = detectFields(flats);
    const steps = flats.map((flat, i) => {
      const dateText = f.date ? flat[f.date] : null;
      const ts = U.parseSystemDate(dateText);
      return {
        i, flat, ts, dateText: dateText === null || dateText === undefined ? '—' : U.formatValue(dateText),
        status: f.status ? U.formatValue(flat[f.status]) : '—', prev: f.prev ? U.formatValue(flat[f.prev]) : null,
        user: f.user ? U.formatValue(flat[f.user]) : '', note: f.note ? U.formatValue(flat[f.note]) : '',
      };
    });
    // مرتب‌سازی زمانی: سطرهای تاریخ‌دار همیشه بر حسب زمان؛ ماندگاری بین دو سطرِ تاریخ‌دارِ پیاپی
    steps.sort((a, b) => { if (a.ts === null && b.ts === null) return a.i - b.i; if (a.ts === null) return 1; if (b.ts === null) return -1; return a.ts - b.ts; });
    const datedSteps = steps.filter((s) => s.ts !== null);
    for (let i = 0; i < datedSteps.length; i++) {
      const cur = datedSteps[i], next = datedSteps[i + 1];
      cur.durationMs = next ? next.ts - cur.ts : (nowMs || Date.now()) - cur.ts;
      cur.open = !next;
    }
    for (const s of steps) if (s.ts === null) { s.durationMs = null; s.open = false; }
    const first = datedSteps[0] || null;
    const last = datedSteps[datedSteps.length - 1] || null;
    return {
      fields: f, steps, first, last,
      totalMs: first && last ? last.ts - first.ts : null,
      ageMs: last ? (nowMs || Date.now()) - last.ts : null,
      seen: steps.some((s) => /رویت|روئیت|رويت|رؤیت|مشاهده|دیده/.test(s.status)),
    };
  }

  /** گزارش کامل یک بخش. section از انبار؛ opts: {pendingDays, recentDays, now} */
  function build(section, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const pendingMs = (opts.pendingDays || 7) * 86400000;
    const recentMs = (opts.recentDays || 7) * 86400000;
    const perRecord = [];
    const allEvents = [];
    const stepDur = new Map();     // وضعیت → [ms]
    const flow = new Map();        // «از → به» → تعداد
    const daily = new Map(), monthly = new Map(), hourly = new Map();
    const byStatus = new Map(), byType = new Map();

    const known = S.siteMap ? S.siteMap.sectionFor(section.path) : null;
    const records = opts.records || section.records;
    for (const rec of records) {
      const tl = section.timelines.get(rec.key);
      const caseName = S.store ? S.store.caseNameOf(section, rec) : rec.key;
      const typeKey = (known && known.type) || (section.autoCounterFields && section.autoCounterFields.find((k) => TYPE_KEY.test(k)));
      const typeVal = typeKey ? U.formatValue(rec.flat[typeKey]) : '—';
      byType.set(typeVal, (byType.get(typeVal) || 0) + 1);
      const statusKey = (known && known.status) || (section.columns && section.columns.find((k) => STATUS_KEY.test(k) && !PREV_KEY.test(k)));
      const statusVal = statusKey ? U.formatValue(rec.flat[statusKey]) : '—';
      byStatus.set(statusVal, (byStatus.get(statusVal) || 0) + 1);
      if (!tl) { perRecord.push({ rec, caseName, type: typeVal, status: statusVal, analysis: null }); continue; }
      const a = analyzeTimeline(tl.rows, now);
      perRecord.push({ rec, caseName, type: typeVal, status: statusVal, analysis: a });
      let prevStatus = null;
      for (const s of a.steps) {
        allEvents.push({ caseName, type: typeVal, ...s });
        if (s.durationMs !== null && !s.open) {
          if (!stepDur.has(s.status)) stepDur.set(s.status, []);
          stepDur.get(s.status).push(s.durationMs);
        }
        const from = s.prev && s.prev !== '—' ? s.prev : prevStatus;
        if (from && s.status !== '—') { const k = `${from} ← ${s.status}`; flow.set(k, (flow.get(k) || 0) + 1); }
        prevStatus = s.status;
        if (s.ts !== null) {
          const day = U.formatSystemDay(s.ts);
          const month = day.split('/').slice(0, 2).join('/');
          const hour = U.faDigits(String(new Date(s.ts).getHours()).padStart(2, '0'));
          daily.set(day, (daily.get(day) || 0) + 1);
          monthly.set(month, (monthly.get(month) || 0) + 1);
          hourly.set(hour, (hourly.get(hour) || 0) + 1);
        }
      }
    }
    allEvents.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const withTl = perRecord.filter((p) => p.analysis);
    const pending = withTl.filter((p) => p.analysis.ageMs !== null && p.analysis.ageMs > pendingMs && !isFinal(p.analysis.last && p.analysis.last.status));
    const unseen = withTl.filter((p) => !p.analysis.seen);
    const recent = withTl.filter((p) => p.analysis.ageMs !== null && p.analysis.ageMs <= recentMs);
    const stepAvg = [...stepDur.entries()].map(([status, arr]) => ({
      status, count: arr.length, avgMs: arr.reduce((a, b) => a + b, 0) / arr.length, maxMs: Math.max(...arr), minMs: Math.min(...arr),
    })).sort((a, b) => b.avgMs - a.avgMs);
    return {
      section, now, perRecord, allEvents, stepAvg, flow: sortMap(flow), daily: sortKeys(daily), monthly: sortKeys(monthly), hourly: sortKeys(hourly),
      byStatus: sortMap(byStatus), byType: sortMap(byType), pending, unseen, recent, withTimeline: withTl.length, total: records.length, records,
    };
  }

  /* ---------- فیلتر و ترکیب ---------- */

  /** فیلتر رکوردهای یک بخش: {q, type, status, from, to} (تاریخ‌ها به قالب سامانه) */
  function filterRecords(section, records, f) {
    f = f || {};
    const known = S.siteMap ? S.siteMap.sectionFor(section.path) : null;
    const typeKey = known && known.type, statusKey = known && known.status, dateKey = (known && known.date) || section.dateField;
    const from = f.from ? U.parseSystemDate(f.from) : null, to = f.to ? U.parseSystemDate(f.to) : null;
    const q = f.q ? U.enDigits(String(f.q)).trim().toLowerCase() : '';
    return records.filter((r) => {
      if (f.type && f.type.length && typeKey && !f.type.includes(U.formatValue(r.flat[typeKey]))) return false;
      if (f.status && f.status.length && statusKey && !f.status.includes(U.formatValue(r.flat[statusKey]))) return false;
      if ((from || to) && dateKey) {
        const ts = U.parseSystemDate(r.flat[dateKey]);
        if (ts === null) return !f.strictDate;
        if (from && ts < from) return false;
        if (to && ts > to + 86399999) return false;
      }
      if (q) {
        const hay = U.enDigits(Object.values(r.flat).map((v) => (typeof v === 'object' ? '' : String(v ?? ''))).join(' ')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  /** بخش مجازی ترکیبی از چند بخش (کلیدها = برچسب فارسی) برای گزارش جامع */
  function combine(sections, filter) {
    const merged = { path: '/combined', module: 'combined', records: [], timelines: new Map(), attachments: new Map(), details: new Map(), columns: [], autoCounterFields: ['بخش', 'نوع', 'وضعیت'], dateField: 'تاریخ', nameField: 'پرونده', counters: [], combined: true };
    const cols = new Set(['بخش', 'پرونده', 'نوع', 'وضعیت', 'تاریخ']);
    for (const sec of sections) {
      const known = S.siteMap ? S.siteMap.sectionFor(sec.path) : null;
      const L = LBL(sec);
      const label = labelOf(sec);
      const recs = filterRecords(sec, sec.records, filter);
      for (const r of recs) {
        const flat = { بخش: label, پرونده: S.store ? S.store.caseNameOf(sec, r) : r.key, نوع: known && known.type ? r.flat[known.type] : null, وضعیت: known && known.status ? r.flat[known.status] : null, تاریخ: known && known.date ? r.flat[known.date] : (sec.dateField ? r.flat[sec.dateField] : null) };
        for (const [k, v] of Object.entries(r.flat)) { if (k.endsWith('[]')) continue; const lk = L(k); if (!(lk in flat)) { flat[lk] = v; cols.add(lk); } }
        const key = sec.path + '#' + r.key;
        merged.records.push({ key, raw: r.raw, flat, section: sec.path, srcKey: r.key, srcSection: sec, firstTs: r.firstTs, seenTs: r.seenTs });
        const tl = sec.timelines.get(r.key);
        if (tl) merged.timelines.set(key, { rows: tl.rows.map((row) => { const o = {}; for (const [k, v] of Object.entries(U.flatten(row))) o[L(k)] = v; return o; }), ts: tl.ts });
        const at = sec.attachments.get(r.key); if (at) merged.attachments.set(key, at);
      }
    }
    merged.columns = [...cols];
    return merged;
  }

  /** «کارنامهٔ پروندهٔ اجرایی»: پرونده + همهٔ مدارک و رخدادهایش (فقط از داده‌های گرفته‌شده) */
  function caseDossier(caseRec) {
    const st = S.store;
    const docsSec = st && st.state.sections.get('/executive/documents');
    const f = caseRec.flat;
    const docs = docsSec ? docsSec.records.filter((r) => String(r.flat.caseNo) === String(f.no) && String(r.flat.caseSubNo) === String(f.subNo)) : [];
    const items = docs.map((d) => { const tl = docsSec.timelines.get(d.key); return { rec: d, analysis: tl ? analyzeTimeline(tl.rows) : null, reports: (docsSec.details.get(d.key) || {}).rows || [], attachments: (docsSec.attachments.get(d.key) || {}).rows || [], files: (d.files || []).map((k) => st.state.files.get(k)).filter(Boolean) }; });
    const byType = new Map(), byState = new Map();
    let events = 0;
    for (const it of items) { byType.set(it.rec.flat.documentTypeName, (byType.get(it.rec.flat.documentTypeName) || 0) + 1); byState.set(it.rec.flat.currentState || '—', (byState.get(it.rec.flat.currentState || '—') || 0) + 1); events += it.rec.flat.eventCount || 0; }
    items.sort((a, b) => (a.analysis && a.analysis.first ? a.analysis.first.ts : 0) - (b.analysis && b.analysis.first ? b.analysis.first.ts : 0));
    return { caseRec, docsSection: docsSec, items, byType: sortMap(byType), byState: sortMap(byState), events };
  }

  function caseSheetHtml(caseRec, opts) {
    opts = opts || {};
    const st = S.store;
    const caseSec = st.state.sections.get('/executive/getallcases');
    const d = caseDossier(caseRec);
    const name = st.caseNameOf(caseSec, caseRec);
    const LC = LBL(caseSec), LD = d.docsSection ? LBL(d.docsSection) : ((k) => k);
    let body = '<h2>مشخصات پرونده</h2>' + O().kvTable(caseRec.flat, { label: LC });
    body += `<div class="grid2 avoid"><div>شمار مدارک: <b>${n(d.items.length)}</b></div><div>شمار رخدادها: <b>${n(d.events)}</b></div></div>`;
    body += '<h2>شمارش مدارک بر نوع</h2>' + countTable(d.byType, 'نوع مدرک');
    body += '<h2>شمارش مدارک بر وضعیت جاری</h2>' + countTable(d.byState, 'وضعیت جاری');
    if (d.items.length) body += '<h2>فهرست مدارک</h2>' + O().rowsTable(d.items.map((it) => ({ documentTypeName: it.rec.flat.documentTypeName, documentNo: it.rec.flat.documentNo, previousState: it.rec.flat.previousState, currentState: it.rec.flat.currentState, lastChange: it.rec.flat.lastChange, eventCount: it.rec.flat.eventCount })), null, { label: LD });
    for (const it of d.items) {
      body += `<div class="avoid"><h2>${esc(it.rec.flat.documentTypeName || 'مدرک')}${it.rec.flat.documentNo ? ' — ' + esc(U.faDigits(it.rec.flat.documentNo)) : ''} <span class="badge">${esc(it.rec.flat.currentState || '—')}</span></h2>` + timelineHtml(it.analysis) + '</div>';
      if (it.reports.length) body += '<h3>گزارش‌های رسمی این مدرک</h3>' + O().rowsTable(it.reports.map((r) => U.flatten(r)), null, { label: LD });
      if (it.attachments.length) body += '<h3>پیوست‌ها</h3>' + O().rowsTable(it.attachments.map((r) => U.flatten(r)), null, { label: LD });
    }
    return O().render({ title: `کارنامهٔ روند — ${name}`, subtitle: 'اجرای اسناد رسمی — ' + (caseRec.flat.unitName || ''), bodyHtml: body, footer: name, fontCss: opts.fontCss, logo: opts.logo, person: opts.person });
  }

  function isFinal(status) { return /(پایان|پايان|خاتمه|بایگانی|بايگاني|مختومه|تایید نهایی|تأیید نهایی|تاييد نهايي|ابطال|لغو|انجام شده)/.test(String(status || '')); }
  function sortMap(m) { return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })); }
  function sortKeys(m) { return [...m.entries()].sort((a, b) => U.enDigits(a[0]).localeCompare(U.enDigits(b[0]))).map(([label, count]) => ({ label, count })); }

  /* ---------- HTML ---------- */

  const O = () => S.official;
  const esc = (s) => U.escapeHtml(s);
  const n = (x) => U.faDigits(x);
  const LBL = (section) => (k) => (S.store && S.store.fieldLabel ? S.store.fieldLabel(section, k) : k);
  const labelOf = (section) => (S.store ? S.store.labelFor(section.path) : section.path);

  function countTable(items, head) {
    if (!items.length) return '<p class="muted">موردی نیست.</p>';
    return `<table class="avoid"><thead><tr><th>${esc(head)}</th><th>تعداد</th></tr></thead><tbody>` +
      items.map((i) => `<tr><td>${esc(i.label)}</td><td class="num">${n(i.count)}</td></tr>`).join('') + '</tbody></table>';
  }

  function timelineHtml(a) {
    if (!a || !a.steps.length) return '<p class="muted">روندی ثبت نشده است.</p>';
    return '<ul class="timeline">' + a.steps.map((s) => `<li><div><b>${esc(s.status)}</b>${s.prev && s.prev !== '—' ? ` <span class="muted">(پیشین: ${esc(s.prev)})</span>` : ''}${s.user ? ` — ${esc(s.user)}` : ''}</div>` +
      `<div class="d"><span class="num">${esc(s.dateText)}</span>${s.durationMs !== null ? ` · ${s.open ? 'در این مرحله از' : 'ماندگاری'}: ${U.formatDuration(s.durationMs)}` : ''}</div>` +
      (s.note ? `<div class="muted">${esc(s.note)}</div>` : '') + '</li>').join('') + '</ul>';
  }

  /** «کارنامهٔ روند» رسمی یک پرونده */
  function recordSheetHtml(section, rec, opts) {
    opts = opts || {};
    const tl = section.timelines.get(rec.key);
    const a = tl ? analyzeTimeline(tl.rows, opts.now) : null;
    const caseName = S.store ? S.store.caseNameOf(section, rec) : rec.key;
    const L = LBL(section);
    let body = '<h2>مشخصات رکورد</h2>' + O().kvTable(rec.flat, { label: L });
    body += '<h2>خط زمانی روند</h2>' + timelineHtml(a);
    if (a && a.steps.length) {
      body += '<h2>جدول مراحل</h2>' + O().rowsTable(a.steps.map((s) => s.flat), null, { label: L });
      body += `<div class="grid2 avoid"><div>مدت کل روند: <b>${U.formatDuration(a.totalMs)}</b></div><div>از آخرین تغییر: <b>${U.formatDuration(a.ageMs)}</b></div><div>شمار مراحل: <b>${n(a.steps.length)}</b></div><div>وضعیت جاری: <b>${esc(a.last ? a.last.status : '—')}</b></div></div>`;
    }
    const att = section.attachments.get(rec.key);
    if (att && att.rows.length) body += '<h2>پیوست‌ها</h2>' + O().rowsTable(att.rows.map((r) => U.flatten(r)), null, { label: L });
    return O().render({ title: `کارنامهٔ روند — ${caseName}`, subtitle: S.store ? S.store.labelFor(section.path) : section.path, bodyHtml: body, footer: caseName, fontCss: opts.fontCss });
  }

  /** برگهٔ رسمی «مشخصات رکورد» (بدون روند) */
  function recordDetailHtml(section, rec, opts) {
    opts = opts || {};
    const caseName = S.store ? S.store.caseNameOf(section, rec) : rec.key;
    return O().render({ title: caseName, subtitle: S.store ? S.store.labelFor(section.path) : section.path, bodyHtml: O().kvTable(rec.flat, { label: LBL(section) }), footer: caseName, fontCss: opts.fontCss });
  }

  /** گزارش کامل بخش (همهٔ گزارش‌ها در یک سند) */
  function sectionReportHtml(report, opts) {
    opts = opts || {};
    const s = report.section;
    const L = LBL(s);
    const label = s.combined ? 'گزارش جامع (' + n(report.total) + ' رکورد)' : (S.store ? S.store.labelFor(s.path) : s.path);
    const parts = opts.parts || null;   // زیرمجموعهٔ بخش‌های گزارش (کلیدها) یا null = همه
    const want = (k) => !parts || parts.includes(k);
    let body = `<div class="grid2 avoid"><div>شمار رکوردها: <b>${n(report.total)}</b></div><div>رکوردهای دارای روند: <b>${n(report.withTimeline)}</b></div><div>شمار رخدادها: <b>${n(report.allEvents.length)}</b></div><div>معطل‌ها: <b>${n(report.pending.length)}</b> · رویت‌نشده: <b>${n(report.unseen.length)}</b> · تازه: <b>${n(report.recent.length)}</b></div></div>`;
    const hidden = new Set((S.siteMap && S.siteMap.sectionFor(s.path) || {}).hideFields || []);
    const cols = (s.columns || []).filter((c) => !hidden.has(c) && !c.endsWith('[]'));
    if (want('counts')) { body += '<h2>شمارش بر نوع</h2>' + countTable(report.byType, 'نوع'); body += '<h2>شمارش بر وضعیت</h2>' + countTable(report.byStatus, 'وضعیت'); }
    if (want('table')) body += '<h2>جدول کامل رکوردها</h2>' + O().rowsTable(report.records.map((r) => r.flat), cols, { label: L });
    if (want('events')) body += '<h2>جدول کامل رخدادها</h2>' + (report.allEvents.length ? O().rowsTable(report.allEvents.map((e) => Object.assign({ پرونده: e.caseName }, e.flat)), null, { label: L }) : '<p class="muted">هنوز روندی گرفته نشده است.</p>');
    if (want('durations')) body += '<h2>مدت ماندن در هر مرحله (میانگین)</h2>' + (report.stepAvg.length ? '<table class="avoid"><thead><tr><th>وضعیت</th><th>تعداد</th><th>میانگین</th><th>کمینه</th><th>بیشینه</th></tr></thead><tbody>' +
      report.stepAvg.map((r) => `<tr><td>${esc(r.status)}</td><td class="num">${n(r.count)}</td><td>${U.formatDuration(r.avgMs)}</td><td>${U.formatDuration(r.minMs)}</td><td>${U.formatDuration(r.maxMs)}</td></tr>`).join('') + '</tbody></table>' : '<p class="muted">موردی نیست.</p>');
    if (want('flow')) body += '<h2>جریان وضعیت‌ها</h2>' + countTable(report.flow, 'گذار');
    if (want('daily')) body += '<h2>رخداد روزانه</h2>' + countTable(report.daily, 'روز');
    if (want('monthly')) body += '<h2>رخداد ماهانه</h2>' + countTable(report.monthly, 'ماه');
    if (want('hourly')) body += '<h2>توزیع ساعتی</h2>' + countTable(report.hourly, 'ساعت');
    if (want('pending')) body += '<h2>معطل‌ها</h2>' + listRecords(report.pending);
    if (want('unseen')) body += '<h2>رویت‌نشده‌ها</h2>' + listRecords(report.unseen);
    if (want('recent')) body += '<h2>تازه‌ها</h2>' + listRecords(report.recent);
    if (want('timelines')) body += '<h2>خط زمانی هر رکورد</h2>' + (report.perRecord.filter((p) => p.analysis).map((p) => `<div class="avoid"><h2>${esc(p.caseName)} <span class="badge">${esc(p.type)}</span></h2>${timelineHtml(p.analysis)}</div>`).join('') || '<p class="muted">روندی ثبت نشده است.</p>');
    return O().render({ title: opts.title || `گزارش رخداد و روند — ${label}`, subtitle: label, bodyHtml: body, footer: label, fontCss: opts.fontCss, logo: opts.logo, person: opts.person });
  }

  function listRecords(items) {
    if (!items.length) return '<p class="muted">موردی نیست.</p>';
    return '<table class="avoid"><thead><tr><th>پرونده</th><th>نوع</th><th>وضعیت جاری</th><th>آخرین تغییر</th><th>از آخرین تغییر</th></tr></thead><tbody>' +
      items.map((p) => `<tr><td>${esc(p.caseName)}</td><td>${esc(p.type)}</td><td>${esc(p.analysis.last ? p.analysis.last.status : p.status)}</td><td class="num">${esc(p.analysis.last ? p.analysis.last.dateText : '—')}</td><td>${U.formatDuration(p.analysis.ageMs)}</td></tr>`).join('') + '</tbody></table>';
  }

  /* ---------- ردیف‌های Excel ---------- */

  /** برگه‌های Excel گزارش: [{name, rows:[[...]]}] */
  function excelSheets(report) {
    const s = report.section;
    const L = LBL(s);
    const hidden = new Set((S.siteMap && S.siteMap.sectionFor(s.path) || {}).hideFields || []);
    const cols = (s.columns || []).filter((c) => !hidden.has(c) && !c.endsWith('[]'));
    const sheets = [];
    sheets.push({ name: 'رکوردها', rows: [['#', ...cols.map(L)], ...report.records.map((r, i) => [n(i + 1), ...cols.map((c) => U.formatValue(r.flat[c]))])] });
    if (report.allEvents.length) {
      const evCols = [];
      const seen = new Set();
      for (const e of report.allEvents) for (const k of Object.keys(e.flat)) if (!seen.has(k)) { seen.add(k); evCols.push(k); }
      sheets.push({ name: 'رخدادها', rows: [['پرونده', 'نوع', ...evCols.map(L), 'ماندگاری'], ...report.allEvents.map((e) => [e.caseName, e.type, ...evCols.map((c) => U.formatValue(e.flat[c])), U.formatDuration(e.durationMs)])] });
    }
    sheets.push({ name: 'شمارش‌ها', rows: [['دسته', 'مقدار', 'تعداد'], ...report.byType.map((x) => ['نوع', x.label, n(x.count)]), ...report.byStatus.map((x) => ['وضعیت', x.label, n(x.count)]), ...report.flow.map((x) => ['گذار', x.label, n(x.count)]), ...report.daily.map((x) => ['روز', x.label, n(x.count)]), ...report.monthly.map((x) => ['ماه', x.label, n(x.count)]), ...report.hourly.map((x) => ['ساعت', x.label, n(x.count)])] });
    sheets.push({ name: 'مدت مراحل', rows: [['وضعیت', 'تعداد', 'میانگین', 'کمینه', 'بیشینه'], ...report.stepAvg.map((r) => [r.status, n(r.count), U.formatDuration(r.avgMs), U.formatDuration(r.minMs), U.formatDuration(r.maxMs)])] });
    const rec = (p) => [p.caseName, p.type, p.analysis.last ? p.analysis.last.status : p.status, p.analysis.last ? p.analysis.last.dateText : '—', U.formatDuration(p.analysis.ageMs)];
    sheets.push({ name: 'معطل و تازه', rows: [['دسته', 'پرونده', 'نوع', 'وضعیت جاری', 'آخرین تغییر', 'از آخرین تغییر'], ...report.pending.map((p) => ['معطل', ...rec(p)]), ...report.unseen.map((p) => ['رویت‌نشده', ...rec(p)]), ...report.recent.map((p) => ['تازه', ...rec(p)])] });
    return sheets;
  }

  S.reports = { detectFields, analyzeTimeline, build, filterRecords, combine, caseDossier, caseSheetHtml, recordSheetHtml, recordDetailHtml, sectionReportHtml, excelSheets, timelineHtml, countTable, isFinal, PARTS: [['counts', 'شمارش بر نوع و وضعیت'], ['table', 'جدول کامل رکوردها'], ['events', 'جدول کامل رخدادها'], ['durations', 'مدت ماندن در هر مرحله'], ['flow', 'جریان وضعیت‌ها'], ['daily', 'رخداد روزانه'], ['monthly', 'رخداد ماهانه'], ['hourly', 'توزیع ساعتی'], ['pending', 'معطل‌ها'], ['unseen', 'رویت‌نشده‌ها'], ['recent', 'تازه‌ها'], ['timelines', 'خط زمانی هر رکورد']] };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
