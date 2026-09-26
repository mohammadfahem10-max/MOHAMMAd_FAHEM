/* مرکز گزارش‌ها: فهرست بیش از ۱۰ نوع گزارش، دامنه و فیلتر متناسب هر نوع، پیش‌نمایش رسمی و ذخیرهٔ PDF/Excel/md/HTML. */
(function (S) {
  'use strict';
  const U = S.util;
  const UI = S.ui;
  const { esc, n, icon, el, toast } = UI;
  const st = () => S.store;

  const state = { id: 'summary', caseKey: null, cases: null, sections: null, section: null, from: '', to: '', type: new Set(), status: new Set(), parts: new Set(S.reports.PARTS.map((p) => p[0])), q: '' };

  function execCases() { return st().state.sections.get('/executive/getallcases'); }
  function allSections() { return st().sectionList().filter((s) => s.records.length); }
  function reportSections() { return allSections().filter((s) => s.path !== '/executive/documents'); }
  function filterObj() { return { from: state.from, to: state.to, type: [...state.type], status: [...state.status], q: state.q }; }

  function facets(secs) {
    const types = new Map(), statuses = new Map();
    for (const sec of secs) { const k = S.siteMap.sectionFor(sec.path); if (!k) continue; for (const r of sec.records) { if (k.type) { const v = U.formatValue(r.flat[k.type]); if (v !== '—') types.set(v, (types.get(v) || 0) + 1); } if (k.status) { const v = U.formatValue(r.flat[k.status]); if (v !== '—') statuses.set(v, (statuses.get(v) || 0) + 1); } } }
    const sort = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    return { types: sort(types), statuses: sort(statuses) };
  }

  function selectedCases() { const cs = execCases(); if (!cs) return []; if (!state.cases) return cs.records; return cs.records.filter((c) => state.cases.has(c.key)); }
  function ctxFor(report) {
    const opts = { pendingDays: st().state.settings.pendingDays, recentDays: st().state.settings.recentDays };
    const c = { opts, filter: filterObj(), parts: [...state.parts] };
    if (report.scope === 'case') { const cs = execCases(); c.caseRec = cs && cs.records.find((r) => r.key === state.caseKey); }
    if (report.scope === 'cases') c.cases = selectedCases();
    if (report.scope === 'section') c.section = st().state.sections.get(state.section);
    if (report.scope === 'sections') c.sections = state.sections ? reportSections().filter((s) => state.sections.has(s.path)) : reportSections();
    return c;
  }

  function buildCurrent() {
    const report = S.catalog.byId(state.id);
    if (!report) return null;
    const ctx = ctxFor(report);
    if (report.scope === 'case' && !ctx.caseRec) return null;
    if (report.scope === 'section' && !ctx.section) return null;
    if (report.scope === 'cases' && !ctx.cases.length) return null;
    if (report.scope === 'sections' && !ctx.sections.length) return null;
    try { return S.catalog.build(report, ctx); } catch (e) { console.error(e); return { title: 'خطا', html: `<div style="font-family:Tahoma;padding:30px;color:#c00">خطا در ساخت گزارش: ${esc(e.message)}</div>`, md: '', sheets: [], records: 0 }; }
  }

  function render(box, arg) {
    if (arg && arg.section) { state.id = 'section'; state.section = arg.section; }
    if (arg && arg.caseKey) { state.id = 'exec-dossier'; state.caseKey = arg.caseKey; }
    if (arg && arg.id) state.id = arg.id;
    const report = S.catalog.byId(state.id) || S.catalog.REPORTS[0];
    const cs = execCases();
    const secs = reportSections();
    if (state.cases === null && cs) state.cases = new Set(cs.records.map((r) => r.key));
    if (state.sections === null) state.sections = new Set(secs.map((s) => s.path));
    if (!state.caseKey && cs && cs.records.length) state.caseKey = cs.records[0].key;
    if (!state.section && secs.length) state.section = secs[0].path;

    const page = el(`<div class="page rep-layout">
      <div class="rep-side">
        <div class="card"><h2>${icon('report')}نوع گزارش<span class="tail">${n(S.catalog.REPORTS.length)} گزارش</span></h2><div class="rep-cats">${S.catalog.REPORTS.map((r) => `<button class="rep-cat ${state.id === r.id ? 'on' : ''}" data-rep="${esc(r.id)}" title="${esc(r.desc)}">${icon(r.icon)}<span><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></span></button>`).join('')}</div></div>
        <div class="card" data-role="scope"></div>
      </div>
      <div class="rep-main">
        <div class="card" style="padding:12px 16px;margin-bottom:12px"><div class="toolbar"><b data-role="title"></b><span class="muted" data-role="meta" style="font-size:.85em"></span><div style="flex:1"></div>
          <button class="btn" data-save="md">${icon('doc')}متن</button><button class="btn" data-save="xlsx">${icon('excel')}اکسل</button><button class="btn" data-save="html">${icon('file')}صفحهٔ وب</button><button class="btn pri" data-save="pdf">${icon('print')}ذخیرهٔ پی‌دی‌اف</button></div></div>
        <div class="paper"><iframe data-role="paper" sandbox="allow-same-origin"></iframe></div>
      </div>
    </div>`);
    box.appendChild(page);
    const scopeBox = page.querySelector('[data-role=scope]');

    const renderScope = () => {
      const rep = S.catalog.byId(state.id);
      let html = '';
      if (rep.scope === 'case') {
        html = `<h2>${icon('gavel')}پرونده</h2>${cs && cs.records.length ? `<select class="input" data-f="case" style="width:100%">${cs.records.map((r) => `<option value="${esc(r.key)}" ${state.caseKey === r.key ? 'selected' : ''}>${esc(st().caseNameOf(cs, r))} — ${esc(U.formatValue(r.flat.caseState))}</option>`).join('')}</select>` : '<div class="muted">پروندهٔ اجرایی گرفته نشده است.</div>'}`;
      } else if (rep.scope === 'cases') {
        html = `<h2>${icon('gavel')}پرونده‌ها<span class="tail"><a href="#" data-act="cAll">همه</a> · <a href="#" data-act="cNone">هیچ</a></span></h2><div class="list">${cs ? cs.records.map((r) => `<label><input type="checkbox" data-case="${esc(r.key)}" ${state.cases.has(r.key) ? 'checked' : ''}>${esc(st().caseNameOf(cs, r))}<span class="cnt">${n(r.flat.docCount || 0)}</span></label>`).join('') : '<div class="muted">—</div>'}</div>` + rangeBlock(facets(cs ? [execDocsSec()].filter(Boolean) : []));
      } else if (rep.scope === 'section') {
        html = `<h2>${icon('doc')}بخش</h2><select class="input" data-f="section" style="width:100%">${secs.map((s) => `<option value="${esc(s.path)}" ${state.section === s.path ? 'selected' : ''}>${esc(st().labelFor(s.path))} (${n(s.records.length)})</option>`).join('')}</select>` + rangeBlock(facets(secs.filter((s) => s.path === state.section))) + partsBlock();
      } else if (rep.scope === 'sections') {
        html = `<h2>${icon('grid')}بخش‌ها<span class="tail"><a href="#" data-act="sAll">همه</a> · <a href="#" data-act="sNone">هیچ</a></span></h2><div class="list">${secs.map((s) => `<label><input type="checkbox" data-sec="${esc(s.path)}" ${state.sections.has(s.path) ? 'checked' : ''}>${esc(st().labelFor(s.path))}<span class="cnt">${n(s.records.length)}</span></label>`).join('')}</div>` + rangeBlock(facets(secs.filter((s) => state.sections.has(s.path)))) + partsBlock();
      } else {
        html = `<div class="note">این گزارش همهٔ داده‌های گردآوری‌شده را در بر می‌گیرد و به انتخاب دامنه نیاز ندارد.</div>`;
      }
      scopeBox.innerHTML = html;
    };
    const rangeBlock = (fc) => `<div class="divider"></div><h3>${icon('clock')} بازه و فیلتر</h3><div class="toolbar"><label class="lbl">از تاریخ<input class="input sm ltr" data-f="from" placeholder="۱۴۰۲/۰۱/۰۱" value="${esc(state.from)}"></label><label class="lbl">تا تاریخ<input class="input sm ltr" data-f="to" placeholder="۱۴۰۵/۱۲/۲۹" value="${esc(state.to)}"></label></div><label class="lbl" style="margin-top:6px">جست‌وجو<input class="input sm" data-f="q" value="${esc(state.q)}" placeholder="واژه یا شماره"></label>${fc.types.length ? `<div class="muted" style="font-size:.8em;margin-top:8px">نوع</div><div class="chips">${fc.types.map(([v, c]) => `<span class="chip btn ${state.type.has(v) ? 'on' : ''}" data-type="${esc(v)}">${esc(v)} <b>${n(c)}</b></span>`).join('')}</div>` : ''}${fc.statuses.length ? `<div class="muted" style="font-size:.8em;margin-top:8px">وضعیت</div><div class="chips">${fc.statuses.map(([v, c]) => `<span class="chip btn ${state.status.has(v) ? 'on' : ''}" data-status="${esc(v)}">${esc(v)} <b>${n(c)}</b></span>`).join('')}</div>` : ''}`;
    const partsBlock = () => `<div class="divider"></div><h3>${icon('list')} اجزای گزارش <span class="tail"><a href="#" data-act="pAll">همه</a> · <a href="#" data-act="pNone">هیچ</a></span></h3><div class="rep-kinds">${S.reports.PARTS.map(([id, label]) => `<label class="${state.parts.has(id) ? 'on' : ''}"><input type="checkbox" data-part="${id}" ${state.parts.has(id) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div>`;

    const preview = () => {
      const r = buildCurrent();
      const fr = page.querySelector('[data-role=paper]');
      page.querySelector('[data-role=title]').textContent = r ? r.title : (S.catalog.byId(state.id) || {}).name || 'گزارش';
      page.querySelector('[data-role=meta]').textContent = r ? `${n(r.records)} رکورد · ${U.formatSystemDate()}` : 'دامنه‌ای انتخاب نشده';
      fr.srcdoc = r ? r.html : '<div style="font-family:Tahoma;padding:40px;text-align:center;color:#888">برای این گزارش دامنه‌ای انتخاب کنید یا داده‌ای گرفته نشده است.</div>';
      page.querySelectorAll('[data-save]').forEach((b) => { b.disabled = !r; });
    };
    const refreshAll = () => { renderScope(); preview(); };

    page.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.f === 'case') { state.caseKey = t.value; return preview(); }
      if (t.dataset.f === 'section') { state.section = t.value; state.type.clear(); state.status.clear(); return refreshAll(); }
      if (t.dataset.case) { if (t.checked) state.cases.add(t.dataset.case); else state.cases.delete(t.dataset.case); return preview(); }
      if (t.dataset.sec) { if (t.checked) state.sections.add(t.dataset.sec); else state.sections.delete(t.dataset.sec); return refreshAll(); }
      if (t.dataset.part) { if (t.checked) state.parts.add(t.dataset.part); else state.parts.delete(t.dataset.part); return preview(); }
      if (t.dataset.f === 'from' || t.dataset.f === 'to' || t.dataset.f === 'q') { state[t.dataset.f] = t.dataset.f === 'q' ? t.value : U.enDigits(t.value.trim()); return preview(); }
    });
    page.addEventListener('click', (e) => {
      const rc = e.target.closest('[data-rep]'); if (rc) { state.id = rc.dataset.rep; page.querySelectorAll('.rep-cat').forEach((x) => x.classList.toggle('on', x.dataset.rep === state.id)); return refreshAll(); }
      const chip = e.target.closest('.chip.btn'); if (chip) { const set = chip.dataset.type !== undefined ? state.type : state.status; const v = chip.dataset.type !== undefined ? chip.dataset.type : chip.dataset.status; if (set.has(v)) set.delete(v); else set.add(v); chip.classList.toggle('on'); return preview(); }
      const a = e.target.closest('[data-act]');
      if (a) { e.preventDefault(); const csR = execCases(); if (a.dataset.act === 'cAll' && csR) state.cases = new Set(csR.records.map((r) => r.key)); if (a.dataset.act === 'cNone') state.cases = new Set(); if (a.dataset.act === 'sAll') state.sections = new Set(secs.map((s) => s.path)); if (a.dataset.act === 'sNone') state.sections = new Set(); if (a.dataset.act === 'pAll') state.parts = new Set(S.reports.PARTS.map((p) => p[0])); if (a.dataset.act === 'pNone') state.parts = new Set(); return refreshAll(); }
      const sv = e.target.closest('[data-save]'); if (sv) return save(sv.dataset.save);
    });
    renderScope();
    preview();
  }
  function execDocsSec() { return st().state.sections.get('/executive/documents'); }

  function save(fmt) {
    const r = buildCurrent();
    if (!r) return toast('برای این گزارش دامنه‌ای انتخاب کنید.', 'warn');
    const base = U.safeFileName(r.title + ' ' + U.formatSystemDate().replace(/[:\/]/g, '-'));
    if (fmt === 'md') { S.exporter.downloadText(base + '.md', r.md, 'text/markdown'); return toast('فایل متنی در «خروجی‌های دیگر» پوشهٔ مقصد ذخیره شد.'); }
    if (fmt === 'html') { S.exporter.downloadText(base + '.html', r.html, 'text/html'); return toast('فایل صفحهٔ وب در «خروجی‌های دیگر» پوشهٔ مقصد ذخیره شد.'); }
    const F = S.exporter.FOLDERS;
    const files = [], entries = [];
    const push = (nm, data, kind) => { const path = `files/۱/${F.reports}/${nm}`; entries.push({ name: path, data }); files.push({ path, sub: F.reports, name: nm, kind }); };
    if (fmt === 'pdf') { push(base + '.pdf.html', r.html, 'pdf'); if (r.md) push(base + '.md', r.md, 'متن'); }
    const manifest = { نسخه: 1, شناسه: U.uid(), ساخته‌شده: U.formatSystemDate(), بخش: 'گزارش‌ها', مسیر: '/reports', حالت: fmt === 'pdf' ? 'pdf+text' : 'text', پوشه‌ها: [{ نام: base, پایه: 'files/۱', فایل‌ها: files, فهرست: files.map((f) => ({ پوشه: f.sub, نام: f.name, نوع: f.kind, تاریخ: U.formatSystemDate() })), برگه‌ها: r.sheets || [] }], زیرپوشه‌ها: Object.values(F) };
    entries.unshift({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
    S.exporter.sendJob(entries, manifest);
    toast(fmt === 'pdf' ? 'گزارش رسمی به پی‌دی‌اف چاپ می‌شود و با اکسل در پوشهٔ «گزارش‌ها» می‌نشیند.' : 'فایل اکسل در پوشهٔ «گزارش‌ها» ساخته می‌شود.');
  }

  S.ui.pages = Object.assign(S.ui.pages || {}, { reports: render });
  S.ui.reports = { state, buildCurrent, save };
})(window.SabtMan = window.SabtMan || {});
