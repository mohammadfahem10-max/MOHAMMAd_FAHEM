/* ابزارهای مشترک رابط: نشانه‌ها (SVG)، تم (همهٔ تم‌های میزبان)، کشو، منو، پیام کوتاه، نشان وضعیت. */
(function (S) {
  'use strict';
  const U = S.util;
  const esc = U.escapeHtml;
  const n = U.faDigits;

  /* ---------- نشانه‌ها (Fluent-گونه، خطی) ---------- */
  const ICONS = {
    dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
    gavel: '<path d="M14 4l6 6-2 2-6-6 2-2zm-3 3l6 6-8 8H3v-6l8-8zm7 13h-8v2h8v-2z"/>',
    stack: '<path d="M12 2 2 7l10 5 10-5-10-5zm-8 9.5-2 1 10 5 10-5-2-1-8 4-8-4zm0 4.5-2 1 10 5 10-5-2-1-8 4-8-4z"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"/>',
    home: '<path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3L12 3z"/>',
    building: '<path d="M4 21V3h10v6h6v12H4zm2-2h2v-2H6v2zm0-4h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 12h2v-2h-2v2zm0-4h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 12h4v-2h-4v2zm0-4h4v-2h-4v2z"/>',
    rings: '<path d="M8 6a6 6 0 1 0 3.5 10.9A6 6 0 1 0 16 6a6 6 0 0 0-4 1.5A6 6 0 0 0 8 6zm0 2a4 4 0 0 1 2.5.9A6 6 0 0 0 10 12a6 6 0 0 0 .5 2.4A4 4 0 1 1 8 8zm8 0a4 4 0 1 1-2.5 7.1A6 6 0 0 0 14 12a6 6 0 0 0-.5-3.1A4 4 0 0 1 16 8z"/>',
    car: '<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v5h-2v-1H5v1H3v-5a2 2 0 0 1 2-2zm2.1 0h9.8l-1-3H8.1l-1 3zM7 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>',
    badge: '<path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1 14-3.5-3.5 1.4-1.4L11 13.2l4.6-4.6 1.4 1.4L11 16z"/>',
    calendar: '<path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm-1 8v10h12V10H6zm2 2h3v3H8v-3z"/>',
    user: '<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4 0-8 2-8 5v3h16v-3c0-3-4-5-8-5z"/>',
    report: '<path d="M4 3h16v18H4V3zm3 12h2v3H7v-3zm4-4h2v7h-2v-7zm4-4h2v11h-2V7z"/>',
    settings: '<path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3H9l-.4 2.7a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.7 7.7 0 0 0 1.7 1L9 21h6l.4-2.7a7.7 7.7 0 0 0 1.7-1l2.5 1 2-3.5-2.1-1.7zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>',
    refresh: '<path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-4.9 6H5a7 7 0 1 0 7-8z"/>',
    logout: '<path d="M10 3H4v18h6v-2H6V5h4V3zm5 4-1.4 1.4 2.6 2.6H9v2h7.2l-2.6 2.6L15 17l5-5-5-5z"/>',
    download: '<path d="M12 3v10.2l3.6-3.6L17 11l-5 5-5-5 1.4-1.4L11 13.2V3h1zM4 19h16v2H4v-2z"/>',
    eye: '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
    timeline: '<path d="M4 4h2v16H4V4zm5 2h11v3H9V6zm0 5h8v3H9v-3zm0 5h13v3H9v-3z"/>',
    clip: '<path d="M16.5 6.5 8 15a2 2 0 0 0 2.8 2.8l7.8-7.8a4 4 0 0 0-5.7-5.7L5 12.2a6 6 0 0 0 8.5 8.5l6.4-6.4-1.4-1.4-6.4 6.4a4 4 0 0 1-5.7-5.7l7.8-7.8a2 2 0 0 1 2.8 2.8l-8.5 8.5a.5.5 0 0 1-.7-.7L15 8l-1.4-1.4z"/>',
    search: '<path d="M10 3a7 7 0 1 0 4.3 12.5l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/>',
    close: '<path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L12 13.4l-6.3 6.3-1.4-1.4L10.6 12 4.3 5.7l1.4-1.4L12 10.6l6.3-6.3 1.4 1.4z"/>',
    check: '<path d="m9 16.2-3.5-3.5L4 14.2l5 5 11-11-1.4-1.4z"/>',
    grid: '<path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/>',
    list: '<path d="M3 5h18v3H3V5zm0 5.5h18v3H3v-3zM3 16h18v3H3v-3z"/>',
    folder: '<path d="M3 5h7l2 2h9v13H3V5z"/>',
    star: '<path d="m12 2 3 6.5 7 .8-5.2 4.8 1.5 7L12 17.5 5.7 21l1.5-7L2 9.3l7-.8L12 2z"/>',
    clock: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5 3 .8-1.3-4.3-2.6V7z"/>',
    alert: '<path d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"/>',
    file: '<path d="M6 2h8l6 6v14H6V2zm7 1.5V9h5.5L13 3.5z"/>',
    print: '<path d="M6 3h12v5h2a2 2 0 0 1 2 2v7h-4v4H6v-4H2v-7a2 2 0 0 1 2-2h2V3zm2 2v3h8V5H8zm0 11v3h8v-3H8z"/>',
    excel: '<path d="M3 4h18v16H3V4zm2 2v12h14V6H5zm2 2h4v2H7V8zm6 0h4v2h-4V8zm-6 4h4v2H7v-2zm6 0h4v2h-4v-2z"/>',
    image: '<path d="M3 4h18v16H3V4zm2 2v9l4-4 3 3 4-5 5 6V6H5zm3 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>',
    info: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>',
    sun: '<path d="M12 5V2h-1v3h1zm0 17v-3h-1v3h1zM5 12H2v-1h3v1zm17 0h-3v-1h3v1zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/>',
    map: '<path d="m9 3 6 2 6-2v16l-6 2-6-2-6 2V5l6-2zm0 2.2L5 6.5v11.3l4-1.3V5.2zm2 0v11.3l4 1.3V6.5l-4-1.3z"/>',
  };
  function icon(name, cls) { return `<svg class="svg ${cls || ''}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`; }

  /* ---------- DOM ---------- */
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [...(root || document).querySelectorAll(sel)]; }

  /* ---------- پیام کوتاه ---------- */
  function toast(text, level) {
    const box = $('#toasts'); if (!box) return;
    const t = el(`<div class="toast glass-strong ${level || ''}">${esc(text)}</div>`);
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, level === 'err' ? 7000 : 4200);
  }

  /* ---------- نشان وضعیت ---------- */
  function badge(status) {
    const s = U.formatValue(status);
    const tone = S.siteMap ? S.siteMap.tone(status) : 'muted';
    return `<span class="badge ${tone}" title="${esc(s)}">${esc(s)}</span>`;
  }

  /* ---------- کشوی جزئیات ---------- */
  let backdrop = null;
  function openDrawer(html, onMount) {
    const d = $('#drawer');
    d.className = 'drawer glass-strong';
    d.hidden = false;
    d.innerHTML = html;
    if (!backdrop) { backdrop = el('<div class="backdrop"></div>'); backdrop.addEventListener('click', closeDrawer); }
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => d.classList.add('open'));
    const x = d.querySelector('[data-x]'); if (x) x.addEventListener('click', closeDrawer);
    if (onMount) onMount(d);
    return d;
  }
  function closeDrawer() {
    const d = $('#drawer'); if (!d) return;
    d.classList.remove('open');
    if (backdrop && backdrop.parentNode) backdrop.remove();
    setTimeout(() => { if (!d.classList.contains('open')) { d.hidden = true; d.innerHTML = ''; } }, 300);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeMenu(); } });

  /* ---------- منوی شناور ---------- */
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function openMenu(anchor, items) {
    closeMenu();
    const m = el(`<div class="menu glass-strong">${items.map((it) => it.header ? `<div class="h">${esc(it.header)}</div>` : `<button data-i="${it.id}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`).join('')}</div>`);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
    m.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const it = items.find((x) => x.id === b.dataset.i); closeMenu(); if (it && it.onClick) it.onClick(); });
    setTimeout(() => document.addEventListener('click', function once(ev) { if (!m.contains(ev.target)) { closeMenu(); document.removeEventListener('click', once); } }), 0);
    menuEl = m;
  }

  /* ---------- تم (همهٔ تم‌های میزبان، بی وابستگی به کد میزبان) ---------- */
  const FALLBACK = [
    { id: 'fluent', name: 'فلوئنت شیشه‌ای', base: '#EEF1FB', b: ['#C9D8FF', '#E3D4FF', '#CDEBFF', '#F3DDF5'], ac: '#0F6CBD', ac2: '#6B5BD6' },
    { id: 'micad', name: 'میکای تیره', base: '#141A2A', b: ['#1F2A44', '#2A2340', '#1B2A3E', '#2E2238'], ac: '#4C8DFF', ac2: '#8B7BFF', dark: true },
  ];
  function themes() { try { if (typeof THEMES !== 'undefined' && Array.isArray(THEMES) && THEMES.length) return THEMES; } catch (e) { /* ادامه */ } return FALLBACK; }
  function hexRgb(x) { x = String(x).replace('#', ''); if (x.length === 3) x = x.split('').map((c) => c + c).join(''); const v = parseInt(x, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function applyTheme(id, fontPx) {
    const list = themes();
    let t = list.find((x) => x.id === id || x.name === id);
    if (id === 'auto' || !t) t = (id === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches) ? (list.find((x) => x.id === 'micad') || list.find((x) => x.dark) || list[0]) : (t || list[0]);
    const r = document.documentElement.style, d = !!t.dark;
    const [ar, ag, ab] = hexRgb(t.ac), [br, bg, bb] = hexRgb(t.ac2);
    const set = (k, v) => r.setProperty(k, v);
    set('--base', t.base); (t.b || []).forEach((c, i) => set('--b' + (i + 1), c));
    set('--ac', t.ac); set('--ac2', t.ac2); set('--ac-rgb', `${ar},${ag},${ab}`); set('--ac2-rgb', `${br},${bg},${bb}`);
    set('--tx', d ? '#E9ECF5' : '#1A1F2E'); set('--tx2', d ? '#B5BCCF' : '#454C63'); set('--tx3', d ? '#8189A0' : '#737A92');
    set('--glass', d ? 'rgba(30,34,48,.52)' : 'rgba(255,255,255,.56)'); set('--glass-2', d ? 'rgba(38,43,60,.66)' : 'rgba(255,255,255,.74)'); set('--glass-3', d ? 'rgba(46,52,72,.82)' : 'rgba(255,255,255,.9)');
    set('--edge', d ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.75)'); set('--line', d ? 'rgba(255,255,255,.08)' : 'rgba(20,30,70,.08)'); set('--line-2', d ? 'rgba(255,255,255,.14)' : 'rgba(20,30,70,.14)');
    set('--shadow', d ? '0 10px 40px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.25)' : '0 10px 40px rgba(40,56,140,.10), 0 2px 8px rgba(40,56,140,.06)');
    set('--hover', d ? 'rgba(255,255,255,.06)' : 'rgba(20,40,120,.05)');
    if (fontPx) set('--fs', fontPx + 'px');
    document.documentElement.classList.toggle('dark', d);
    document.documentElement.classList.toggle('hc', !!t.hc);
    const logo = $('#rail .logo-mark'); if (logo) logo.src = 'نشان.png';
    return t;
  }

  /* ---------- قالب‌های کوچک ---------- */
  function kvRows(flat, labelFn, opts) {
    opts = opts || {};
    const rows = Object.entries(flat).filter(([k, v]) => !k.endsWith('[]') && (opts.all || !(opts.hide || []).includes(k)));
    return `<table class="kvt"><tbody>${rows.map(([k, v]) => `<tr><td>${esc(labelFn(k))}${opts.raw ? `<span class="raw">${esc(k)}</span>` : ''}</td><td class="${U.looksLikeDate(v) || /^\d+$/.test(String(v ?? '')) ? 'num' : ''}">${esc(U.formatValue(v))}</td></tr>`).join('')}</tbody></table>`;
  }

  function timelineHtml(analysis, mini) {
    if (!analysis || !analysis.steps.length) return '<div class="muted">روندی ثبت نشده است.</div>';
    const steps = mini ? analysis.steps.slice(-4) : analysis.steps;
    return `<ul class="tl ${mini ? 'mini' : ''}">${steps.map((s) => `<li><div class="st">${esc(s.status)}</div>${s.prev && s.prev !== '—' ? `<div class="prev">از: ${esc(s.prev)}</div>` : ''}<div class="d"><span class="num">${esc(s.dateText)}</span>${s.durationMs !== null ? `<span class="dur">${s.open ? 'در این مرحله از' : 'ماندگاری'}: ${U.formatDuration(s.durationMs)}</span>` : ''}${s.user ? `<span>${esc(s.user)}</span>` : ''}</div>${s.note ? `<div class="muted">${esc(s.note)}</div>` : ''}</li>`).join('')}</ul>`;
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  /* DNSهای پرکاربرد برای دسترسی به سایت‌های داخلی وقتی سامانه بلاک می‌کند (فقط حل نام؛ هیچ محافظی دور زده نمی‌شود) */
  const DNS_PRESETS = [
    { name: 'DNS سیستم (پیش‌فرض)', ips: '' },
    { name: 'شکن', ips: '178.22.122.100, 185.51.200.2' },
    { name: '۴۰۳.online', ips: '10.202.10.202, 10.202.10.102' },
    { name: 'الکترو', ips: '78.157.42.100, 78.157.42.101' },
    { name: 'بگذر', ips: '185.55.226.26, 185.55.225.25' },
    { name: 'رادار گیم', ips: '10.202.10.10, 10.202.10.11' },
    { name: 'گوگل', ips: '8.8.8.8, 8.8.4.4' },
    { name: 'کلادفلر', ips: '1.1.1.1, 1.0.0.1' },
  ];

  S.ui = Object.assign(S.ui || {}, { icon, ICONS, el, $, $$, toast, badge, openDrawer, closeDrawer, openMenu, closeMenu, themes, applyTheme, kvRows, timelineHtml, debounce, esc, n, DNS_PRESETS });
})(window.SabtMan = window.SabtMan || {});
