/* قالب خروجی رسمی: سربرگ ثابت، «تهیه و تنظیم: محمدعلی کریمی‌پور»، مهر کم‌رنگ ضدکپی مورب، چاپ A4.
   خروجی HTML است و با موتور مرورگر به PDF چاپ می‌شود؛ فونت همراه از راه نشانگر SABTMAN_FONT (کامنت CSS) تزریق می‌شود. */
(function (S) {
  'use strict';
  const U = S.util;
  const PREPARER = 'تهیه و تنظیم: محمدعلی کریمی‌پور';
  const STAMP = 'نسخهٔ کنترل‌شده — تهیه‌کننده: محمدعلی کریمی‌پور — هرگونه تکثیر، انتشار یا استناد به این سند بدون مجوز کتبی تهیه‌کننده مجاز نیست';
  const ORG = 'شرکت طلوع فردای ایرانیان';
  const FONT_MARK = '/*SABTMAN_FONT*/';

  const CSS = `
${FONT_MARK}
@page { size: A4; margin: 13mm 11mm 15mm 11mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Vazirmatn', 'Vazir', Tahoma, sans-serif; direction: rtl; color: #1E2536; font-size: 11.5px; line-height: 1.75; background: #fff; }
.sheet { position: relative; padding: 2mm 0; }
.hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #0F6CBD; padding-bottom: 8px; margin-bottom: 12px; }
.hdr .brand { display: flex; align-items: center; gap: 10px; }
.hdr .logo { width: 42px; height: 42px; flex: none; }
.hdr .t { font-weight: 700; font-size: 15px; color: #0F6CBD; line-height: 1.3; }
.hdr .s { color: #4A5169; font-size: 11px; }
.hdr .m { text-align: left; color: #6B7288; font-size: 10.5px; line-height: 1.7; }
.hdr .m b { color: #2C3350; }
h1 { font-size: 17px; margin: 2px 0 3px; color: #16203A; font-weight: 700; }
.lead { color: #5A6178; font-size: 11px; margin: 0 0 10px; }
h2 { font-size: 13px; margin: 15px 0 7px; color: #0F6CBD; padding-right: 10px; position: relative; break-after: avoid; font-weight: 700; }
h2::before { content: ''; position: absolute; right: 0; top: 2px; bottom: 2px; width: 4px; border-radius: 3px; background: linear-gradient(180deg,#0F6CBD,#6B5BD6); }
h3 { font-size: 11.5px; margin: 10px 0 4px; color: #2C3350; font-weight: 700; }
table { width: 100%; border-collapse: collapse; margin: 5px 0 10px; page-break-inside: auto; font-size: 10.5px; }
tr { page-break-inside: avoid; break-inside: avoid; }
thead { display: table-header-group; }
th, td { border: 1px solid #D6E1F7; padding: 5px 7px; text-align: right; vertical-align: top; word-break: break-word; }
th { background: linear-gradient(180deg,#EEF3FC,#E3ECF9); font-weight: 700; color: #16203A; font-size: 10.5px; }
tbody tr:nth-child(even) td { background: #F6F9FE; }
td.num, th.num { font-variant-numeric: tabular-nums; }
.kv td:first-child { width: 30%; color: #4A5169; background: #F3F6FC; font-weight: 600; }
.center { text-align: center; }
.kpis { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
.kpi { flex: 1 1 130px; border: 1px solid #D6E1F7; border-radius: 10px; padding: 8px 12px; background: linear-gradient(135deg,#F7FAFF,#EEF3FC); position: relative; overflow: hidden; }
.kpi .n { font-size: 20px; font-weight: 700; color: #0F6CBD; line-height: 1.2; }
.kpi .l { font-size: 10px; color: #5A6178; font-weight: 600; }
.kpi.a { background: linear-gradient(135deg,#EAF6F0,#DDF0E6); } .kpi.a .n { color: #1F8A5B; }
.kpi.w { background: linear-gradient(135deg,#FDF4E6,#FBEBD0); } .kpi.w .n { color: #B7791F; }
.kpi.e { background: linear-gradient(135deg,#FCEEEC,#F9DEDC); } .kpi.e .n { color: #C2413B; }
.pill { display: inline-block; padding: 1px 9px; border-radius: 20px; font-size: 10px; font-weight: 700; white-space: nowrap; background: #EAEDF4; color: #4A5169; }
.pill.ok { background: #DCF3E8; color: #187A4E; } .pill.good { background: #E1EDFB; color: #0F6CBD; } .pill.info { background: #E9E2FB; color: #5B4BC4; }
.pill.warn { background: #FBEBD0; color: #9C6714; } .pill.err { background: #F9DEDC; color: #B23A34; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 8px; font-size: 10px; background: #E9E2FB; color: #2C3350; }
.stamp { position: fixed; top: 47%; left: -13%; right: -13%; text-align: center; transform: rotate(-32deg); font-size: 22px; font-weight: 700; color: rgba(15,108,189,.085); letter-spacing: .5px; pointer-events: none; z-index: 0; white-space: nowrap; line-height: 1.5; }
.content { position: relative; z-index: 1; }
.ftr { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #D6E1F7; padding-top: 4px; font-size: 9.5px; color: #6B7288; display: flex; justify-content: space-between; }
.muted { color: #6B7288; }
.timeline { list-style: none; padding: 0 14px 0 0; margin: 5px 0 10px; border-right: 2px solid #CFDCF3; }
.timeline li { position: relative; padding: 1px 15px 7px 0; }
.timeline li::before { content: ''; position: absolute; right: -6px; top: 6px; width: 9px; height: 9px; border-radius: 50%; background: linear-gradient(135deg,#0F6CBD,#6B5BD6); }
.timeline .d { color: #4A5169; font-size: 10px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; margin: 6px 0; }
.grid2 > div { padding: 5px 10px; background: #F6F9FE; border-radius: 8px; border: 1px solid #E4ECF8; font-size: 10.5px; }
.grid2 b { color: #0F6CBD; }
.bar-row { display: grid; grid-template-columns: 130px 1fr 44px; gap: 8px; align-items: center; margin: 3px 0; font-size: 10.5px; }
.bar-row .track { background: #EDF1F9; border-radius: 5px; height: 15px; overflow: hidden; }
.bar-row .fill { height: 100%; background: linear-gradient(90deg,#6B5BD6,#0F6CBD); border-radius: 5px; }
.bar-row .v { text-align: left; font-variant-numeric: tabular-nums; color: #2C3350; font-weight: 600; }
.hours { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; align-items: end; height: 90px; margin: 6px 0 2px; }
.hours .h { background: linear-gradient(180deg,#6B5BD6,#0F6CBD); border-radius: 2px 2px 0 0; min-height: 1px; position: relative; }
.hours .h span { position: absolute; top: -13px; left: 0; right: 0; text-align: center; font-size: 7.5px; color: #4A5169; }
.hours-x { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; font-size: 7px; color: #6B7288; text-align: center; }
.avoid { break-inside: avoid; page-break-inside: avoid; }
.divider { height: 1px; background: #E4ECF8; margin: 12px 0; }
.note { background: #F3F6FC; border-right: 3px solid #6B5BD6; padding: 6px 10px; border-radius: 6px; font-size: 10.5px; margin: 6px 0; }
@media print { .stamp { position: fixed; } }
`;

  function esc(s) { return U.escapeHtml(s); }

  /** جدول کلید-مقدار از یک رکورد تخت‌شده */
  function kvTable(flat, opts) {
    opts = opts || {};
    const rows = Object.entries(flat).filter(([k, v]) => !k.endsWith('[]'));
    let html = '<table class="kv"><tbody>';
    for (const [k, v] of rows) html += `<tr><td>${esc(opts.label ? opts.label(k) : k)}</td><td>${esc(U.formatValue(v))}</td></tr>`;
    html += '</tbody></table>';
    for (const [k, v] of Object.entries(flat)) {
      if (!k.endsWith('[]') || !Array.isArray(v) || !v.length) continue;
      html += `<h2>${esc(k.slice(0, -2))}</h2>` + rowsTable(v.map((r) => U.flatten(r)));
    }
    return html;
  }

  /** جدول رکوردها (ستون‌ها = اجتماع کلیدها) */
  function rowsTable(flats, columns, opts) {
    opts = opts || {};
    if (!flats.length) return '<p class="muted">رکوردی نیست.</p>';
    if (!columns) {
      const seen = new Set(); columns = [];
      for (const f of flats) for (const k of Object.keys(f)) if (!k.endsWith('[]') && !seen.has(k)) { seen.add(k); columns.push(k); }
    }
    let html = '<table><thead><tr><th>#</th>' + columns.map((c) => `<th>${esc(opts.label ? opts.label(c) : c)}</th>`).join('') + '</tr></thead><tbody>';
    flats.forEach((f, i) => {
      html += `<tr><td class="num">${U.faDigits(i + 1)}</td>` + columns.map((c) => `<td>${esc(U.formatValue(f[c]))}</td>`).join('') + '</tr>';
    });
    return html + '</tbody></table>';
  }

  /** ردیف KPI: [{label, value, tone?}] tone: '' | 'a' | 'w' | 'e' */
  function kpis(items) {
    return '<div class="kpis">' + items.map((k) => `<div class="kpi ${k.tone || ''}"><div class="n">${esc(U.faDigits(k.value))}</div><div class="l">${esc(k.label)}</div></div>`).join('') + '</div>';
  }
  /** نشان وضعیت رنگی (pill) */
  function pill(status) {
    const tone = (typeof window !== 'undefined' && window.SabtMan.siteMap) ? window.SabtMan.siteMap.tone(status) : 'muted';
    return `<span class="pill ${tone}">${esc(U.formatValue(status))}</span>`;
  }
  /** نوار افقی: [{label, value}] بیشینه خودکار */
  function bars(items, opts) {
    opts = opts || {};
    if (!items.length) return '<p class="muted">موردی نیست.</p>';
    const max = Math.max(1, ...items.map((i) => i.value));
    return '<div class="avoid">' + items.map((i) => `<div class="bar-row"><span>${esc(i.label)}</span><span class="track"><span class="fill" style="width:${Math.round((i.value / max) * 100)}%"></span></span><span class="v">${U.faDigits(i.value)}${opts.suffix || ''}</span></div>`).join('') + '</div>';
  }
  /** توزیع ۲۴ ساعته: values[24] */
  function hours(values, opts) {
    opts = opts || {};
    const max = Math.max(1, ...values);
    let s = '<div class="hours avoid">';
    for (let h = 0; h < 24; h++) { const v = values[h] || 0; s += `<div class="h" style="height:${Math.round((v / max) * 100)}%">${v ? `<span>${U.faDigits(v)}</span>` : ''}</div>`; }
    s += '</div><div class="hours-x">';
    for (let h = 0; h < 24; h++) s += `<span>${U.faDigits(h)}</span>`;
    return s + '</div>';
  }
  /** جدول رخدادها با ستون وضعیت رنگی */
  function eventsTable(rows) {
    if (!rows.length) return '<p class="muted">رخدادی نیست.</p>';
    return `<table class="avoid"><thead><tr><th>#</th><th>تاریخ و ساعت</th><th>پرونده</th><th>نوع مدرک</th><th>وضعیت پیشین</th><th>وضعیت جاری</th><th>ماندگاری</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td class="num">${U.faDigits(i + 1)}</td><td class="num">${esc(r.dateText)}</td><td class="num">${esc(r.caseName || '—')}</td><td>${esc(r.docType || '—')}</td><td>${r.prev && r.prev !== '—' ? pill(r.prev) : '—'}</td><td>${pill(r.status)}</td><td>${r.durationText || '—'}</td></tr>`).join('')}</tbody></table>`;
  }

  /**
   * صفحهٔ رسمی کامل.
   * doc: {title, subtitle, bodyHtml, stamp?, fontCss?}
   */
  function render(doc) {
    const now = U.formatSystemDate();
    const stamp = doc.stamp || STAMP;
    const css = doc.fontCss ? CSS.replace(FONT_MARK, doc.fontCss) : CSS;
    return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(doc.title)}</title>
<style>${css}</style>
</head>
<body>
<div class="stamp">${esc(stamp)}</div>
<div class="sheet">
  <div class="hdr">
    <div class="brand">${doc.logo ? `<img class="logo" src="${doc.logo}" alt="">` : ''}<div><div class="t">${esc(doc.header || ORG + ' — سامانهٔ «ثبت من»')}</div><div class="s">${esc(doc.subtitle || '')}</div></div></div>
    <div class="m">
      ${doc.person ? `<div><b>${esc(doc.person)}</b></div>` : ''}
      <div>${esc(PREPARER)}</div>
      <div>تاریخ تهیه: <span class="num">${esc(now)}</span></div>
    </div>
  </div>
  <div class="content">
    <h1>${esc(doc.title)}</h1>
    ${doc.bodyHtml || ''}
  </div>
  <div class="ftr"><span>${esc(PREPARER)}</span><span>${esc(doc.footer || doc.title)}</span></div>
</div>
</body>
</html>`;
  }

  S.official = { render, kvTable, rowsTable, kpis, pill, bars, hours, eventsTable, PREPARER, STAMP, ORG, FONT_MARK, CSS };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
