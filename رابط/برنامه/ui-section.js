/* صفحهٔ بخش: شمارشگرها، جست‌وجو و فیلتر، جدول/کارت، انتخاب گروهی، کلیدهای هر رکورد، کشوی جزئیات (مشخصات، روند، گزارش‌ها/پیوست‌ها، خروجی)، دانلود. */
(function (S) {
  'use strict';
  const U = S.util;
  const UI = S.ui;
  const { esc, n, icon, el, toast } = UI;
  const st = () => S.store;
  const views = new Map();       // path → وضعیت نما
  let current = null;

  function viewState(path) {
    if (!views.has(path)) views.set(path, { path, q: '', type: new Set(), status: new Set(), from: '', to: '', recent: false, sort: null, dir: 1, page: 1, per: 50, mode: 'table', allCols: false, expanded: new Set() });
    return views.get(path);
  }
  function known(section) { return S.siteMap.sectionFor(section.path); }
  function L(section) { return (k) => st().fieldLabel(section, k); }
  function columnsOf(section, all) {
    const k = known(section);
    const hidden = new Set((k && k.hideFields) || []);
    const cols = (section.columns || []).filter((c) => !c.endsWith('[]') && (all || !hidden.has(c)));
    if (!all && k && k.primary) { const p = k.primary.filter((c) => cols.includes(c)); if (p.length) return p; }
    return all ? cols : cols.slice(0, 9);
  }
  function statusOf(section, rec) { const k = known(section); const key = (k && k.status) || (section.columns || []).find((c) => /(status|state|وضعیت)/i.test(c)); return key ? rec.flat[key] : null; }

  function filtered(section, v) {
    const s = st().state.settings;
    let recs = S.reports.filterRecords(section, section.records, { q: v.q, type: [...v.type], status: [...v.status], from: v.from, to: v.to });
    if (v.recent) { const lim = Date.now() - (Number(s.recentDays) || 7) * 86400000; const k = known(section); const dk = (k && k.date) || section.dateField; recs = recs.filter((r) => { const ts = dk ? U.parseSystemDate(r.flat[dk]) : null; return (ts !== null && ts >= lim) || (r.firstTs && r.firstTs >= lim); }); }
    if (v.sort) { const key = v.sort; recs = [...recs].sort((a, b) => { const x = a.flat[key], y = b.flat[key]; const dx = U.parseSystemDate(x), dy = U.parseSystemDate(y); if (dx !== null && dy !== null) return (dx - dy) * v.dir; const nx = Number(U.enDigits(String(x ?? ''))), ny = Number(U.enDigits(String(y ?? ''))); if (!Number.isNaN(nx) && !Number.isNaN(ny) && String(x ?? '').trim() !== '' && String(y ?? '').trim() !== '') return (nx - ny) * v.dir; return String(x ?? '').localeCompare(String(y ?? ''), 'fa') * v.dir; }); }
    return recs;
  }

  /* ---------- صفحهٔ بخش ---------- */
  function render(box, path) {
    const section = st().state.sections.get(path);
    if (!section) { box.innerHTML = `<div class="page"><div class="card"><div class="empty">${icon('info')}این بخش هنوز گردآوری نشده است.<div style="margin-top:10px"><button class="btn pri" data-act="collect">${icon('refresh')}گردآوری این بخش</button></div></div></div></div>`; box.querySelector('[data-act=collect]').addEventListener('click', () => { const k = S.siteMap.sectionFor(path); S.app.collectAll(k ? [k.virtual ? 'executive-cases' : k.id] : undefined); }); return; }
    current = { section, v: viewState(path), box };
    draw();
  }
  function refresh() {
    if (!current || !current.box.isConnected) return;
    const a = document.activeElement;
    if (a && current.box.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) return;   // کاربر در حال نوشتن است
    current.section = st().state.sections.get(current.section.path) || current.section;
    draw();
  }

  /* فایل‌های رسمی مدارکی که کاربر دانلودشان را خواسته: با رسیدن فهرست گزارش‌های هر مدرک، فایلش در صف می‌رود */
  const wantFiles = new Set();
  let watching = false;
  function watchFiles() {
    if (watching) return; watching = true;
    st().subscribe((what, payload) => {
      if (what !== 'child' || !payload || payload.kind !== 'گزارش‌ها' || !wantFiles.has(payload.record.key)) return;
      wantFiles.delete(payload.record.key);
      S.exporter.enqueueTyped(payload.section, [payload.record], 'فایل');
    });
  }

  function draw() {
    const { section, v, box } = current;
    const k = known(section);
    const s = st().state.settings;
    const recs = filtered(section, v);
    const pages = Math.max(1, Math.ceil(recs.length / v.per));
    if (v.page > pages) v.page = pages;
    const pageRecs = recs.slice((v.page - 1) * v.per, v.page * v.per);
    const cols = columnsOf(section, v.allCols);
    const lbl = L(section);
    const counters = (section.counters || []).slice(0, 3);
    const typeKey = k && k.type, statusKey = k && k.status;
    const selN = section.selected.size;
    const isCases = section.path === '/executive/getallcases';
    const docsSec = st().state.sections.get('/executive/documents');
    const html = `<div class="page">
      <div class="card" style="padding:12px 16px">
        <div class="toolbar">
          <div class="chips">${counters.map((c) => c.values.slice(0, 6).map((val) => { const set = c.key === typeKey ? v.type : c.key === statusKey ? v.status : null; return `<span class="chip ${set ? 'btn' : ''} ${set && set.has(val.label) ? 'on' : ''}" data-ck="${esc(c.key)}" data-cv="${esc(val.label)}" title="${esc(lbl(c.key))}">${esc(val.label)} <b>${n(val.count)}</b></span>`; }).join('')).join('')}</div>
          <div class="grow" style="flex:1"></div>
          <span class="muted" style="font-size:.85em">${n(recs.length)} از ${n(section.records.length)} رکورد${selN ? ' · ' + n(selN) + ' انتخاب‌شده' : ''}</span>
        </div>
        <div class="toolbar" style="margin-top:10px">
          <label class="search" style="min-width:240px">${icon('search')}<input type="search" data-f="q" placeholder="جست‌وجو در این بخش…" value="${esc(v.q)}"></label>
          <label class="lbl" style="flex-direction:row;align-items:center;gap:6px">از تاریخ<input class="input sm ltr" data-f="from" placeholder="۱۴۰۲/۰۱/۰۱" value="${esc(v.from)}" style="width:110px"></label>
          <label class="lbl" style="flex-direction:row;align-items:center;gap:6px">تا<input class="input sm ltr" data-f="to" placeholder="۱۴۰۵/۱۲/۲۹" value="${esc(v.to)}" style="width:110px"></label>
          <button class="btn sm ${v.recent ? 'pri' : ''}" data-act="recent">${icon('star')}فقط تازه‌ها</button>
          <button class="btn sm ghost" data-act="clear" title="پاک‌کردن فیلترها">${icon('close')}</button>
          <span class="sep"></span>
          <div class="seg"><button class="${v.mode === 'table' ? 'on' : ''}" data-mode="table">${icon('list')}</button><button class="${v.mode === 'cards' ? 'on' : ''}" data-mode="cards">${icon('grid')}</button></div>
          <button class="btn sm ghost" data-act="allcols">${v.allCols ? 'ستون‌های اصلی' : 'همهٔ ستون‌ها'}</button>
          <span class="sep"></span>
          <button class="btn sm" data-act="report">${icon('report')}گزارش این بخش</button>
          <button class="btn sm" data-act="dlsel" ${selN ? '' : 'disabled'}>${icon('download')}دانلود انتخاب‌شده‌ها</button>
          <button class="btn sm pri" data-act="dlall">${icon('download')}دانلود کل بخش <small class="muted" style="color:#fff;opacity:.8">(${esc(modeLabel(s.mode))})</small></button>
        </div>
      </div>
      ${recs.length ? (v.mode === 'table' ? tableHtml(section, pageRecs, cols, lbl, v, isCases, docsSec) : cardsHtml(section, pageRecs, cols, lbl)) : `<div class="card"><div class="empty">${icon('search')}با این فیلترها رکوردی نیست.</div></div>`}
      ${pages > 1 ? `<div class="pager"><button class="btn sm" data-pg="${v.page - 1}" ${v.page <= 1 ? 'disabled' : ''}>‹</button>${pagerNums(v.page, pages).map((p) => p === '…' ? '<span>…</span>' : `<button class="btn sm ${p === v.page ? 'pri' : ''}" data-pg="${p}">${n(p)}</button>`).join('')}<button class="btn sm" data-pg="${v.page + 1}" ${v.page >= pages ? 'disabled' : ''}>›</button><select class="input sm" data-f="per">${[25, 50, 100, 250].map((x) => `<option value="${x}" ${v.per === x ? 'selected' : ''}>${n(x)} در صفحه</option>`).join('')}</select></div>` : ''}
    </div>`;
    const keepScroll = box.scrollTop;
    box.innerHTML = html;
    box.scrollTop = keepScroll;
    bind(box.firstElementChild || box, section, v, recs, pageRecs, cols);
  }

  function pagerNums(p, total) {
    const out = new Set([1, total, p - 1, p, p + 1].filter((x) => x >= 1 && x <= total));
    const arr = [...out].sort((a, b) => a - b);
    const res = [];
    for (let i = 0; i < arr.length; i++) { if (i && arr[i] - arr[i - 1] > 1) res.push('…'); res.push(arr[i]); }
    return res;
  }
  function modeLabel(m) { return m === 'pdf' ? 'فقط پی‌دی‌اف' : m === 'text' ? 'فقط متن' : 'پی‌دی‌اف + متن'; }

  function cell(section, rec, c) {
    const k = known(section);
    const val = rec.flat[c];
    if (k && (c === k.status || c === k.prev)) return val === null || val === undefined || val === '' ? '—' : UI.badge(val);
    const s = U.formatValue(val);
    const num = U.looksLikeDate(val) || /^[\d۰-۹.\/:-]+$/.test(s);
    return `<span class="${num ? 'num' : ''}" title="${esc(s)}">${esc(s.length > 60 ? s.slice(0, 60) + '…' : s)}</span>`;
  }

  function tableHtml(section, recs, cols, lbl, v, isCases, docsSec) {
    return `<div class="card" style="padding:0;overflow:hidden"><div class="tbl-wrap" style="border:0;border-radius:var(--r3)"><table class="tbl"><thead><tr><th class="ck"><input type="checkbox" data-act="selpage" ${recs.length && recs.every((r) => section.selected.has(r.key)) ? 'checked' : ''}></th>${isCases ? '<th style="width:30px"></th>' : ''}${cols.map((c) => `<th data-sort="${esc(c)}" class="${v.sort === c ? 'sorted ' + (v.dir > 0 ? 'asc' : '') : ''}">${esc(lbl(c))}</th>`).join('')}<th>عملیات</th></tr></thead><tbody>
      ${recs.map((r) => { const sel = section.selected.has(r.key); const exp = isCases && v.expanded.has(r.key); return `<tr class="${sel ? 'sel' : ''}" data-key="${esc(r.key)}"><td class="ck"><input type="checkbox" data-sel="${esc(r.key)}" ${sel ? 'checked' : ''}></td>${isCases ? `<td><button class="btn xs ghost" data-exp="${esc(r.key)}" title="مدارک پرونده">${exp ? '▾' : '▸'}</button></td>` : ''}${cols.map((c) => `<td>${cell(section, r, c)}</td>`).join('')}<td class="acts"><button class="btn xs" data-open="${esc(r.key)}">${icon('eye')}مشاهده</button>${section.timelines.has(r.key) ? `<button class="btn xs ghost" data-open="${esc(r.key)}" data-tab="tl">${icon('timeline')}روند</button>` : ''}<button class="btn xs ghost" data-dl="${esc(r.key)}">${icon('download')}</button></td></tr>${exp ? `<tr class="sub"><td colspan="${cols.length + 3}"><div class="subwrap">${caseDocsHtml(r, docsSec)}</div></td></tr>` : ''}`; }).join('')}
    </tbody></table></div></div>`;
  }

  function caseDocsHtml(caseRec, docsSec) {
    if (!docsSec) return '<div class="muted">مدارک این پرونده هنوز گرفته نشده است.</div>';
    const docs = docsSec.records.filter((d) => String(d.flat.caseNo) === String(caseRec.flat.no) && String(d.flat.caseSubNo) === String(caseRec.flat.subNo));
    if (!docs.length) return '<div class="muted">مدرکی برای این پرونده ثبت نشده است.</div>';
    return `<table class="tbl"><thead><tr><th>نوع مدرک</th><th>شمارهٔ مدرک</th><th>وضعیت پیشین</th><th>وضعیت جاری</th><th>آخرین تغییر</th><th>رخدادها</th><th>گزارش رسمی</th><th></th></tr></thead><tbody>${docs.map((d) => `<tr><td>${esc(U.formatValue(d.flat.documentTypeName))}</td><td class="num">${esc(U.formatValue(d.flat.documentNo))}</td><td>${d.flat.previousState ? UI.badge(d.flat.previousState) : '—'}</td><td>${d.flat.currentState ? UI.badge(d.flat.currentState) : '—'}</td><td class="num">${esc(U.formatValue(d.flat.lastChange))}</td><td class="num">${n(d.flat.eventCount || 0)}</td><td>${(d.files || []).length ? `<span class="badge ok">${n(d.files.length)} فایل</span>` : (docsSec.details.get(d.key) ? `<span class="badge info">${n((docsSec.details.get(d.key).rows || []).length)} گزارش</span>` : '<span class="muted">—</span>')}</td><td class="acts"><button class="btn xs" data-opendoc="${esc(d.key)}">${icon('eye')}مشاهده</button></td></tr>`).join('')}</tbody></table>`;
  }

  function cardsHtml(section, recs, cols, lbl) {
    const k = known(section);
    return `<div class="grid auto">${recs.map((r) => `<div class="card rec-card" data-open="${esc(r.key)}"><div class="t"><span>${esc(st().caseNameOf(section, r))}</span>${k && k.status && r.flat[k.status] ? UI.badge(r.flat[k.status]) : ''}</div><div class="kv">${cols.slice(0, 6).map((c) => `<b>${esc(lbl(c))}</b><span class="${U.looksLikeDate(r.flat[c]) ? 'num' : ''}">${esc(U.formatValue(r.flat[c]))}</span>`).join('')}</div></div>`).join('')}</div>`;
  }

  function bind(box, section, v, recs, pageRecs, cols) {
    const rerender = () => draw();
    const q = box.querySelector('[data-f=q]');
    q.addEventListener('input', UI.debounce(() => { v.q = q.value; v.page = 1; rerender(); box.querySelector('[data-f=q]').focus(); }, 250));
    for (const f of ['from', 'to']) { const inp = box.querySelector(`[data-f=${f}]`); inp.addEventListener('change', () => { v[f] = U.enDigits(inp.value.trim()); v.page = 1; rerender(); }); }
    const per = box.querySelector('[data-f=per]'); if (per) per.addEventListener('change', () => { v.per = Number(per.value); v.page = 1; rerender(); });
    box.addEventListener('click', async (e) => {
      const chip = e.target.closest('.chip.btn');
      if (chip) { const k = known(section); const set = chip.dataset.ck === (k && k.type) ? v.type : v.status; if (set.has(chip.dataset.cv)) set.delete(chip.dataset.cv); else set.add(chip.dataset.cv); v.page = 1; return rerender(); }
      const th = e.target.closest('th[data-sort]');
      if (th) { const c = th.dataset.sort; if (v.sort === c) v.dir = -v.dir; else { v.sort = c; v.dir = 1; } return rerender(); }
      const pg = e.target.closest('[data-pg]'); if (pg) { v.page = Number(pg.dataset.pg); return rerender(); }
      const md = e.target.closest('[data-mode]'); if (md) { v.mode = md.dataset.mode; return rerender(); }
      const exp = e.target.closest('[data-exp]'); if (exp) { const key = exp.dataset.exp; if (v.expanded.has(key)) v.expanded.delete(key); else v.expanded.add(key); return rerender(); }
      const sel = e.target.closest('[data-sel]'); if (sel) { if (sel.checked) section.selected.add(sel.dataset.sel); else section.selected.delete(sel.dataset.sel); return rerender(); }
      const sp = e.target.closest('[data-act=selpage]'); if (sp) { if (sp.checked) pageRecs.forEach((r) => section.selected.add(r.key)); else pageRecs.forEach((r) => section.selected.delete(r.key)); return rerender(); }
      const od = e.target.closest('[data-opendoc]'); if (od) { const ds = st().state.sections.get('/executive/documents'); const rec = ds && ds.records.find((r) => r.key === od.dataset.opendoc); if (rec) openRecord(ds, rec); return; }
      const op = e.target.closest('[data-open]'); if (op) { const rec = section.records.find((r) => r.key === op.dataset.open); if (rec) openRecord(section, rec, op.dataset.tab); return; }
      const dl = e.target.closest('[data-dl]'); if (dl) { const rec = section.records.find((r) => r.key === dl.dataset.dl); if (rec) return downloadMenu(dl, section, [rec]); }
      const a = e.target.closest('[data-act]'); if (!a) return;
      switch (a.dataset.act) {
        case 'recent': v.recent = !v.recent; v.page = 1; return rerender();
        case 'clear': v.q = ''; v.type.clear(); v.status.clear(); v.from = ''; v.to = ''; v.recent = false; v.sort = null; v.page = 1; return rerender();
        case 'allcols': v.allCols = !v.allCols; return rerender();
        case 'report': return S.app.go('reports', { section: section.path });
        case 'dlsel': return downloadMenu(a, section, section.records.filter((r) => section.selected.has(r.key)));
        case 'dlall': return downloadMenu(a, section, recs, true);
        default: break;
      }
    });
  }

  /* ---------- دانلود ---------- */
  function downloadMenu(anchor, section, records, isAll) {
    const s = st().state.settings;
    const run = (mode) => downloadRecords(section, records, mode);
    UI.openMenu(anchor, [
      { header: `${n(records.length)} رکورد${isAll ? ' (با فیلتر جاری)' : ''}` },
      { id: 'pt', label: 'پی‌دی‌اف + متن' + (s.mode === 'pdf+text' ? ' (پیش‌فرض)' : ''), icon: 'print', onClick: () => run('pdf+text') },
      { id: 'p', label: 'فقط پی‌دی‌اف', icon: 'file', onClick: () => run('pdf') },
      { id: 't', label: 'فقط متن (txt و md)', icon: 'doc', onClick: () => run('text') },
      { header: 'قالب‌های دیگر' },
      { id: 'x', label: 'اکسل (جدول رکوردها)', icon: 'excel', onClick: () => exportTable(section, records, 'xlsx') },
      { id: 'j', label: 'دادهٔ خام (JSON)', icon: 'file', onClick: () => exportTable(section, records, 'json') },
      { id: 'c', label: 'جدول متنی (CSV)', icon: 'list', onClick: () => exportTable(section, records, 'csv') },
    ]);
  }

  async function ensureExecutiveFiles(docsSec, docs) {
    const need = docs.filter((d) => !(d.files && d.files.length));
    if (!need.length) return;
    watchFiles();
    const noDetails = need.filter((d) => !docsSec.details.has(d.key));
    noDetails.forEach((d) => wantFiles.add(d.key));
    if (noDetails.length) S.exporter.enqueueTyped(docsSec, noDetails, 'گزارش‌ها');
    S.exporter.enqueueTyped(docsSec, need.filter((d) => docsSec.details.has(d.key)), 'فایل');
    toast(`در حال گرفتن فایل‌های رسمی ${n(need.length)} مدرک از سامانه… پس از پایان، بسته ساخته می‌شود.`);
    // با رسیدن فهرست گزارش‌ها، فایل هر مدرک هم در صف می‌رود (در app: رویداد child)
    const start = Date.now();
    while (Date.now() - start < 3600000) {
      const q = S.exporter.queue;
      const pendingMine = q.items.some((it) => docs.includes(it.rec));
      if (!pendingMine && !q.running) return true;
      if ((q.paused && S.hook.sessionExpired) || S.app.state.session.expired) return false;   // وقت نشست تمام شد؛ ادامه پس از ورود
      await U.sleep(800);
    }
    return true;
  }

  /** ادامهٔ دانلودِ نیمه‌کارهٔ پرونده‌های اجرایی پس از ورود دوباره */
  async function resumeDownload(r) {
    const cs = st().state.sections.get('/executive/getallcases');
    if (!cs) return;
    const cases = cs.records.filter((c) => r.keys.includes(c.flat.no + '|' + c.flat.subNo));
    toast(`ادامهٔ دانلود ${n(cases.length)} پرونده از جایی که مانده بود…`);
    await downloadRecords(cs, cases, r.mode);
  }

  async function downloadRecords(section, records, mode) {
    if (!records.length) return toast('رکوردی انتخاب نشده است.', 'warn');
    const docsSec = st().state.sections.get('/executive/documents');
    try {
      let job;
      if (section.path === '/executive/getallcases' || section.path === '/executive/documents') {
        const casesSec = st().state.sections.get('/executive/getallcases');
        let cases = records;
        if (section.path === '/executive/documents') { const keys = new Set(records.map((r) => r.flat.caseNo + '|' + r.flat.caseSubNo)); cases = casesSec.records.filter((c) => keys.has(c.flat.no + '|' + c.flat.subNo)); }
        const caseKeys = new Set(cases.map((c) => c.flat.no + '|' + c.flat.subNo));
        const docs = docsSec ? docsSec.records.filter((d) => caseKeys.has(d.flat.caseNo + '|' + d.flat.caseSubNo)) : [];
        if (mode !== 'text' && docsSec) {
          const keys = cases.map((c) => c.flat.no + '|' + c.flat.subNo);
          S.app.state.resume = { keys, mode, total: cases.length };
          const done = await ensureExecutiveFiles(docsSec, docs);
          if (!done) { toast('زمان نشست تمام شد؛ فایل‌ها تا اینجا گرفته شد. با ورود دوباره، دانلود همین پرونده‌ها ادامه می‌یابد.', 'warn'); return; }
          S.app.state.resume = null;
        }
        toast(`در حال ساخت بستهٔ ${n(cases.length)} پرونده…`);
        job = await S.exporter.buildExecutiveJob(cases, mode);
      } else {
        toast(`در حال ساخت بستهٔ ${n(records.length)} رکورد…`);
        job = await S.exporter.buildJob(section, records, mode);
      }
      S.exporter.sendJob(job.entries, job.manifest);
      toast(`بسته فرستاده شد؛ فایل‌ها در پوشهٔ مقصد مرتب می‌شوند (${n(job.manifest.پوشه‌ها.length)} پوشه).`);
    } catch (e) { toast('خطا در ساخت بسته: ' + e.message, 'err'); }
  }

  function exportTable(section, records, fmt) {
    const lbl = L(section);
    const cols = columnsOf(section, true);
    const label = st().labelFor(section.path);
    const stamp = U.formatSystemDate().replace(/[:\/]/g, '-');
    if (fmt === 'json') return S.exporter.downloadText(U.safeFileName(`${label} ${stamp}.json`), JSON.stringify(records.map((r) => r.raw), null, 2), 'application/json');
    if (fmt === 'csv') { const q = (x) => '"' + String(x).replace(/"/g, '""') + '"'; const rows = [cols.map((c) => q(lbl(c))).join(','), ...records.map((r) => cols.map((c) => q(U.formatValue(r.flat[c]))).join(','))]; return S.exporter.downloadText(U.safeFileName(`${label} ${stamp}.csv`), '﻿' + rows.join('\r\n'), 'text/csv'); }
    // Excel: از راه سرویس (برگه‌ها در بسته)
    const sheets = [{ name: 'رکوردها', rows: [['#', ...cols.map(lbl)], ...records.map((r, i) => [n(i + 1), ...cols.map((c) => U.formatValue(r.flat[c]))])] }];
    const manifest = { نسخه: 1, شناسه: U.uid(), ساخته‌شده: U.formatSystemDate(), بخش: label, مسیر: section.path, حالت: 'text', پوشه‌ها: [{ نام: `جدول ${label} ${stamp}`, پایه: 'files/۱', فایل‌ها: [], فهرست: [], برگه‌ها: sheets }], زیرپوشه‌ها: Object.values(S.exporter.FOLDERS) };
    S.exporter.sendJob([{ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) }], manifest);
    toast('فایل Excel در پوشهٔ مقصد ساخته می‌شود.');
  }

  function downloadSection(section, mode) { if (!section) return; downloadRecords(section, section.records, mode || st().state.settings.mode); }
  async function downloadAll() {
    const mode = st().state.settings.mode;
    const list = st().sectionList().filter((s) => s.records.length && s.path !== '/executive/documents');
    for (const sec of list) await downloadRecords(sec, sec.records, mode);
  }

  /* ---------- کشوی جزئیات رکورد ---------- */
  function openRecord(section, rec, tab) {
    const k = known(section);
    const lbl = L(section);
    const name = st().caseNameOf(section, rec);
    const status = statusOf(section, rec);
    const hidden = (k && k.hideFields) || [];
    const tl = section.timelines.get(rec.key);
    const analysis = tl ? S.reports.analyzeTimeline(tl.rows) : null;
    const getDet = () => section.details.get(rec.key), getAtt = () => section.attachments.get(rec.key);
    const getFiles = () => (rec.files || []).map((key) => ({ key, f: st().state.files.get(key) })).filter((x) => x.f);
    const isDoc = section.path === '/executive/documents';
    const tabs = [['info', 'مشخصات'], ['tl', `روند${analysis ? ' (' + n(analysis.steps.length) + ')' : ''}`], ['files', 'گزارش‌ها و پیوست‌ها']];
    let cur = tab || 'info';
    const body = () => {
      const det = getDet(), att = getAtt(), files = getFiles();
      if (cur === 'tl') return analysis ? `<div class="grid c2" style="margin-bottom:12px"><div class="card" style="padding:10px 14px"><div class="muted" style="font-size:.8em">مدت کل روند</div><b>${U.formatDuration(analysis.totalMs)}</b></div><div class="card" style="padding:10px 14px"><div class="muted" style="font-size:.8em">از آخرین تغییر</div><b>${U.formatDuration(analysis.ageMs)}</b></div></div>` + UI.timelineHtml(analysis) : '<div class="empty">روندی برای این رکورد ثبت نشده است.</div>';
      if (cur === 'files') {
        let h = '';
        if (files.length) h += `<h4>فایل‌های رسمی (عین اصل)</h4><div class="list-rows">${files.map((x) => `<div class="r" data-file="${esc(x.key)}"><span>${icon('image')}</span><span class="w">${esc(x.f.fileName)}</span><span class="m">${n(Math.round(x.f.bytes.length / 1024))} کیلوبایت</span></div>`).join('')}</div>`;
        if (det && det.rows.length) h += `<h4 style="margin-top:14px">${esc(det.kind || 'جزئیات')} (${n(det.rows.length)})</h4><div class="tbl-wrap"><table class="tbl"><thead><tr>${Object.keys(U.flatten(det.rows[0])).map((c) => `<th>${esc(lbl(c))}</th>`).join('')}${isDoc ? '<th></th>' : ''}</tr></thead><tbody>${det.rows.map((r, i) => { const f = U.flatten(r); return `<tr>${Object.keys(f).map((c) => `<td>${esc(U.formatValue(f[c]))}</td>`).join('')}${isDoc ? `<td><button class="btn xs" data-getfile="${esc(String(U.flatten(r).reportTypeCode != null ? U.flatten(r).reportTypeCode : (i + 1)))}">${icon('download')}گرفتن فایل</button></td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
        if (att && att.rows.length) h += `<h4 style="margin-top:14px">پیوست‌ها (${n(att.rows.length)})</h4><div class="tbl-wrap"><table class="tbl"><thead><tr>${Object.keys(U.flatten(att.rows[0])).map((c) => `<th>${esc(lbl(c))}</th>`).join('')}</tr></thead><tbody>${att.rows.map((r) => { const f = U.flatten(r); return `<tr>${Object.keys(f).map((c) => `<td>${esc(U.formatValue(f[c]))}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
        if (!h) h = `<div class="empty">${isDoc ? 'فهرست گزارش‌های رسمی و پیوست‌های این مدرک هنوز از سامانه گرفته نشده است.' : 'پیوست یا گزارشی برای این رکورد گرفته نشده است.'}${isDoc ? '<div style="margin-top:10px"><button class="btn pri" data-act="fetchdet">' + icon('refresh') + 'گرفتن از سامانه</button></div>' : ''}</div>`;
        return h;
      }
      return UI.kvRows(rec.flat, lbl, { hide: hidden, raw: false }) + ((rec.flat && Object.keys(rec.flat).some((x) => x.endsWith('[]'))) ? Object.entries(rec.flat).filter(([x, v]) => x.endsWith('[]') && Array.isArray(v) && v.length).map(([x, v]) => `<h4 style="margin:14px 0 6px">${esc(lbl(x))}</h4><div class="tbl-wrap"><table class="tbl"><thead><tr>${Object.keys(U.flatten(v[0])).map((c) => `<th>${esc(lbl(c))}</th>`).join('')}</tr></thead><tbody>${v.map((row) => { const f = U.flatten(row); return `<tr>${Object.keys(f).map((c) => `<td>${esc(U.formatValue(f[c]))}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`).join('') : '');
    };
    const html = () => `<div class="hd"><h3>${icon(k ? k.icon : 'doc')}<span>${esc(name)}</span>${status ? UI.badge(status) : ''}<button class="btn icon ghost x" data-x>${icon('close')}</button></h3><div class="muted" style="font-size:.82em">${esc(st().labelFor(section.path))}${isDoc ? ' · پروندهٔ ' + n(rec.flat.caseNo) + ' · ' + esc(U.formatValue(rec.flat.unitName)) : ''}</div></div>
      <div class="tabs">${tabs.map(([id, t]) => `<button class="${cur === id ? 'on' : ''}" data-tab="${id}">${esc(t)}</button>`).join('')}</div>
      <div class="bd" data-role="bd">${body()}</div>
      <div class="ft"><button class="btn pri" data-dlmode="pdf+text">${icon('print')}پی‌دی‌اف + متن</button><button class="btn" data-dlmode="pdf">${icon('file')}فقط پی‌دی‌اف</button><button class="btn" data-dlmode="text">${icon('doc')}فقط متن</button>${isDoc ? `<button class="btn ghost" data-act="opencase">${icon('gavel')}پروندهٔ این مدرک</button>` : ''}</div>`;
    UI.openDrawer(html(), (d) => {
      d.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-tab]'); if (t) { cur = t.dataset.tab; d.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === cur)); d.querySelector('[data-role=bd]').innerHTML = body(); return; }
        const m = e.target.closest('[data-dlmode]'); if (m) return downloadRecords(section, [rec], m.dataset.dlmode);
        const gf = e.target.closest('[data-getfile]'); if (gf) { S.exporter.enqueueTyped(section, [rec], 'فایل', { force: true, only: gf.dataset.getfile }); toast('فایل در صف گرفتن قرار گرفت؛ پس از رسیدن، در همین کشو دیده می‌شود.'); return; }
        const fl = e.target.closest('[data-file]'); if (fl) { const f = st().state.files.get(fl.dataset.file); if (f) { S.exporter.downloadBytes(f.fileName, f.bytes, f.contentType); toast('فایل در «خروجی‌های دیگر» پوشهٔ مقصد ذخیره شد.'); } return; }
        const a = e.target.closest('[data-act]'); if (!a) return;
        if (a.dataset.act === 'fetchdet') { S.exporter.enqueueTyped(section, [rec], null, { force: true }); toast('در صف گرفتن قرار گرفت.'); }
        if (a.dataset.act === 'opencase') { const cs = st().state.sections.get('/executive/getallcases'); const c = cs && cs.records.find((x) => String(x.flat.no) === String(rec.flat.caseNo) && String(x.flat.subNo) === String(rec.flat.caseSubNo)); if (c) openRecord(cs, c); }
      });
      if (!openRecord.sub) { openRecord.sub = true; st().subscribe((what, payload) => { const live = openRecord.live; if (!live) return; if ((what === 'child' || what === 'file') && payload && payload.record === live.rec && live.d.classList.contains('open') && live.cur() === 'files') live.d.querySelector('[data-role=bd]').innerHTML = live.body(); }); }
      openRecord.live = { rec, d, body, cur: () => cur };
    });
  }

  S.ui.pages = Object.assign(S.ui.pages || {}, { section: render });
  Object.assign(S.ui, { openRecord, downloadSection, downloadAll, downloadRecords, resumeDownload, refreshSection: refresh, columnsOf, viewState });
})(window.SabtMan = window.SabtMan || {});
