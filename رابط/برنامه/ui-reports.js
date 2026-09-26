/* مرکز گزارش‌ها: دامنه (بخش‌ها، بازهٔ زمانی، نوع/وضعیت)، نوع گزارش (جامع، یک بخش، کارنامهٔ پرونده)، اجزای گزارش،
   پیش‌نمایش رسمی و ذخیرهٔ PDF / Excel / md / HTML در پوشهٔ مقصد. */
(function (S) {
  'use strict';
  const U = S.util;
  const UI = S.ui;
  const { esc, n, icon, el, toast } = UI;
  const st = () => S.store;

  const state = { kind: 'combined', sections: null, section: null, caseKey: null, from: '', to: '', type: new Set(), status: new Set(), parts: new Set(S.reports.PARTS.map((p) => p[0])), q: '' };

  function allSections() { return st().sectionList().filter((s) => s.records.length); }
  function facets(secs) {
    const types = new Map(), statuses = new Map();
    for (const sec of secs) {
      const k = S.siteMap.sectionFor(sec.path); if (!k) continue;
      for (const r of sec.records) {
        if (k.type) { const v = U.formatValue(r.flat[k.type]); if (v !== '—') types.set(v, (types.get(v) || 0) + 1); }
        if (k.status) { const v = U.formatValue(r.flat[k.status]); if (v !== '—') statuses.set(v, (statuses.get(v) || 0) + 1); }
      }
    }
    const sort = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
    return { types: sort(types), statuses: sort(statuses) };
  }

  function selectedSections() {
    const all = allSections();
    if (state.kind === 'section') return all.filter((s) => s.path === state.section);
    if (!state.sections) return all.filter((s) => s.path !== '/executive/getallcases' || true);
    return all.filter((s) => state.sections.has(s.path));
  }

  function filter() { return { from: state.from, to: state.to, type: [...state.type], status: [...state.status], q: state.q }; }

  /** ساخت گزارش جاری: {html, md, sheets, name, title} */
  function buildCurrent() {
    const s = st().state.settings;
    const opts = { pendingDays: s.pendingDays, recentDays: s.recentDays };
    const stamp = U.formatSystemDate().replace(/[:\/]/g, '-');
    if (state.kind === 'case') {
      const cs = st().state.sections.get('/executive/getallcases');
      const rec = cs && cs.records.find((r) => r.key === state.caseKey);
      if (!rec) return null;
      const name = st().caseNameOf(cs, rec);
      const d = S.reports.caseDossier(rec);
      const sheets = [{ name: 'مدارک', rows: [['#', 'نوع مدرک', 'شمارهٔ مدرک', 'وضعیت پیشین', 'وضعیت جاری', 'آخرین تغییر', 'رخدادها'], ...d.items.map((it, i) => [n(i + 1), U.formatValue(it.rec.flat.documentTypeName), U.formatValue(it.rec.flat.documentNo), U.formatValue(it.rec.flat.previousState), U.formatValue(it.rec.flat.currentState), U.formatValue(it.rec.flat.lastChange), n(it.rec.flat.eventCount || 0)])] },
        { name: 'رخدادها', rows: [['مدرک', 'شمارهٔ مدرک', 'تاریخ و ساعت', 'وضعیت پیشین', 'وضعیت جاری', 'ماندگاری'], ...d.items.flatMap((it) => it.analysis ? it.analysis.steps.map((x) => [U.formatValue(it.rec.flat.documentTypeName), U.formatValue(it.rec.flat.documentNo), x.dateText, x.prev || '—', x.status, x.durationMs !== null ? U.formatDuration(x.durationMs) : '—']) : [])] }];
      return { html: S.reports.caseSheetHtml(rec), md: S.exporter.caseMarkdown(rec, d), sheets, name: `کارنامهٔ روند ${name} ${stamp}`, title: `کارنامهٔ روند — ${name}`, records: d.items.length };
    }
    const secs = selectedSections();
    if (!secs.length) return null;
    const parts = [...state.parts];
    if (state.kind === 'section') {
      const sec = secs[0];
      const records = S.reports.filterRecords(sec, sec.records, filter());
      const report = S.reports.build(sec, Object.assign({ records }, opts));
      const label = st().labelFor(sec.path);
      return { html: S.reports.sectionReportHtml(report, { parts }), md: S.exporter.reportMarkdown(report), sheets: S.reports.excelSheets(report), name: `گزارش ${label} ${stamp}`, title: `گزارش رخداد و روند — ${label}`, records: records.length, report };
    }
    const merged = S.reports.combine(secs, filter());
    const report = S.reports.build(merged, opts);
    return { html: S.reports.sectionReportHtml(report, { parts, title: 'گزارش جامع داده‌های ثبت' }), md: S.exporter.reportMarkdown(report), sheets: S.reports.excelSheets(report), name: `گزارش جامع ${stamp}`, title: 'گزارش جامع', records: merged.records.length, report };
  }

  function render(box, arg) {
    if (arg && arg.section) { state.kind = 'section'; state.section = arg.section; }
    if (arg && arg.caseKey) { state.kind = 'case'; state.caseKey = arg.caseKey; }
    const all = allSections();
    if (state.sections === null) state.sections = new Set(all.map((s) => s.path));
    if (!state.section && all.length) state.section = all[0].path;
    const cs = st().state.sections.get('/executive/getallcases');
    if (!state.caseKey && cs && cs.records.length) state.caseKey = cs.records[0].key;
    const fc = facets(state.kind === 'section' ? all.filter((s) => s.path === state.section) : all.filter((s) => state.sections.has(s.path)));
    const page = el(`<div class="page rep-layout">
      <div class="rep-side">
        <div class="card"><h2>${icon('report')}نوع گزارش</h2><div class="rep-kinds">
          <label class="${state.kind === 'combined' ? 'on' : ''}"><input type="radio" name="kind" value="combined" ${state.kind === 'combined' ? 'checked' : ''}>گزارش جامع بخش‌های انتخابی</label>
          <label class="${state.kind === 'section' ? 'on' : ''}"><input type="radio" name="kind" value="section" ${state.kind === 'section' ? 'checked' : ''}>گزارش یک بخش</label>
          <label class="${state.kind === 'case' ? 'on' : ''}"><input type="radio" name="kind" value="case" ${state.kind === 'case' ? 'checked' : ''}>کارنامهٔ روند یک پروندهٔ اجرایی</label>
        </div>
        <div style="margin-top:8px" class="${state.kind === 'section' ? '' : 'hide'}"><select class="input" data-f="section" style="width:100%">${all.map((s) => `<option value="${esc(s.path)}" ${state.section === s.path ? 'selected' : ''}>${esc(st().labelFor(s.path))} (${n(s.records.length)})</option>`).join('')}</select></div>
        <div style="margin-top:8px" class="${state.kind === 'case' ? '' : 'hide'}">${cs && cs.records.length ? `<select class="input" data-f="case" style="width:100%">${cs.records.map((r) => `<option value="${esc(r.key)}" ${state.caseKey === r.key ? 'selected' : ''}>${esc(st().caseNameOf(cs, r))} — ${esc(U.formatValue(r.flat.caseState))}</option>`).join('')}</select>` : '<div class="muted">پروندهٔ اجرایی گرفته نشده است.</div>'}</div>
        </div>
        <div class="card ${state.kind === 'combined' ? '' : 'hide'}"><h2>${icon('grid')}بخش‌ها<span class="tail"><a href="#" data-act="secall">همه</a> · <a href="#" data-act="secnone">هیچ</a></span></h2><div class="list">${all.map((s) => `<label><input type="checkbox" data-sec="${esc(s.path)}" ${state.sections.has(s.path) ? 'checked' : ''}>${esc(st().labelFor(s.path))}<span class="cnt">${n(s.records.length)}</span></label>`).join('')}</div></div>
        <div class="card ${state.kind === 'case' ? 'hide' : ''}"><h2>${icon('clock')}بازه و فیلتر</h2>
          <div class="toolbar"><label class="lbl">از تاریخ<input class="input sm ltr" data-f="from" placeholder="۱۴۰۲/۰۱/۰۱" value="${esc(state.from)}"></label><label class="lbl">تا تاریخ<input class="input sm ltr" data-f="to" placeholder="۱۴۰۵/۱۲/۲۹" value="${esc(state.to)}"></label></div>
          <label class="lbl" style="margin-top:8px">جست‌وجو<input class="input sm" data-f="q" value="${esc(state.q)}" placeholder="واژه یا شماره"></label>
          ${fc.types.length ? `<div class="muted" style="font-size:.8em;margin-top:10px">نوع</div><div class="chips">${fc.types.map(([v, c]) => `<span class="chip btn ${state.type.has(v) ? 'on' : ''}" data-type="${esc(v)}">${esc(v)} <b>${n(c)}</b></span>`).join('')}</div>` : ''}
          ${fc.statuses.length ? `<div class="muted" style="font-size:.8em;margin-top:10px">وضعیت</div><div class="chips">${fc.statuses.map(([v, c]) => `<span class="chip btn ${state.status.has(v) ? 'on' : ''}" data-status="${esc(v)}">${esc(v)} <b>${n(c)}</b></span>`).join('')}</div>` : ''}
        </div>
        <div class="card ${state.kind === 'case' ? 'hide' : ''}"><h2>${icon('list')}اجزای گزارش<span class="tail"><a href="#" data-act="partall">همه</a> · <a href="#" data-act="partnone">هیچ</a></span></h2><div class="list">${S.reports.PARTS.map(([id, label]) => `<label><input type="checkbox" data-part="${id}" ${state.parts.has(id) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div></div>
      </div>
      <div class="rep-main">
        <div class="card" style="padding:12px 16px;margin-bottom:12px"><div class="toolbar"><b data-role="title"></b><span class="muted" data-role="meta" style="font-size:.85em"></span><div style="flex:1"></div>
          <button class="btn" data-save="md">${icon('doc')}ذخیرهٔ md</button><button class="btn" data-save="xlsx">${icon('excel')}ذخیرهٔ Excel</button><button class="btn" data-save="html">${icon('file')}ذخیرهٔ HTML</button><button class="btn pri" data-save="pdf">${icon('print')}ذخیرهٔ PDF</button></div></div>
        <div class="paper"><iframe data-role="paper" sandbox="allow-same-origin"></iframe></div>
      </div>
    </div>`);
    box.appendChild(page);
    const preview = () => {
      const r = buildCurrent();
      const fr = page.querySelector('[data-role=paper]');
      page.querySelector('[data-role=title]').textContent = r ? r.title : 'گزارش';
      page.querySelector('[data-role=meta]').textContent = r ? `${n(r.records)} رکورد · ${U.formatSystemDate()}` : '';
      fr.srcdoc = r ? r.html.replace(S.official.FONT_MARK, S.fontCss || '') : '<div style="font-family:Tahoma;padding:40px;text-align:center;color:#888">داده‌ای برای گزارش نیست.</div>';
      page.querySelectorAll('[data-save]').forEach((b) => { b.disabled = !r; });
    };
    page.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'kind') { state.kind = t.value; return S.app.go('reports'); }
      if (t.dataset.f === 'section') { state.section = t.value; state.type.clear(); state.status.clear(); return S.app.go('reports'); }
      if (t.dataset.f === 'case') { state.caseKey = t.value; return preview(); }
      if (t.dataset.sec) { if (t.checked) state.sections.add(t.dataset.sec); else state.sections.delete(t.dataset.sec); return S.app.go('reports'); }
      if (t.dataset.part) { if (t.checked) state.parts.add(t.dataset.part); else state.parts.delete(t.dataset.part); return preview(); }
      if (t.dataset.f === 'from' || t.dataset.f === 'to' || t.dataset.f === 'q') { state[t.dataset.f] = t.dataset.f === 'q' ? t.value : U.enDigits(t.value.trim()); return preview(); }
    });
    page.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip.btn');
      if (chip) { const set = chip.dataset.type !== undefined ? state.type : state.status; const v = chip.dataset.type !== undefined ? chip.dataset.type : chip.dataset.status; if (set.has(v)) set.delete(v); else set.add(v); chip.classList.toggle('on'); return preview(); }
      const a = e.target.closest('[data-act]');
      if (a) { e.preventDefault(); const all2 = allSections(); if (a.dataset.act === 'secall') state.sections = new Set(all2.map((s) => s.path)); if (a.dataset.act === 'secnone') state.sections = new Set(); if (a.dataset.act === 'partall') state.parts = new Set(S.reports.PARTS.map((p) => p[0])); if (a.dataset.act === 'partnone') state.parts = new Set(); return S.app.go('reports'); }
      const sv = e.target.closest('[data-save]'); if (sv) return save(sv.dataset.save);
    });
    preview();
  }

  function save(fmt) {
    const r = buildCurrent();
    if (!r) return toast('داده‌ای برای گزارش نیست.', 'warn');
    const base = U.safeFileName(r.name);
    if (fmt === 'md') { S.exporter.downloadText(base + '.md', r.md, 'text/markdown'); return toast('فایل md در «خروجی‌های دیگر» پوشهٔ مقصد ذخیره شد.'); }
    if (fmt === 'html') { S.exporter.downloadText(base + '.html', r.html.replace(S.official.FONT_MARK, S.fontCss || ''), 'text/html'); return toast('فایل HTML در «خروجی‌های دیگر» پوشهٔ مقصد ذخیره شد.'); }
    const F = S.exporter.FOLDERS;
    const files = [], entries = [];
    const push = (nm, data, kind) => { const path = `files/۱/${F.reports}/${nm}`; entries.push({ name: path, data }); files.push({ path, sub: F.reports, name: nm, kind }); };
    if (fmt === 'pdf') { push(base + '.pdf.html', r.html, 'pdf'); push(base + '.md', r.md, 'متن'); }
    const manifest = { نسخه: 1, شناسه: U.uid(), ساخته‌شده: U.formatSystemDate(), بخش: 'گزارش‌ها', مسیر: '/reports', حالت: fmt === 'pdf' ? 'pdf+text' : 'text', پوشه‌ها: [{ نام: base, پایه: 'files/۱', فایل‌ها: files, فهرست: files.map((f) => ({ پوشه: f.sub, نام: f.name, نوع: f.kind, تاریخ: U.formatSystemDate() })), برگه‌ها: r.sheets }], زیرپوشه‌ها: Object.values(F) };
    entries.unshift({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
    S.exporter.sendJob(entries, manifest);
    toast(fmt === 'pdf' ? 'گزارش رسمی به PDF چاپ می‌شود و با Excel کنار هم در پوشهٔ «گزارش‌ها» می‌نشیند.' : 'فایل Excel در پوشهٔ «گزارش‌ها» ساخته می‌شود.');
  }

  S.ui.pages = Object.assign(S.ui.pages || {}, { reports: render });
  S.ui.reports = { state, buildCurrent, save };
})(window.SabtMan = window.SabtMan || {});
