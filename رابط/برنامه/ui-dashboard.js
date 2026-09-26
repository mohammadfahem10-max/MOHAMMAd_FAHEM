/* پیشخوان: نمای کلی داده‌های کاربر — شاخص‌ها، نمودار رخدادها، معطل‌ها و تازه‌ها، کارت هر بخش. */
(function (S) {
  'use strict';
  const U = S.util;
  const UI = S.ui;
  const { esc, n, icon, el } = UI;
  const st = () => S.store;
  const C = () => S.ui.charts;

  function sections() { return st().sectionList(); }
  function secByPath(p) { return st().state.sections.get(p); }

  function person() {
    const p = secByPath('/user/GetUserProfile') || secByPath('/user/getuserinfo');
    const rec = p && p.records[0];
    return rec ? S.siteMap.personName(rec.flat) : null;
  }
  function guessName() { const n = person(); return n ? n.full : ''; }

  /** همهٔ رخدادهای مدارک اجرایی (برای نمودارها و فهرست‌ها) */
  function allEvents() {
    const docs = secByPath('/executive/documents');
    if (!docs) return [];
    const out = [];
    for (const r of docs.records) {
      const tl = docs.timelines.get(r.key); if (!tl) continue;
      for (const e of tl.rows) { const ts = U.parseSystemDate(e.changeDateTime); if (ts !== null) out.push({ ts, rec: r, e, sec: docs }); }
    }
    return out.sort((a, b) => b.ts - a.ts);
  }

  function monthly(events, months) {
    const map = new Map();
    for (const ev of events) { const m = U.formatSystemDay(ev.ts).split('/').slice(0, 2).join('/'); map.set(m, (map.get(m) || 0) + 1); }
    const keys = [...map.keys()].sort((a, b) => U.enDigits(a).localeCompare(U.enDigits(b))).slice(-months);
    return keys.map((k) => ({ label: k, value: map.get(k) }));
  }

  function pendingDocs(docs, days) {
    const lim = Date.now() - days * 86400000;
    return docs.records.filter((r) => { const ts = U.parseSystemDate(r.flat.lastChange); return ts !== null && ts < lim && !S.reports.isFinal(r.flat.currentState) && !/رويت|رؤیت|ابلاغ شده/.test(String(r.flat.currentState)); })
      .sort((a, b) => (U.parseSystemDate(a.flat.lastChange) || 0) - (U.parseSystemDate(b.flat.lastChange) || 0));
  }
  function unseenDocs(docs) {
    return docs.records.filter((r) => /ابلاغ/.test(String(r.flat.documentTypeName)) && !(docs.timelines.get(r.key) || { rows: [] }).rows.some((e) => /رويت|رؤیت/.test(String(e.nextState))));
  }

  function statCard(label, value, sub, ic, chips) {
    return `<div class="card stat"><div class="k">${icon(ic)}${esc(label)}</div><div class="v">${n(value)}</div><div class="s">${esc(sub || '')}</div>${chips ? `<div class="chips">${chips}</div>` : ''}</div>`;
  }
  function counterChips(sec, key, limit) {
    if (!sec) return '';
    const c = (sec.counters || []).find((x) => x.key === key);
    if (!c) return '';
    return c.values.slice(0, limit || 4).map((v) => `<span class="chip">${esc(v.label)} <b>${n(v.count)}</b></span>`).join('');
  }

  function render(box) {
    const s = st().state.settings;
    const cases = secByPath('/executive/getallcases'), docs = secByPath('/executive/documents'), ssar = secByPath('/ssar/getalldocuments'), estate = secByPath('/estate/GetEstatePersonList'), companies = secByPath('/company/getsinglefootprint');
    const events = allEvents();
    const who = person();
    const name = who ? who.full : '';
    const nat = ((who && who.nationalCode) || S.app.state.login.nationalCode || '').replace(/^(\d{3})\d{4}(\d{3})$/, '$1••••$2');
    const pending = docs ? pendingDocs(docs, Number(s.pendingDays) || 7) : [];
    const unseen = docs ? unseenDocs(docs) : [];
    const recent = events.slice(0, 10);
    const q = S.exporter.queue;
    const page = el(`<div class="page">
      <div class="card hero"><div class="av">${esc((name || 'ث').trim().slice(0, 1))}</div><div class="t"><b>${esc(name ? 'خوش آمدید، ' + name : 'خوش آمدید')}</b><small>${who && who.father ? 'فرزند ' + esc(who.father) + ' · ' : ''}${nat ? 'کد ملی ' + n(nat) + ' · ' : ''}${S.app.state.lastCollect ? 'آخرین گردآوری ' + U.formatSystemDate(S.app.state.lastCollect) : 'هنوز گردآوری نشده'}${q.items.length ? ' · در حال گرفتن جزئیات ' + n(q.done + q.failed) + ' از ' + n(q.done + q.failed + q.items.length) : ''}</small></div>
        <div class="acts"><button class="btn" data-act="refresh">${icon('refresh')}به‌روزرسانی داده‌ها</button><button class="btn" data-act="reports">${icon('report')}گزارش جامع</button><button class="btn pri" data-act="dlall">${icon('download')}دانلود همهٔ داده‌ها</button></div></div>
      <div class="grid c4">
        ${statCard('پرونده‌های اجرایی', cases ? cases.records.length : 0, cases ? 'با ' + n(docs ? docs.records.length : 0) + ' مدرک و ' + n(events.length) + ' رخداد' : 'گرفته نشده', 'gavel', counterChips(cases, 'caseState', 3))}
        ${statCard('مدارک اجرایی', docs ? docs.records.length : 0, 'اجرائیه، ابلاغیه، نامه، ممنوع‌الخروجی…', 'stack', counterChips(docs, 'documentTypeName', 4))}
        ${statCard('اسناد رسمی', ssar ? ssar.records.length : 0, ssar ? 'از سال ۱۳۹۲ به بعد' : 'گرفته نشده', 'doc', counterChips(ssar, 'aganttypetitle', 3))}
        ${statCard('املاک', estate ? estate.records.length : 0, companies ? 'و ' + n(companies.records.length) + ' شرکت' : '', 'home', counterChips(estate, 'estatestatus', 3))}
      </div>
      <div class="grid c3">
        <div class="card chart" style="grid-column:span 2"><h2>${icon('timeline')}رخدادهای پرونده‌های اجرایی در ماه‌های اخیر<span class="tail">${n(events.length)} رخداد</span></h2>${C().bars(monthly(events, 12), { height: 190 })}</div>
        <div class="card"><h2>${icon('gavel')}وضعیت پرونده‌های اجرایی</h2>${C().donut(cases ? ((cases.counters || []).find((c) => c.key === 'caseState') || { values: [] }).values.map((v) => ({ label: v.label, value: v.count })) : [], { center: 'پرونده' })}</div>
      </div>
      <div class="grid c3">
        <div class="card"><h2>${icon('clock')}تازه‌ترین رخدادها</h2>${recent.length ? `<div class="list-rows">${recent.map((ev, i) => `<div class="r" data-rec="${esc(ev.rec.key)}"><span class="m num">${esc(U.faDigits(ev.e.changeDateTime))}</span><span class="w"><b>${esc(ev.rec.flat.documentTypeName)}</b> ${ev.rec.flat.documentNo ? n(ev.rec.flat.documentNo) : ''} — ${esc(ev.e.nextState)}</span><span class="m">${n(ev.rec.flat.caseNo)}</span></div>`).join('')}</div>` : '<div class="empty">هنوز رخدادی نیست.</div>'}</div>
        <div class="card"><h2>${icon('alert')}معطل‌ها<span class="tail">بیش از ${n(s.pendingDays || 7)} روز بی‌تغییر</span></h2>${pending.length ? `<div class="list-rows">${pending.slice(0, 10).map((r) => `<div class="r" data-rec="${esc(r.key)}"><span class="m">${U.formatDuration(Date.now() - U.parseSystemDate(r.flat.lastChange))}</span><span class="w"><b>${esc(r.flat.documentTypeName)}</b> ${r.flat.documentNo ? n(r.flat.documentNo) : ''} — ${esc(r.flat.currentState)}</span><span class="m">${n(r.flat.caseNo)}</span></div>`).join('')}</div>` : '<div class="empty">موردی معطل نیست.</div>'}</div>
        <div class="card"><h2>${icon('eye')}ابلاغیه‌های رویت‌نشده<span class="tail">${n(unseen.length)}</span></h2>${unseen.length ? `<div class="list-rows">${unseen.slice(0, 10).map((r) => `<div class="r" data-rec="${esc(r.key)}"><span class="m num">${esc(U.faDigits(r.flat.lastChange || ''))}</span><span class="w"><b>${esc(r.flat.documentTypeName)}</b> ${r.flat.documentNo ? n(r.flat.documentNo) : ''} — ${esc(r.flat.currentState)}</span><span class="m">${n(r.flat.caseNo)}</span></div>`).join('')}</div>` : '<div class="empty">همهٔ ابلاغیه‌ها رویت شده‌اند.</div>'}</div>
      </div>
      <div class="card"><h2>${icon('grid')}بخش‌های داده</h2><div class="grid auto" data-role="tiles">${tiles()}</div></div>
    </div>`);
    box.appendChild(page);
    page.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (a) {
        if (a.dataset.act === 'refresh') return S.app.collectAll();
        if (a.dataset.act === 'reports') return S.app.go('reports');
        if (a.dataset.act === 'dlall') return S.ui.downloadAll();
        if (a.dataset.act === 'view') return S.app.go('section', a.dataset.path);
        if (a.dataset.act === 'dl') return S.ui.downloadSection(st().state.sections.get(a.dataset.path));
        if (a.dataset.act === 'collect') return S.app.collectAll([a.dataset.key]);
      }
      const r = e.target.closest('[data-rec]');
      if (r && docs) { const rec = docs.records.find((x) => x.key === r.dataset.rec); if (rec) S.ui.openRecord(docs, rec); }
    });
  }

  function tiles() {
    const known = S.siteMap.SECTIONS.filter((k) => !k.virtual || secByPath(k.path));
    const others = sections().filter((s) => !S.siteMap.sectionFor(s.path));
    const tile = (label, sec, ic, path, key, note) => {
      const nrec = sec ? sec.records.length : 0;
      const chips = sec ? (sec.counters || []).slice(0, 2).flatMap((c) => c.values.slice(0, 3).map((v) => `<span class="chip">${esc(v.label)} <b>${n(v.count)}</b></span>`)).join('') : '';
      return `<div class="card tile ${!sec || !nrec ? 'empty' : ''}"><h3>${icon(ic)}${esc(label)}</h3><div class="big">${n(nrec)} <small style="font-size:.5em;-webkit-text-fill-color:var(--tx3);color:var(--tx3)">داده</small></div>${chips ? `<div class="chips">${chips}</div>` : ''}<div class="muted" style="font-size:.8em">${sec ? 'آخرین به‌روزرسانی: ' + U.formatSystemDate(sec.lastTs) : (note || 'هنوز گرفته نشده است.')}</div>
        <div class="acts">${sec ? `<button class="btn sm pri" data-act="view" data-path="${esc(path)}">${icon('eye')}مشاهده</button>${nrec ? `<button class="btn sm" data-act="dl" data-path="${esc(path)}">${icon('download')}دانلود همه</button>` : ''}` : ''}${key ? `<button class="btn sm ghost" data-act="collect" data-key="${esc(key)}">${icon('refresh')}گردآوری</button>` : ''}</div></div>`;
    };
    let html = known.map((k) => tile(k.label, secByPath(k.path), k.icon, k.path, k.virtual ? 'executive-cases' : k.id, k.virtual ? 'با گردآوری پرونده‌های اجرایی گرفته می‌شود.' : null)).join('');
    html += others.map((s) => tile(st().labelFor(s.path), s, 'doc', s.path, null)).join('');
    return html;
  }

  S.ui.pages = Object.assign(S.ui.pages || {}, { dashboard: render });
  S.ui.dashboard = { allEvents, pendingDocs, unseenDocs, guessName, monthly };
})(window.SabtMan = window.SabtMan || {});
