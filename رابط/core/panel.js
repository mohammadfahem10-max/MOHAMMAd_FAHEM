/* پنل تم‌طلوع: نوار بالا (شمارشگرها + فیلتر + دکمه‌های کلی)، جدول همهٔ رکوردها با همهٔ فیلدها، دکمه‌های تکی، پیش‌نمایش، تنظیمات. */
(function (S) {
  'use strict';
  const U = S.util;
  const st = () => S.store;
  const ex = () => S.exporter;
  const esc = U.escapeHtml;
  const n = U.faDigits;

  const ui = { root: null, current: null, filter: '', chip: null, modal: null, renderTimer: null, tab: 'fields' };

  const MODES = [['pdf+text', 'PDF + متن'], ['pdf', 'فقط PDF'], ['text', 'فقط متن']];

  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function mount(opts) {
    if (ui.root) return;
    opts = opts || {};
    ui.embedded = Boolean(opts.embedded);
    const root = document.createElement('div');
    root.id = 'sabtman-root';
    if (ui.embedded) root.classList.add('sm-embedded', 'sm-open');
    root.innerHTML = `
      <button class="sm-launch" type="button"><span>ثبت من</span><span class="sm-badge">۰</span></button>
      <div class="sm-drawer">
        <div class="sm-head">
          <span class="sm-dot" data-role="dot"></span>
          <div><div class="sm-title">ثبت من — استخراج و گزارش</div><div class="sm-sub" data-role="sub">داده‌ها روی همین رایانه می‌ماند</div></div>
          <div class="sm-grow"></div>
          <button class="sm-btn" data-act="map">نقشهٔ کشف‌شده</button>
          <button class="sm-btn" data-act="settings">تنظیمات</button>
          <button class="sm-btn" data-act="help">راهنما</button>
          <button class="sm-btn ghost" data-act="close">✕</button>
        </div>
        <div class="sm-body">
          <div class="sm-rail" data-role="rail"></div>
          <div class="sm-main" data-role="main"></div>
        </div>
        <div class="sm-foot"><span data-role="queue"></span><span class="sm-log" data-role="log"></span><span data-role="shell" class="sm-muted"></span></div>
      </div>`;
    (opts.container || document.documentElement).appendChild(root);
    ui.root = root;
    if (ui.embedded) { root.querySelector('.sm-launch').remove(); root.querySelector('[data-act=close]').remove(); }
    if (!ui.embedded) root.querySelector('.sm-launch').addEventListener('click', toggle);
    root.querySelector('.sm-head').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'close') toggle(false);
      if (act === 'settings') openSettings();
      if (act === 'map') downloadMap();
      if (act === 'help') openHelp();
    });
    root.querySelector('[data-role=rail]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-path]');
      if (b) { ui.current = b.dataset.path; ui.chip = null; render(); }
    });
    st().subscribe((what) => { if (what === 'log') renderLog(); else scheduleRender(); });
    ex().onQueue(renderQueue);
    S.hook.on('session', scheduleRender);
    if (S.bridge && S.bridge.available()) {
      S.bridge.onMessage((msg) => {
        if (msg.type === 'toggle') toggle();
        else if (msg.type === 'open') toggle(true);
        else if (msg.type === 'settings') { toggle(true); openSettings(); }
        else if (msg.type === 'dest') { toast('پوشهٔ مقصد: ' + msg.path); if (ui.modal && ui.modal.querySelector('[data-role=dest]')) ui.modal.querySelector('[data-role=dest]').textContent = msg.path; renderShell(); }
        else if (msg.type === 'log') st().addLog(msg.level || 'info', msg.text || '');
        else if (msg.type === 'state') renderShell();
      });
      S.bridge.requestState();
    }
    if (!ui.embedded && st().state.settings.panelOpen) toggle(true);
    scheduleRender();
  }

  function toggle(force) {
    if (ui.embedded) return;
    const open = typeof force === 'boolean' ? force : !ui.root.classList.contains('sm-open');
    ui.root.classList.toggle('sm-open', open);
    st().state.settings.panelOpen = open;
    try { localStorage.setItem('sabtman.settings.v1', JSON.stringify(st().state.settings)); } catch (e) { /* ادامه */ }
    if (open) render();
  }

  function scheduleRender() {
    clearTimeout(ui.renderTimer);
    ui.renderTimer = setTimeout(render, 120);
  }

  /* ---------- رندر ---------- */

  function render() {
    if (!ui.root) return;
    const sections = st().sectionList();
    const badge = ui.root.querySelector('.sm-badge');
    if (badge) badge.textContent = n(sections.reduce((a, s) => a + s.records.length, 0));
    const dot = ui.root.querySelector('[data-role=dot]');
    dot.className = 'sm-dot' + (S.hook.sessionExpired ? ' err' : '');
    dot.title = S.hook.sessionExpired ? 'نشست پایان یافته' : 'قلاب فعال است';
    if (!ui.current && sections.length) ui.current = sections[sections.length - 1].path;
    renderRail(sections);
    renderMain();
    renderQueue(ex().queue);
    renderLog();
    renderShell();
  }

  function renderRail(sections) {
    const rail = ui.root.querySelector('[data-role=rail]');
    const groups = new Map();
    for (const s of sections) {
      const g = st().MODULE_LABELS[s.module] || 'سایر';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }
    let html = '';
    for (const [g, list] of groups) {
      html += `<h4>${esc(g)}</h4>`;
      for (const s of list) {
        html += `<button class="sm-nav ${s.path === ui.current ? 'on' : ''}" data-path="${esc(s.path)}"><span class="n">${esc(st().labelFor(s.path))}<span class="p">${esc(s.method + ' ' + s.path)}</span></span><span class="c">${n(s.records.length)}</span></button>`;
      }
    }
    rail.innerHTML = html || '<div class="sm-empty sm-muted">هنوز بخشی کشف نشده است.</div>';
  }

  function statusClass(v) {
    const s = String(v);
    if (/(تایید|تأیید|موفق|رویت|پایان|خاتمه|انجام|ثبت شد|فعال)/.test(s)) return 'ok';
    if (/(رد|ابطال|لغو|خطا|ناموفق|منقضی|باطل)/.test(s)) return 'err';
    if (/(انتظار|بررسی|معلق|پیش نویس|پيش نويس|ارسال|جاری|شروع)/.test(s)) return 'warn';
    return 'info';
  }

  function visibleRecords(section) {
    let list = section.records;
    if (ui.chip) list = list.filter((r) => U.formatValue(r.flat[ui.chip.key]) === ui.chip.label);
    if (ui.filter) {
      const q = U.enDigits(ui.filter).toLowerCase();
      list = list.filter((r) => Object.values(r.flat).some((v) => U.enDigits(U.formatValue(v)).toLowerCase().includes(q)));
    }
    return list;
  }

  function renderMain() {
    const main = ui.root.querySelector('[data-role=main]');
    const section = st().state.sections.get(ui.current);
    if (!section) {
      main.innerHTML = `<div class="sm-empty"><h3>آمادهٔ کشف خودکار</h3><p>در همین زبانه، در سایت به بخش‌ها سر بزنید (املاک من، اسناد رسمی من، وضعیت مکاتبات، شناسه‌های ثبت موقت، وقایع ازدواج و طلاق، شرکت‌ها، پروفایل). هر داده‌ای که سایت بخواند، خودکار اینجا با همهٔ فیلدها نمایش داده می‌شود.</p>
        <ol><li>روی یک ردیف در سایت «گزارشات» یا «پیوست‌ها» را باز کنید تا الگوی آن یاد گرفته شود؛ سپس «گرفتن روند همه» فعال می‌شود.</li><li>سرویس محلی «ثبت من» را اجرا کنید تا بسته‌های دانلود در پوشهٔ مقصد مرتب شوند.</li></ol></div>`;
      return;
    }
    const list = visibleRecords(section);
    const links = { روند: st().linksFor(section.path, 'روند').length, پیوست‌ها: st().linksFor(section.path, 'پیوست‌ها').length };
    const selectedCount = [...section.selected].filter((k) => section.records.some((r) => r.key === k)).length;
    const mode = st().state.settings.mode;
    let html = '';
    if (S.hook.sessionExpired) html += `<div class="sm-banner err"><b>نشست پایان یافته است.</b> در همین زبانه دوباره وارد سایت شوید؛ کارهای در صف از همان‌جا ادامه می‌یابد. <button class="sm-btn sm" data-act="resume">ادامه</button></div>`;
    html += `<div class="sm-top"><div class="sm-card">
      <div class="sm-counters"><span class="sm-chip total ${!ui.chip ? 'on' : ''}" data-chip="">همه <b>${n(section.records.length)}</b></span>`;
    for (const c of section.counters || []) {
      html += `<span class="k">${esc(c.key)}:</span>`;
      for (const v of c.values.slice(0, 12)) html += `<span class="sm-chip ${ui.chip && ui.chip.key === c.key && ui.chip.label === v.label ? 'on' : ''}" data-chip="${esc(c.key)}" data-val="${esc(v.label)}">${esc(v.label)} <b>${n(v.count)}</b></span>`;
    }
    if (section.timelines.size) html += `<span class="k">روند گرفته‌شده:</span><span class="sm-chip"><b>${n(section.timelines.size)}</b></span>`;
    if (section.attachments.size) html += `<span class="k">پیوست‌ها:</span><span class="sm-chip"><b>${n(section.attachments.size)}</b></span>`;
    html += `</div>
      <div class="sm-tools">
        <input type="search" placeholder="جست‌وجو در همهٔ فیلدها…" value="${esc(ui.filter)}" data-role="filter">
        <select class="sm-sel" data-role="mode" title="حالت خروجی">${MODES.map(([v, l]) => `<option value="${v}" ${v === mode ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="sm-btn pri" data-act="dl-all" title="دانلود کل بخش (${n(list.length)} رکورد)">دانلود کلی (${n(list.length)})</button>
        <button class="sm-btn" data-act="dl-sel" ${selectedCount ? '' : 'disabled'}>دانلود گروهی (${n(selectedCount)})</button>
        <button class="sm-btn" data-act="tl-all" ${links.روند ? '' : 'disabled'} title="${links.روند ? 'گرفتن «گزارشات» همهٔ رکوردها' : 'ابتدا یک بار در سایت «گزارشات» یک ردیف را باز کنید'}">گرفتن روند همه</button>
        <button class="sm-btn" data-act="att-all" ${links.پیوست‌ها ? '' : 'disabled'} title="${links.پیوست‌ها ? 'گرفتن فهرست پیوست‌های همهٔ رکوردها' : 'ابتدا یک بار در سایت «پیوست‌ها» یک ردیف را باز کنید'}">گرفتن پیوست‌های همه</button>
        <button class="sm-btn" data-act="report">گزارش‌ها</button>
        <button class="sm-btn" data-act="excel">Excel</button>
        <button class="sm-btn" data-act="json">JSON</button>
      </div></div></div>`;
    html += `<div class="sm-table-wrap">` + renderTable(section, list) + `</div>`;
    main.innerHTML = html;
    bindMain(main, section);
  }

  function renderTable(section, list) {
    const cols = (section.columns || []).filter((c) => !c.endsWith('[]'));
    const allSel = list.length && list.every((r) => section.selected.has(r.key));
    let html = `<table class="sm-table"><thead><tr><th><input type="checkbox" data-role="selall" ${allSel ? 'checked' : ''}></th><th>#</th><th>روند</th>`;
    for (const c of cols) html += `<th title="${esc(c)}">${esc(c)}</th>`;
    html += `<th>عملیات</th></tr></thead><tbody>`;
    if (!list.length) html += `<tr><td colspan="${cols.length + 4}" class="sm-muted" style="text-align:center;padding:24px">رکوردی مطابق فیلتر نیست.</td></tr>`;
    list.forEach((r, i) => {
      const sel = section.selected.has(r.key);
      html += `<tr class="${sel ? 'sel' : ''}" data-key="${esc(r.key)}"><td><input type="checkbox" data-role="sel" ${sel ? 'checked' : ''}></td><td>${n(i + 1)}</td><td><span class="sm-tl ${section.timelines.has(r.key) ? 'has' : ''}" title="${section.timelines.has(r.key) ? 'روند گرفته شده' : 'روند گرفته نشده'}"></span></td>`;
      for (const c of cols) {
        const v = r.flat[c];
        const text = U.formatValue(v);
        if (/(status|state|وضعیت)/i.test(c) && text !== '—') html += `<td title="${esc(text)}"><span class="sm-status ${statusClass(text)}">${esc(text)}</span></td>`;
        else html += `<td title="${esc(text)}">${esc(text)}</td>`;
      }
      html += `<td class="acts">
        <button class="sm-btn sm" data-act="view">مشاهده</button>
        <button class="sm-btn sm" data-act="tl">روند</button>
        <button class="sm-btn sm" data-act="att">پیوست‌ها</button>
        <button class="sm-btn sm" data-act="dl" data-mode="pdf">PDF</button>
        <button class="sm-btn sm" data-act="dl" data-mode="pdf+text">PDF+متن</button>
        <button class="sm-btn sm" data-act="dl" data-mode="text">متن</button>
      </td></tr>`;
    });
    return html + '</tbody></table>';
  }

  function bindMain(main, section) {
    const filter = main.querySelector('[data-role=filter]');
    filter.addEventListener('input', () => { ui.filter = filter.value; const wrap = main.querySelector('.sm-table-wrap'); wrap.innerHTML = renderTable(section, visibleRecords(section)); });
    main.querySelector('[data-role=mode]').addEventListener('change', (e) => st().setSetting('mode', e.target.value));
    main.onclick = async (e) => {
      const chip = e.target.closest('[data-chip]');
      if (chip) { ui.chip = chip.dataset.chip ? { key: chip.dataset.chip, label: chip.dataset.val } : null; render(); return; }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const tr = btn.closest('tr[data-key]');
      const rec = tr ? section.records.find((r) => r.key === tr.dataset.key) : null;
      try {
        if (act === 'resume') ex().resumeQueue();
        else if (act === 'dl-all') await downloadRecords(section, visibleRecords(section), st().state.settings.mode);
        else if (act === 'dl-sel') await downloadRecords(section, section.records.filter((r) => section.selected.has(r.key)), st().state.settings.mode);
        else if (act === 'tl-all') { const k = ex().enqueueChildren(section, visibleRecords(section), 'روند'); toast(k ? `${n(k)} رکورد به صف گرفتن روند افزوده شد` : 'روند همهٔ رکوردها از قبل گرفته شده است'); }
        else if (act === 'att-all') { const k = ex().enqueueChildren(section, visibleRecords(section), 'پیوست‌ها'); toast(k ? `${n(k)} رکورد به صف گرفتن پیوست‌ها افزوده شد` : 'پیوست‌های همه از قبل گرفته شده است'); }
        else if (act === 'report') openReport(section);
        else if (act === 'excel') downloadExcel(section);
        else if (act === 'json') ex().downloadText(U.safeFileName(`${st().labelFor(section.path)}.json`), JSON.stringify(section.records.map((r) => r.raw), null, 2), 'application/json');
        else if (rec && act === 'view') openRecord(section, rec, 'fields');
        else if (rec && act === 'tl') { ensureChild(section, rec, 'روند'); openRecord(section, rec, 'timeline'); }
        else if (rec && act === 'att') { ensureChild(section, rec, 'پیوست‌ها'); openRecord(section, rec, 'attachments'); }
        else if (rec && act === 'dl') await downloadRecords(section, [rec], btn.dataset.mode);
      } catch (err) { st().addLog('err', err.message); }
    };
    main.onchange = (e) => {
      const cb = e.target;
      if (cb.dataset.role === 'selall') { visibleRecords(section).forEach((r) => (cb.checked ? section.selected.add(r.key) : section.selected.delete(r.key))); render(); }
      else if (cb.dataset.role === 'sel') { const tr = cb.closest('tr'); cb.checked ? section.selected.add(tr.dataset.key) : section.selected.delete(tr.dataset.key); tr.classList.toggle('sel', cb.checked); const b = main.querySelector('[data-act=dl-sel]'); b.disabled = !section.selected.size; b.textContent = `دانلود گروهی (${n(section.selected.size)})`; }
    };
  }

  function ensureChild(section, rec, kind) {
    const bucket = kind === 'روند' ? section.timelines : section.attachments;
    if (bucket.has(rec.key)) return;
    const k = ex().enqueueChildren(section, [rec], kind);
    if (!k) toast(`الگوی «${kind}» هنوز یاد گرفته نشده است؛ یک بار در سایت روی «${kind === 'روند' ? 'گزارشات' : 'پیوست‌ها'}» همین ردیف بزنید.`);
  }

  async function downloadRecords(section, records, mode) {
    if (!records.length) return toast('رکوردی برای دانلود نیست.');
    const tlLinks = st().linksFor(section.path, 'روند');
    const missing = records.filter((r) => !section.timelines.has(r.key));
    if (tlLinks.length && missing.length) {
      ex().enqueueChildren(section, missing, 'روند');
      toast(`ابتدا روند ${n(missing.length)} رکورد گرفته می‌شود؛ بسته پس از پایان صف ساخته می‌شود…`);
      await waitQueue();
    }
    toast(`در حال ساخت بستهٔ ${n(records.length)} رکورد (${MODES.find((m) => m[0] === mode)[1]})…`);
    const { entries, manifest } = await ex().buildJob(section, records, mode, { onProgress: (p) => renderQueue(ex().queue, `آماده‌سازی ${n(p.index)}/${n(p.total)}`) });
    ex().sendJob(entries, manifest);
    toast('بسته به کانال دانلود فرستاده شد؛ سرویس محلی آن را در پوشهٔ مقصد مرتب می‌کند.');
  }

  function waitQueue() {
    return new Promise((resolve) => {
      const check = () => { const q = ex().queue; if (!q.items.length && !q.running) resolve(); else setTimeout(check, 500); };
      check();
    });
  }

  function downloadExcel(section) {
    const cols = section.columns.filter((c) => !c.endsWith('[]'));
    const rows = [['#', ...cols], ...section.records.map((r, i) => [n(i + 1), ...cols.map((c) => U.formatValue(r.flat[c]))])];
    const csv = '﻿' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    ex().downloadText(U.safeFileName(`${st().labelFor(section.path)}.csv`), csv, 'text/csv;charset=utf-8');
    toast('فایل CSV (بازشدنی در Excel) دانلود شد؛ «فهرست.xlsx» کامل را سرویس محلی داخل هر پوشه می‌سازد.');
  }

  function downloadMap() {
    ex().downloadText(U.safeFileName(`نقشهٔ کشف‌شده ${U.formatSystemDate().replace(/[:\/]/g, '-')}.json`), JSON.stringify(S.hook.exportDiscovery(), null, 2), 'application/json');
    toast('نقشهٔ کشف‌شده (فقط مسیرها و نام فیلدها، بدون داده) دانلود شد.');
  }

  /* ---------- مودال‌ها ---------- */

  function openModal(title, bodyHtml, footHtml) {
    closeModal();
    const m = h(`<div class="sm-modal-bg"><div class="sm-modal"><div class="mh"><h3>${esc(title)}</h3><button class="sm-btn ghost" data-act="x">✕</button></div><div class="mb">${bodyHtml}</div><div class="mf">${footHtml || ''}</div></div></div>`);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-act=x]')) closeModal(); });
    ui.root.appendChild(m);
    ui.modal = m;
    return m;
  }
  function closeModal() { if (ui.modal) { ui.modal.remove(); ui.modal = null; } }

  function kv(flat) {
    let html = '<table class="sm-kv"><tbody>';
    for (const [k, v] of Object.entries(flat)) if (!k.endsWith('[]')) html += `<tr><td>${esc(k)}</td><td>${esc(U.formatValue(v))}</td></tr>`;
    html += '</tbody></table>';
    for (const [k, v] of Object.entries(flat)) if (k.endsWith('[]') && v.length) html += `<h4 class="sm-h">${esc(k.slice(0, -2))}</h4>` + rowsTable(v.map((r) => U.flatten(r)));
    return html;
  }
  function rowsTable(flats) {
    if (!flats.length) return '<p class="sm-muted">موردی نیست.</p>';
    const cols = []; const seen = new Set();
    for (const f of flats) for (const k of Object.keys(f)) if (!k.endsWith('[]') && !seen.has(k)) { seen.add(k); cols.push(k); }
    return `<table class="sm-kv"><thead><tr>${cols.map((c) => `<td><b>${esc(c)}</b></td>`).join('')}</tr></thead><tbody>${flats.map((f) => `<tr>${cols.map((c) => `<td>${esc(U.formatValue(f[c]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function openRecord(section, rec, tab) {
    ui.tab = tab || 'fields';
    const caseName = st().caseNameOf(section, rec);
    const draw = () => {
      const tl = section.timelines.get(rec.key);
      const att = section.attachments.get(rec.key);
      let body = `<div class="sm-tabs">
        <button class="sm-btn ${ui.tab === 'fields' ? 'on' : ''}" data-tab="fields">همهٔ فیلدها</button>
        <button class="sm-btn ${ui.tab === 'timeline' ? 'on' : ''}" data-tab="timeline">روند (${n(tl ? tl.rows.length : 0)})</button>
        <button class="sm-btn ${ui.tab === 'attachments' ? 'on' : ''}" data-tab="attachments">پیوست‌ها (${n(att ? att.rows.length : 0)})</button>
        <button class="sm-btn ${ui.tab === 'preview' ? 'on' : ''}" data-tab="preview">پیش‌نمایش PDF</button>
        <button class="sm-btn ${ui.tab === 'sheet' ? 'on' : ''}" data-tab="sheet">پیش‌نمایش کارنامهٔ روند</button></div>`;
      if (ui.tab === 'fields') body += kv(rec.flat);
      else if (ui.tab === 'timeline') body += tl ? S.reports.timelineHtml(S.reports.analyzeTimeline(tl.rows)).replace('class="timeline"', 'class="sm-timeline"') + '<h4 class="sm-h">جدول خام مراحل</h4>' + rowsTable(tl.rows.map((r) => U.flatten(r))) : queueHint(section, 'روند');
      else if (ui.tab === 'attachments') body += att ? rowsTable(att.rows.map((r) => U.flatten(r))) : queueHint(section, 'پیوست‌ها');
      else if (ui.tab === 'preview') body += `<iframe data-role="pv"></iframe>`;
      else if (ui.tab === 'sheet') body += `<iframe data-role="pv2"></iframe>`;
      const m = openModal(caseName, body, `<button class="sm-btn pri" data-dl="pdf+text">دانلود PDF + متن</button><button class="sm-btn" data-dl="pdf">فقط PDF</button><button class="sm-btn" data-dl="text">فقط متن</button><button class="sm-btn" data-copy="md">کپی متن (md)</button>`);
      const pv = m.querySelector('[data-role=pv]');
      if (pv) pv.srcdoc = S.reports.recordDetailHtml(section, rec, { fontCss: S.fontCss || '' });
      const pv2 = m.querySelector('[data-role=pv2]');
      if (pv2) pv2.srcdoc = S.reports.recordSheetHtml(section, rec, { fontCss: S.fontCss || '' });
      m.querySelector('.mb').addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]');
        if (t) { ui.tab = t.dataset.tab; draw(); }
        const f = e.target.closest('[data-fetch]');
        if (f) { ensureChild(section, rec, f.dataset.fetch); }
      });
      m.querySelector('.mf').addEventListener('click', async (e) => {
        const d = e.target.closest('[data-dl]');
        if (d) { try { await downloadRecords(section, [rec], d.dataset.dl); } catch (err) { st().addLog('err', err.message); } }
        const c = e.target.closest('[data-copy]');
        if (c) { try { await navigator.clipboard.writeText(ex().recordMarkdown(section, rec)); toast('متن md کپی شد.'); } catch (err) { toast('کپی ممکن نشد.'); } }
      });
    };
    draw();
    const unsub = (what, payload) => { if (what === 'child' && payload && payload.record === rec && ui.modal) draw(); };
    st().subscribe(unsub);
  }

  function queueHint(section, kind) {
    const has = st().linksFor(section.path, kind).length;
    return `<div class="sm-empty">${has ? `<p>در صف گرفتن ${kind}…</p><button class="sm-btn pri" data-fetch="${kind}">گرفتن اکنون</button>` : `<p>الگوی «${kind}» هنوز یاد گرفته نشده است.</p><p class="sm-muted">یک بار در سایت روی دکمهٔ «${kind === 'روند' ? 'گزارشات' : 'پیوست‌ها'}» یکی از ردیف‌ها بزنید؛ برنامه الگو را یاد می‌گیرد و برای همهٔ رکوردها به‌کار می‌برد.</p>`}</div>`;
  }

  function openReport(section) {
    const report = S.reports.build(section, { pendingDays: st().state.settings.pendingDays, recentDays: st().state.settings.recentDays });
    const m = openModal(`گزارش‌ها — ${st().labelFor(section.path)}`, `<iframe data-role="pv"></iframe>`, `<button class="sm-btn pri" data-act="dl">دانلود بستهٔ گزارش (PDF + md + Excel)</button><span class="sm-muted">رکوردهای دارای روند: ${n(report.withTimeline)} از ${n(report.total)}</span>`);
    m.querySelector('[data-role=pv]').srcdoc = S.reports.sectionReportHtml(report, { fontCss: S.fontCss || '' });
    m.querySelector('.mf [data-act=dl]').addEventListener('click', () => { const job = ex().buildReportJob(section); ex().sendJob(job.entries, job.manifest); toast('بستهٔ گزارش فرستاده شد.'); });
  }

  function openSettings() {
    const s = st().state.settings;
    const section = st().state.sections.get(ui.current);
    const shell = S.bridge && S.bridge.available() ? (S.bridge.last || {}) : null;
    let body = `<div class="sm-form">` + (shell ? `<div class="full"><h4 class="sm-h">پوشهٔ مقصد خروجی</h4><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><code data-role="dest" style="direction:ltr;flex:1;background:var(--b1);padding:4px 10px;border-radius:8px">${esc(shell.dest || '—')}</code><button class="sm-btn" data-act="browse">انتخاب پوشهٔ مقصد…</button><button class="sm-btn" data-act="opendest">باز کردن پوشهٔ مقصد</button></div>${shell.service ? `<div class="sm-muted">سرویس فایل: ${shell.service.running ? 'در حال اجرا' : 'اجرا نشده'}${shell.service.browser ? ' · چاپ PDF: ' + esc(shell.service.browser) : ' · مرورگر چاپ PDF پیدا نشد'}</div>` : ''}</div>` : '') + `
      <label>حالت پیش‌فرض خروجی<select data-k="mode">${MODES.map(([v, l]) => `<option value="${v}" ${s.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>فاصلهٔ بین درخواست‌ها (میلی‌ثانیه)<input type="number" data-k="delayMs" value="${s.delayMs}" min="100"></label>
      <label>آستانهٔ «معطل» (روز)<input type="number" data-k="pendingDays" value="${s.pendingDays}" min="1"></label>
      <label>آستانهٔ «تازه» (روز)<input type="number" data-k="recentDays" value="${s.recentDays}" min="1"></label>`;
    if (section) {
      const cols = section.columns.filter((c) => !c.endsWith('[]'));
      body += `<label class="full">نام این بخش<input data-sk="label" value="${esc(st().labelFor(section.path))}"></label>
        <label>فیلد نام پوشهٔ پرونده<select data-sk="nameField">${cols.map((c) => `<option ${c === section.nameField ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label>فیلدهای شمارشگر (با Ctrl چند مورد)<select multiple size="6" data-sk="counters">${cols.map((c) => `<option ${(s.counterFields[section.path] || section.autoCounterFields).includes(c) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
      const links = st().linksFor(section.path);
      if (links.length) {
        body += `<div class="full"><h4 class="sm-h">پیوندهای یادگرفته‌شدهٔ این بخش</h4><table class="sm-kv"><tbody>${links.map((l, i) => `<tr><td style="direction:ltr;text-align:right">${esc(l.method + ' ' + l.child)}<br><span class="sm-muted">شناسه از فیلد: ${esc(l.idField)}</span></td><td><select data-link="${i}"><option ${l.kind === 'روند' ? 'selected' : ''}>روند</option><option ${l.kind === 'پیوست‌ها' ? 'selected' : ''}>پیوست‌ها</option><option ${l.kind === 'جزئیات' ? 'selected' : ''}>جزئیات</option><option ${l.kind === 'فایل' ? 'selected' : ''}>فایل</option></select></td></tr>`).join('')}</tbody></table></div>`;
      }
    }
    body += '</div>';
    const m = openModal('تنظیمات', body, `<button class="sm-btn pri" data-act="save">ذخیره</button><button class="sm-btn" data-act="forget">فراموش‌کردن پیوندهای یادگرفته‌شده</button>`);
    m.querySelector('.sm-modal').addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a || a.dataset.act === 'x') return;
      if (a.dataset.act === 'browse') { S.bridge.browseDest(); return; }
      if (a.dataset.act === 'opendest') { S.bridge.openDest(); return; }
      if (a.dataset.act === 'forget') { st().state.links.length = 0; try { localStorage.removeItem('sabtman.links.v1'); } catch (err) { /* ادامه */ } toast('پیوندها فراموش شد.'); closeModal(); render(); return; }
      m.querySelectorAll('[data-k]').forEach((el) => st().setSetting(el.dataset.k, el.type === 'number' ? Number(el.value) : el.value));
      if (shell) S.bridge.setConfig({ mode: st().state.settings.mode });
      if (section) {
        st().setSectionLabel(section.path, m.querySelector('[data-sk=label]').value.trim() || st().labelFor(section.path));
        st().setCaseNameField(section.path, m.querySelector('[data-sk=nameField]').value);
        st().setCounterFields(section.path, [...m.querySelector('[data-sk=counters]').selectedOptions].map((o) => o.value));
        const links = st().linksFor(section.path);
        m.querySelectorAll('[data-link]').forEach((sel) => { const l = links[Number(sel.dataset.link)]; if (l && l.kind !== sel.value) st().setLinkKind(l.parent, l.child, sel.value); });
      }
      closeModal(); render(); toast('ذخیره شد.');
    });
  }

  function openHelp() {
    openModal('راهنما', `<ol>
      <li><b>کشف خودکار:</b> در همین پنجره در سایت بگردید. هر بخشی که سایت بخواند در فهرست سمت راست ظاهر می‌شود؛ همهٔ فیلدها نمایش داده می‌شود.</li>
      <li><b>یادگیری روند/پیوست‌ها:</b> یک بار در سایت روی «گزارشات» یا «پیوست‌ها» یک ردیف بزنید؛ برنامه الگو را یاد می‌گیرد و دکمهٔ «گرفتن روند همه» فعال می‌شود.</li>
      <li><b>دانلود:</b> تکی (دکمه‌های هر ردیف)، گروهی (تیک‌زدن ردیف‌ها) یا کلی. فایل‌ها مستقیم در پوشهٔ مقصدِ انتخابی شما (تنظیمات ← «انتخاب پوشهٔ مقصد») با زیرپوشه‌های «۱ اسناد، ۲ پیوست‌ها، ۳ روند و رخدادها، ۴ گزارش‌ها» و «فهرست.xlsx» مرتب می‌کند و PDFها را می‌سازد.</li>
      <li><b>سه حالت:</b> PDF + متن، فقط PDF، فقط متن (txt و md).</li>
      <li><b>نشست:</b> اگر نشست پایان یافت، دوباره وارد شوید؛ صف از همان‌جا ادامه می‌یابد.</li>
      <li><b>نقشهٔ کشف‌شده:</b> فقط مسیرها و نام فیلدها (بدون داده) — برای دقیق‌ترکردن نگاشت.</li></ol>`);
  }

  /* ---------- نوار پایین ---------- */

  function renderQueue(q, extra) {
    if (!ui.root) return;
    const el = ui.root.querySelector('[data-role=queue]');
    if (extra) { el.innerHTML = `<span class="sm-status info">${esc(extra)}</span>`; return; }
    if (!q.items.length && !q.running) { el.innerHTML = q.done ? `<span class="sm-status ok">صف: ${n(q.done)} انجام‌شده${q.failed ? `، ${n(q.failed)} ناموفق` : ''}</span>` : ''; return; }
    const total = q.done + q.failed + q.items.length;
    const pct = total ? Math.round(((q.done + q.failed) / total) * 100) : 0;
    el.innerHTML = `<span class="sm-status ${q.paused ? 'warn' : 'info'}">${q.paused ? 'صف متوقف (نشست)' : 'در حال گرفتن'} ${n(q.done + q.failed)}/${n(total)}</span> <span class="sm-prog" style="display:inline-block;vertical-align:middle"><i style="width:${pct}%"></i></span> ${q.paused ? '<button class="sm-btn sm" data-q="resume">ادامه</button>' : '<button class="sm-btn sm" data-q="pause">توقف</button>'} <button class="sm-btn sm" data-q="clear">پاک‌کردن</button>`;
    el.onclick = (e) => { const b = e.target.closest('[data-q]'); if (!b) return; if (b.dataset.q === 'resume') ex().resumeQueue(); if (b.dataset.q === 'pause') ex().pauseQueue(); if (b.dataset.q === 'clear') ex().clearQueue(); };
  }

  function renderLog() {
    if (!ui.root) return;
    const el = ui.root.querySelector('[data-role=log]');
    const last = st().state.log[0];
    el.innerHTML = last ? `<span class="lv-${last.level}">${esc(U.formatSystemDate(last.ts).split('-')[1])} — ${esc(last.text)}</span>` : '';
    el.title = st().state.log.slice(0, 20).map((l) => l.text).join('\n');
  }

  function renderShell() {
    if (!ui.root || !S.bridge || !S.bridge.available()) return;
    const el = ui.root.querySelector('[data-role=shell]');
    const sh = S.bridge.last;
    if (!sh) { el.textContent = ''; return; }
    const svc = sh.service || {};
    el.innerHTML = `<span class="sm-status ${svc.running ? 'ok' : 'err'}">سرویس فایل ${svc.running ? 'فعال' : 'غیرفعال'}</span> <span title="${esc(sh.dest || '')}">مقصد: ${esc((sh.dest || '—').split(/[\\/]/).slice(-2).join('/'))}</span>${svc.busy ? ' · در حال پردازش' : ''}${svc.lastText ? ' · ' + esc(svc.lastText) : ''}`;
  }

  let toastTimer = null;
  function toast(text) {
    if (!ui.root) return;
    let t = ui.root.querySelector('.sm-toast');
    if (!t) { t = h('<div class="sm-toast"></div>'); ui.root.appendChild(t); }
    t.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 5000);
    st().addLog('info', text);
  }

  function show(path) { ui.current = path; ui.chip = null; ui.filter = ''; render(); }
  S.panel = { mount, toggle, render, toast, openRecord, openReport, openSettings, show, get current() { return ui.current; } };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
