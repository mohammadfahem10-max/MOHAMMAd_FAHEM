/* نمودارهای سبک SVG (بی هیچ کتابخانه): ستونی، حلقه‌ای، خط روند کوچک. رنگ‌ها از متغیرهای تم. */
(function (S) {
  'use strict';
  const U = S.util;
  const esc = U.escapeHtml, n = U.faDigits;
  const PALETTE = ['var(--ac)', 'var(--ac2)', '#1F8A5B', '#B7791F', '#C2413B', '#2B88D8', '#8B5CF6', '#0E9F8B', '#E06C9F', '#6B7280'];

  /** ستونی: items [{label, value}] */
  function bars(items, opts) {
    opts = opts || {};
    const W = opts.width || 640, H = opts.height || 200, padB = 34, padL = 8, padR = 8, padT = 12;
    if (!items.length) return '<div class="empty muted">داده‌ای نیست.</div>';
    const max = Math.max(1, ...items.map((i) => i.value));
    const bw = (W - padL - padR) / items.length;
    const gid = 'g' + Math.random().toString(36).slice(2, 7);
    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ac)"/><stop offset="1" stop-color="var(--ac2)"/></linearGradient></defs>`;
    for (let g = 0; g <= 4; g++) { const y = padT + (H - padB - padT) * (g / 4); s += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="var(--line-2)" stroke-width="1"/>`; }
    items.forEach((it, i) => {
      const h = (H - padB - padT) * (it.value / max);
      const x = W - padR - (i + 1) * bw + bw * 0.18, y = H - padB - h;
      s += `<rect x="${x}" y="${y}" width="${bw * 0.64}" height="${h}" rx="4" fill="url(#${gid})"><title>${esc(it.label)}: ${n(it.value)}</title></rect>`;
      if (it.value) s += `<text x="${x + bw * 0.32}" y="${y - 4}" text-anchor="middle" font-size="10" fill="var(--tx2)">${n(it.value)}</text>`;
      s += `<text x="${x + bw * 0.32}" y="${H - padB + 16}" text-anchor="middle" font-size="10.5">${esc(String(it.label).length > 9 ? String(it.label).slice(0, 9) + '…' : it.label)}</text>`;
    });
    return s + '</svg>';
  }

  /** حلقه‌ای: items [{label, value}] */
  function donut(items, opts) {
    opts = opts || {};
    const total = items.reduce((a, b) => a + b.value, 0);
    if (!total) return '<div class="empty muted">داده‌ای نیست.</div>';
    const R = 52, C = 2 * Math.PI * R;
    let off = 0;
    let s = `<div class="donut-wrap"><svg viewBox="0 0 130 130"><g transform="translate(65,65) rotate(-90)">`;
    items.forEach((it, i) => {
      const frac = it.value / total, len = C * frac;
      s += `<circle r="${R}" cx="0" cy="0" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"><title>${esc(it.label)}: ${n(it.value)}</title></circle>`;
      off += len;
    });
    s += `</g><text x="65" y="60" text-anchor="middle" class="donut-c">${n(total)}</text><text x="65" y="80" text-anchor="middle" font-size="11">${esc(opts.center || 'کل')}</text></svg>`;
    s += `<div class="legend">${items.slice(0, 8).map((it, i) => `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(it.label)} <b>${n(it.value)}</b></span>`).join('')}</div></div>`;
    return s;
  }

  /** خط روند کوچک */
  function spark(values, opts) {
    opts = opts || {};
    const W = opts.width || 120, H = opts.height || 34;
    if (!values.length) return '';
    const max = Math.max(1, ...values), step = W / Math.max(1, values.length - 1);
    const pts = values.map((v, i) => `${(W - i * step).toFixed(1)},${(H - 2 - (H - 4) * (v / max)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px"><polyline points="${pts}" fill="none" stroke="var(--ac)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  S.ui = Object.assign(S.ui || {}, { charts: { bars, donut, spark, PALETTE } });
})(window.SabtMan = window.SabtMan || {});
