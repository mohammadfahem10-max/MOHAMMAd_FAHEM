/* قالب خروجی رسمی: سربرگ ثابت، «تهیه و تنظیم: محمدعلی کریمی‌پور»، مهر کم‌رنگ ضدکپی مورب، چاپ A4.
   خروجی HTML است و با موتور مرورگر به PDF چاپ می‌شود؛ فونت همراه از راه نشانگر SABTMAN_FONT (کامنت CSS) تزریق می‌شود. */
(function (S) {
  'use strict';
  const U = S.util;
  const PREPARER = 'تهیه و تنظیم: محمدعلی کریمی‌پور';
  const FONT_MARK = '/*SABTMAN_FONT*/';

  const CSS = `
${FONT_MARK}
@page { size: A4; margin: 14mm 12mm 16mm 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Vazirmatn', 'Vazir', Tahoma, sans-serif; direction: rtl; color: #1A1F2E; font-size: 12.5px; line-height: 1.8; background: #fff; }
.sheet { position: relative; padding: 4mm 0; }
.hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0F6CBD; padding-bottom: 6px; margin-bottom: 12px; }
.hdr .t { font-weight: 700; font-size: 16px; color: #0F6CBD; }
.hdr .s { color: #454C63; font-size: 11.5px; }
.hdr .m { text-align: left; color: #737A92; font-size: 11px; line-height: 1.6; }
h1 { font-size: 18px; margin: 4px 0 8px; color: #1A1F2E; }
h2 { font-size: 14px; margin: 16px 0 6px; color: #0F6CBD; border-right: 4px solid #6B5BD6; padding-right: 8px; break-after: avoid; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; page-break-inside: auto; }
tr { page-break-inside: avoid; break-inside: avoid; }
thead { display: table-header-group; }
th, td { border: 1px solid #C9D8FF; padding: 5px 7px; text-align: right; vertical-align: top; word-break: break-word; }
th { background: #EEF1FB; font-weight: 700; color: #1A1F2E; }
tbody tr:nth-child(even) td { background: #F7F9FF; }
.kv td:first-child { width: 32%; color: #454C63; background: #F7F9FF; font-weight: 600; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 8px; font-size: 11px; background: #E3D4FF; color: #1A1F2E; }
.ok { background: #DCF3E8; color: #1F8A5B; } .warn { background: #FBEBD0; color: #B7791F; } .err { background: #F9DEDC; color: #C2413B; }
.stamp { position: fixed; top: 42%; left: 8%; right: 8%; text-align: center; transform: rotate(-28deg); font-size: 44px; font-weight: 700; color: rgba(15,108,189,.09); letter-spacing: 4px; pointer-events: none; z-index: 0; white-space: nowrap; }
.content { position: relative; z-index: 1; }
.ftr { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #C9D8FF; padding-top: 4px; font-size: 10.5px; color: #737A92; display: flex; justify-content: space-between; }
.muted { color: #737A92; } .num { font-variant-numeric: tabular-nums; }
.timeline { list-style: none; padding: 0; margin: 6px 0; border-right: 2px solid #C9D8FF; }
.timeline li { position: relative; padding: 2px 16px 8px 0; }
.timeline li::before { content: ''; position: absolute; right: -6px; top: 10px; width: 10px; height: 10px; border-radius: 50%; background: linear-gradient(135deg,#0F6CBD,#6B5BD6); }
.timeline .d { color: #454C63; font-size: 11px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
.avoid { break-inside: avoid; page-break-inside: avoid; }
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

  /**
   * صفحهٔ رسمی کامل.
   * doc: {title, subtitle, bodyHtml, stamp?, fontCss?}
   */
  function render(doc) {
    const now = U.formatSystemDate();
    const stamp = doc.stamp || 'نسخهٔ رسمی — کپی‌برداری بدون مجوز ممنوع';
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
    <div>
      <div class="t">${esc(doc.header || 'سامانهٔ «ثبت من» — استخراج و گزارش')}</div>
      <div class="s">${esc(doc.subtitle || '')}</div>
    </div>
    <div class="m">
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

  S.official = { render, kvTable, rowsTable, PREPARER, FONT_MARK, CSS };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
