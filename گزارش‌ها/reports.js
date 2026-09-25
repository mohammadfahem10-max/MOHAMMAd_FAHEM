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
    const dated = steps.filter((s) => s.ts !== null);
    if (dated.length === steps.length) steps.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < steps.length; i++) {
      const cur = steps[i], next = steps[i + 1];
      cur.durationMs = cur.ts !== null && next && next.ts !== null ? next.ts - cur.ts : (cur.ts !== null && !next ? (nowMs || Date.now()) - cur.ts : null);
      cur.open = !next;
    }
    const first = steps.find((s) => s.ts !== null);
    const last = [...steps].reverse().find((s) => s.ts !== null);
    return {
      fields: f, steps, first, last,
      totalMs: first && last ? last.ts - first.ts : null,
      ageMs: last ? (nowMs || Date.now()) - last.ts : null,
      seen: steps.some((s) => /رویت|روئیت|مشاهده|دیده/.test(s.status)),
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

    for (const rec of section.records) {
      const tl = section.timelines.get(rec.key);
      const caseName = S.store ? S.store.caseNameOf(section, rec) : rec.key;
      const typeKey = section.autoCounterFields && section.autoCounterFields.find((k) => TYPE_KEY.test(k));
      const typeVal = typeKey ? U.formatValue(rec.flat[typeKey]) : '—';
      byType.set(typeVal, (byType.get(typeVal) || 0) + 1);
      const statusKey = section.columns && section.columns.find((k) => STATUS_KEY.test(k) && !PREV_KEY.test(k));
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
      byStatus: sortMap(byStatus), byType: sortMap(byType), pending, unseen, recent, withTimeline: withTl.length, total: section.records.length,
    };
  }

  function isFinal(status) { return /(پایان|خاتمه|بایگانی|مختومه|تایید نهایی|تأیید نهایی|ابطال|لغو)/.test(String(status || '')); }
  function sortMap(m) { return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })); }
  function sortKeys(m) { return [...m.entries()].sort((a, b) => U.enDigits(a[0]).localeCompare(U.enDigits(b[0]))).map(([label, count]) => ({ label, count })); }

  /* ---------- HTML ---------- */

  const O = () => S.official;
  const esc = (s) => U.escapeHtml(s);
  const n = (x) => U.faDigits(x);

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
    let body = '<h2>مشخصات رکورد</h2>' + O().kvTable(rec.flat);
    body += '<h2>خط زمانی روند</h2>' + timelineHtml(a);
    if (a && a.steps.length) {
      body += '<h2>جدول مراحل</h2>' + O().rowsTable(a.steps.map((s) => s.flat));
      body += `<div class="grid2 avoid"><div>مدت کل روند: <b>${U.formatDuration(a.totalMs)}</b></div><div>از آخرین تغییر: <b>${U.formatDuration(a.ageMs)}</b></div><div>شمار مراحل: <b>${n(a.steps.length)}</b></div><div>وضعیت جاری: <b>${esc(a.last ? a.last.status : '—')}</b></div></div>`;
    }
    const att = section.attachments.get(rec.key);
    if (att && att.rows.length) body += '<h2>پیوست‌ها</h2>' + O().rowsTable(att.rows.map((r) => U.flatten(r)));
    return O().render({ title: `کارنامهٔ روند — ${caseName}`, subtitle: S.store ? S.store.labelFor(section.path) : section.path, bodyHtml: body, footer: caseName, fontCss: opts.fontCss });
  }

  /** برگهٔ رسمی «مشخصات رکورد» (بدون روند) */
  function recordDetailHtml(section, rec, opts) {
    opts = opts || {};
    const caseName = S.store ? S.store.caseNameOf(section, rec) : rec.key;
    return O().render({ title: caseName, subtitle: S.store ? S.store.labelFor(section.path) : section.path, bodyHtml: O().kvTable(rec.flat), footer: caseName, fontCss: opts.fontCss });
  }

  /** گزارش کامل بخش (همهٔ گزارش‌ها در یک سند) */
  function sectionReportHtml(report, opts) {
    opts = opts || {};
    const s = report.section;
    const label = S.store ? S.store.labelFor(s.path) : s.path;
    let body = `<div class="grid2 avoid"><div>شمار رکوردها: <b>${n(report.total)}</b></div><div>رکوردهای دارای روند: <b>${n(report.withTimeline)}</b></div><div>شمار رخدادها: <b>${n(report.allEvents.length)}</b></div><div>معطل‌ها: <b>${n(report.pending.length)}</b> · رویت‌نشده: <b>${n(report.unseen.length)}</b> · تازه: <b>${n(report.recent.length)}</b></div></div>`;
    body += '<h2>شمارش بر نوع</h2>' + countTable(report.byType, 'نوع');
    body += '<h2>شمارش بر وضعیت</h2>' + countTable(report.byStatus, 'وضعیت');
    body += '<h2>جدول کامل رکوردها</h2>' + O().rowsTable(s.records.map((r) => r.flat), s.columns);
    body += '<h2>جدول کامل رخدادها</h2>' + (report.allEvents.length ? O().rowsTable(report.allEvents.map((e) => Object.assign({ پرونده: e.caseName }, e.flat))) : '<p class="muted">هنوز روندی گرفته نشده است.</p>');
    body += '<h2>مدت ماندن در هر مرحله (میانگین)</h2>' + (report.stepAvg.length ? '<table class="avoid"><thead><tr><th>وضعیت</th><th>تعداد</th><th>میانگین</th><th>کمینه</th><th>بیشینه</th></tr></thead><tbody>' +
      report.stepAvg.map((r) => `<tr><td>${esc(r.status)}</td><td class="num">${n(r.count)}</td><td>${U.formatDuration(r.avgMs)}</td><td>${U.formatDuration(r.minMs)}</td><td>${U.formatDuration(r.maxMs)}</td></tr>`).join('') + '</tbody></table>' : '<p class="muted">موردی نیست.</p>');
    body += '<h2>جریان وضعیت‌ها</h2>' + countTable(report.flow, 'گذار');
    body += '<h2>رخداد روزانه</h2>' + countTable(report.daily, 'روز');
    body += '<h2>رخداد ماهانه</h2>' + countTable(report.monthly, 'ماه');
    body += '<h2>توزیع ساعتی</h2>' + countTable(report.hourly, 'ساعت');
    body += '<h2>معطل‌ها</h2>' + listRecords(report.pending);
    body += '<h2>رویت‌نشده‌ها</h2>' + listRecords(report.unseen);
    body += '<h2>تازه‌ها</h2>' + listRecords(report.recent);
    body += '<h2>خط زمانی هر رکورد</h2>' + report.perRecord.filter((p) => p.analysis).map((p) => `<div class="avoid"><h2>${esc(p.caseName)} <span class="badge">${esc(p.type)}</span></h2>${timelineHtml(p.analysis)}</div>`).join('');
    return O().render({ title: `گزارش رخداد و روند — ${label}`, subtitle: label, bodyHtml: body, footer: label, fontCss: opts.fontCss });
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
    const cols = s.columns || [];
    const sheets = [];
    sheets.push({ name: 'رکوردها', rows: [['#', ...cols], ...s.records.map((r, i) => [n(i + 1), ...cols.map((c) => U.formatValue(r.flat[c]))])] });
    if (report.allEvents.length) {
      const evCols = [];
      const seen = new Set();
      for (const e of report.allEvents) for (const k of Object.keys(e.flat)) if (!seen.has(k)) { seen.add(k); evCols.push(k); }
      sheets.push({ name: 'رخدادها', rows: [['پرونده', 'نوع', ...evCols, 'ماندگاری'], ...report.allEvents.map((e) => [e.caseName, e.type, ...evCols.map((c) => U.formatValue(e.flat[c])), U.formatDuration(e.durationMs)])] });
    }
    sheets.push({ name: 'شمارش‌ها', rows: [['دسته', 'مقدار', 'تعداد'], ...report.byType.map((x) => ['نوع', x.label, n(x.count)]), ...report.byStatus.map((x) => ['وضعیت', x.label, n(x.count)]), ...report.flow.map((x) => ['گذار', x.label, n(x.count)]), ...report.daily.map((x) => ['روز', x.label, n(x.count)]), ...report.monthly.map((x) => ['ماه', x.label, n(x.count)]), ...report.hourly.map((x) => ['ساعت', x.label, n(x.count)])] });
    sheets.push({ name: 'مدت مراحل', rows: [['وضعیت', 'تعداد', 'میانگین', 'کمینه', 'بیشینه'], ...report.stepAvg.map((r) => [r.status, n(r.count), U.formatDuration(r.avgMs), U.formatDuration(r.minMs), U.formatDuration(r.maxMs)])] });
    const rec = (p) => [p.caseName, p.type, p.analysis.last ? p.analysis.last.status : p.status, p.analysis.last ? p.analysis.last.dateText : '—', U.formatDuration(p.analysis.ageMs)];
    sheets.push({ name: 'معطل و تازه', rows: [['دسته', 'پرونده', 'نوع', 'وضعیت جاری', 'آخرین تغییر', 'از آخرین تغییر'], ...report.pending.map((p) => ['معطل', ...rec(p)]), ...report.unseen.map((p) => ['رویت‌نشده', ...rec(p)]), ...report.recent.map((p) => ['تازه', ...rec(p)])] });
    return sheets;
  }

  S.reports = { detectFields, analyzeTimeline, build, recordSheetHtml, recordDetailHtml, sectionReportHtml, excelSheets, timelineHtml, isFinal };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
