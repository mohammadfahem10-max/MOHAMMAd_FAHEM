/* ثبت من — رابط برنامه (WebView2ِ دیدنی). صفحه‌ها: ورود، گردآوری پشت پرده، پیشخوان، بخش‌ها، گزارش‌ها، تنظیمات.
   کاربر هرگز سایت را نمی‌بیند؛ همهٔ کار با سایتِ پنهان از راه پوسته (S.hook = remote-hook) انجام می‌شود. */
(function (S) {
  'use strict';
  const U = S.util;
  const UI = S.ui;
  const { esc, n, icon, $, el, toast } = UI;
  const st = () => S.store;

  const app = {
    page: 'login', arg: null, siteState: null, siteReady: false, collecting: null, lastCollect: null, countdown: null, msg: null, timer: null,
    login: (function () { let nn = '', rr = false; try { rr = localStorage.getItem('sm_remember') === '1'; if (rr) nn = localStorage.getItem('sm_nat') || ''; } catch (e) { /* ادامه */ } return { nationalCode: nn, captcha: null, needCaptcha: false, otpSent: false, remember: rr }; })(),
    el: {}, search: '',
  };
  const siteWaiters = [];

  /* ---------- ظاهر ---------- */
  function applyAppearance() {
    const s = st().state.settings;
    UI.applyTheme(s.theme || 'fluent', Number(s.fontSize) || 17);
    document.documentElement.classList.toggle('no-motion', s.motion === false);
  }

  /* ---------- ناوبری ---------- */
  function go(page, arg) {
    if (app.page === 'login') saveLoginDraft();
    UI.closeDrawer(); UI.closeMenu();
    app.page = page; app.arg = arg;
    const root = $('#app');
    root.classList.toggle('is-login', page === 'login' || page === 'collecting');
    renderNav();
    renderTopbar();
    const box = app.el.page;
    box.innerHTML = '';
    box.scrollTop = 0;
    const pages = S.ui.pages;
    const fn = pages[page] || pages.dashboard;
    try { fn(box, arg); } catch (e) { console.error(e); box.innerHTML = `<div class="card"><h2>خطا در نمایش صفحه</h2><pre class="ltr">${esc(e.stack || e.message)}</pre></div>`; }
    renderStatus();
  }

  function sectionsForNav() {
    const list = st().sectionList();
    const known = S.siteMap.SECTIONS.map((sec) => ({ sec, s: st().state.sections.get(sec.path) })).filter((x) => x.s || !sec_hidden(x.sec));
    const others = list.filter((s) => !S.siteMap.sectionFor(s.path));
    return { known, others };
  }
  function sec_hidden(sec) { return false; }

  function renderNav() {
    const nav = app.el.nav;
    if (app.page === 'login' || app.page === 'collecting') { nav.innerHTML = ''; return; }
    const item = (id, label, ic, cnt, cls) => `<button class="nav-item ${app.page === id || (app.page === 'section' && app.arg === id) ? 'on' : ''} ${cls || ''}" data-nav="${esc(id)}">${icon(ic)}<span>${esc(label)}</span>${cnt !== undefined && cnt !== null ? `<span class="cnt">${n(cnt)}</span>` : ''}</button>`;
    let html = item('dashboard', 'پیشخوان', 'dashboard');
    html += '<div class="nav-group">داده‌های من</div>';
    const { known, others } = sectionsForNav();
    for (const { sec, s } of known) html += item(sec.path, sec.short || sec.label, sec.icon, s ? s.records.length : 0);
    for (const s of others) html += item(s.path, st().labelFor(s.path), 'doc', s.records.length);
    html += '<div class="nav-group">ابزار</div>';
    html += item('reports', 'گزارش‌ها', 'report') + item('settings', 'تنظیمات', 'settings');
    html += '<div class="nav-group"></div>';
    html += `<button class="nav-item" data-nav="refresh">${icon('refresh')}<span>به‌روزرسانی داده‌ها</span></button>`;
    html += `<button class="nav-item warn" data-nav="logout">${icon('logout')}<span>خروج از حساب</span></button>`;
    nav.innerHTML = html;
  }

  function renderTopbar() {
    const t = app.el.topbar;
    if (app.page === 'login' || app.page === 'collecting') { t.innerHTML = ''; return; }
    let title = 'پیشخوان', crumb = 'نمای کلی داده‌های شما در سامانهٔ ثبت';
    if (app.page === 'section') { const sec = S.siteMap.sectionFor(app.arg); title = st().labelFor(app.arg); crumb = sec ? sec.group : 'بخش کشف‌شده'; }
    else if (app.page === 'reports') { title = 'گزارش‌ها'; crumb = 'گزارش‌های ترکیبی، خط زمانی و کارنامهٔ رسمی'; }
    else if (app.page === 'settings') { title = 'تنظیمات'; crumb = 'پوشهٔ مقصد، خروجی، تم و زمان‌بند'; }
    t.innerHTML = `<div><h1>${esc(title)}</h1><div class="crumb">${esc(crumb)}</div></div><div class="grow"></div>
      <label class="search">${icon('search')}<input type="search" placeholder="جست‌وجو در همهٔ داده‌ها… (شماره پرونده، پلاک، نام)" value="${esc(app.search)}" data-role="gsearch"></label>
      <button class="btn icon ghost" title="به‌روزرسانی داده‌ها" data-act="refresh">${icon('refresh')}</button>`;
    const inp = t.querySelector('[data-role=gsearch]');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { app.search = inp.value.trim(); go('search', app.search); } });
    t.querySelector('[data-act=refresh]').addEventListener('click', () => collectAll());
  }

  function renderStatus() {
    const f = app.el.railfoot; if (!f) return;
    const sess = S.hook.sessionExpired ? '<span class="dot err"></span>نشست تمام شد' : (app.siteState && app.siteState.page === 'loggedIn' ? '<span class="dot"></span>وارد شده' : '<span class="dot warn"></span>وارد نشده');
    const q = S.exporter.queue;
    const total = q.done + q.failed + q.items.length;
    const work = q.items.length || q.running ? `<div class="row"><span class="spin"></span><span>در حال گرفتن ${n(q.done + q.failed)} از ${n(total)}${q.paused ? ' (منتظر ورود)' : ''}</span></div><div class="qbar"><i style="width:${total ? Math.round(((q.done + q.failed) / total) * 100) : 0}%"></i></div>` : '';
    const svc = (S.bridge.last || {}).service || {};
    f.innerHTML = `<div class="row"><span>${sess}</span></div>${work}${svc.busy ? '<div class="row"><span class="spin"></span><span>در حال مرتب‌سازی فایل‌ها</span></div>' : ''}${app.lastCollect ? `<div class="row muted">آخرین گردآوری: <span class="num">${U.formatSystemDate(app.lastCollect)}</span></div>` : ''}`;
  }

  /* ---------- ورود ---------- */
  function saveLoginDraft() {
    const L = app.login, root = app.el.page; if (!root) return;
    const g = (f) => root.querySelector('[data-f=' + f + ']');
    const nat = g('nat'), otp = g('otp'), cap = g('cap'), rem = g('remember');
    if (nat && !nat.disabled) L.nationalCode = nat.value;
    if (otp) L.otpDraft = otp.value;
    if (cap) L.capDraft = cap.value;
    if (rem) L.remember = rem.checked;
    const a = document.activeElement;
    L.focus = a && a.dataset && a.dataset.f && root.contains(a) ? { f: a.dataset.f, s: a.selectionStart, e: a.selectionEnd } : null;
  }

  function renderLogin(box) {
    const L = app.login;
    const stt = app.siteState || {};
    const closed = stt.page === 'closed';
    const d = el(`<div class="login-wrap"><div class="login glass-strong">
      <div class="login-brand"><img src="نشان.png" alt="ثبت من" class="login-mark"><div class="login-name">ثبت من</div><div class="login-org">شرکت طلوع فردای ایرانیان</div></div>
      <h1>ورود به سامانه</h1>
      <div class="lead">کد ملی خود را بنویسید؛ کد یک‌بارمصرف به تلفن همراه شما ارسال می‌شود.</div>
      ${app.msg ? `<div class="msg ${app.msg.level}">${esc(app.msg.text)}</div>` : ''}
      ${closed ? '<div class="msg warn">سامانه در دسترس نیست (سامانه شب‌ها بسته است). بعداً دوباره بزنید.</div>' : ''}
      ${!app.siteReady ? '<div class="msg info"><span class="spin"></span> در حال اتصال به سامانه…</div>' : ''}
      <label class="lbl">کد ملی<input class="input ltr" data-f="nat" autocomplete="off" name="sm-nat" inputmode="numeric" maxlength="10" value="${esc(L.nationalCode)}" ${L.otpSent ? 'disabled' : ''}></label>
      ${L.needCaptcha && stt.captcha ? `<label class="lbl">تصویر امنیتی سامانه (عین تصویر را بنویسید)<div class="captcha"><img src="${esc(stt.captcha)}" alt="تصویر امنیتی"><input class="input ltr" data-f="cap" autocomplete="off" value="${esc(L.capDraft || '')}" style="max-width:180px"></div></label>` : ''}
      ${!L.otpSent ? `<label class="check"><input type="checkbox" data-f="remember" ${L.remember ? 'checked' : ''}> کد ملی مرا به خاطر بسپار</label><div class="row"><button class="btn pri" data-act="send" ${!app.siteReady || closed ? 'disabled' : ''}>ارسال کد</button></div>` : `
      <div class="msg ok">کد به تلفن همراه شما ارسال شد. <span data-role="cd"></span></div>
      <label class="lbl">کد پیامکی<input class="input ltr" data-f="otp" autocomplete="off" name="sm-otp" inputmode="numeric" maxlength="8" value="${esc(L.otpDraft || '')}"></label>
      <div class="row"><button class="btn pri" data-act="login">ورود</button><button class="btn" data-act="resend" data-role="resend" disabled>ارسال دوباره</button><button class="btn ghost" data-act="back">تغییر کد ملی</button></div>`}
    </div></div>`);
    box.appendChild(d);
    d.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'send' || b.dataset.act === 'resend') await sendCode(d);
      else if (b.dataset.act === 'login') await submitOtp(d);
      else if (b.dataset.act === 'back') { L.otpSent = false; L.needCaptcha = false; app.msg = null; stopCountdown(); go('login'); }
    });
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const btn = d.querySelector('[data-act=login]') || d.querySelector('[data-act=send]'); if (btn && !btn.disabled) btn.click(); } });
    if (L.otpSent) startCountdown(d);
    const fx = L.focus && d.querySelector('[data-f=' + L.focus.f + ']');
    const first = (fx && !fx.disabled ? fx : null) || d.querySelector('[data-f=otp]') || d.querySelector('[data-f=nat]');
    if (first && !first.disabled) { first.focus(); try { if (fx === first && L.focus.s != null) first.setSelectionRange(L.focus.s, L.focus.e); else if (first.value) first.setSelectionRange(first.value.length, first.value.length); } catch (e) { /* ادامه */ } }
  }

  function setMsg(level, text) { app.msg = text ? { level, text } : null; }

  function siteCall(name, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const cb = (msg) => { if (msg.event === 'ready') { off(); done(Object.assign({ reloaded: true }, msg.state || { page: 'unknown' })); } };
      const off = () => { const i = siteWaiters.indexOf(cb); if (i >= 0) siteWaiters.splice(i, 1); };
      siteWaiters.push(cb);
      S.hook.cmd(name, payload, timeoutMs).then((r) => { off(); done(r); }).catch((e) => { off(); if (!settled) { settled = true; reject(e); } });
    });
  }

  async function sendCode(d) {
    const L = app.login;
    const nat = d.querySelector('[data-f=nat]');
    if (nat) L.nationalCode = U.enDigits(nat.value).trim();
    const rem = d.querySelector('[data-f=remember]'); if (rem) L.remember = rem.checked;
    try { if (L.remember && /^\d{10}$/.test(L.nationalCode)) { localStorage.setItem('sm_remember', '1'); localStorage.setItem('sm_nat', L.nationalCode); } else if (!L.remember) { localStorage.removeItem('sm_remember'); localStorage.removeItem('sm_nat'); } } catch (e) { /* ادامه */ }
    if (!/^\d{10}$/.test(L.nationalCode)) { setMsg('err', 'کد ملی باید ۱۰ رقم باشد.'); return go('login'); }
    const capIn = d.querySelector('[data-f=cap]');
    const captcha = capIn ? capIn.value.trim() : null;
    setMsg('info', 'در حال اتصال به سامانه…'); go('login');
    try {
      let res = await siteCall('login', { nationalCode: L.nationalCode, captcha }, 30000);
      if (res.page === 'navigating') { await waitSiteReady(20000); res = await siteCall('login', { nationalCode: L.nationalCode, captcha }, 30000); }
      if (res.reloaded && res.page === 'login' && res.messages && res.messages.length) { setMsg('err', res.messages.join(' | ')); return go('login'); }
      app.siteState = res;
      if (res.error) { setMsg('err', res.error); return go('login'); }
      if (res.needCaptcha || res.wrongCaptcha) { L.needCaptcha = true; setMsg(res.wrongCaptcha ? 'err' : 'info', res.wrongCaptcha ? 'تصویر امنیتی نادرست بود؛ دوباره بنویسید.' : 'سامانه تصویر امنیتی می‌خواهد؛ آن را بنویسید و دوباره «ارسال کد» بزنید.'); return go('login'); }
      if (res.page === 'closed') { setMsg('warn', 'سامانه در دسترس نیست (سامانه شب‌ها بسته است).'); return go('login'); }
      if (res.page === 'otp') { L.otpSent = true; L.otpDraft = ''; L.focus = null; setMsg(null); return go('login'); }
      if (res.page === 'loggedIn') return afterLogin();
      setMsg('warn', 'پاسخ سامانه: ' + (res.messages && res.messages.length ? res.messages.join(' | ') : 'کادر کد پیامکی دیده نشد.'));
      go('login');
    } catch (e) { setMsg('err', 'خطا در اتصال به سامانه: ' + e.message); go('login'); }
  }

  async function submitOtp(d) {
    const otp = U.enDigits(d.querySelector('[data-f=otp]').value).trim();
    if (!otp) { setMsg('err', 'کد پیامکی را بنویسید.'); return go('login'); }
    setMsg('info', 'در حال ورود…'); go('login');
    try {
      const res = await siteCall('otp', { code: otp }, 30000);
      app.siteState = res;
      if (res.page === 'loggedIn') return afterLogin();
      const wrong = res.wrongCode || (res.messages || []).some((m) => /نادرست|اشتباه|نامعتبر|منقضی/.test(m));
      if (wrong) { setMsg('err', 'کد نادرست است.'); return go('login'); }
      if (res.page === 'navigating') { await waitSiteReady(20000); if (app.siteState && app.siteState.page === 'loggedIn') return afterLogin(); }
      setMsg('info', 'ورود پذیرفته شد؛ در حال باز شدن سامانه…'); go('login');
      if (await waitLoggedIn(25000)) return afterLogin();
      setMsg('warn', res.messages && res.messages.length ? res.messages.join(' | ') : 'ورود انجام نشد؛ دوباره تلاش کنید.');
      go('login');
    } catch (e) { setMsg('err', 'خطا در ورود: ' + e.message); go('login'); }
  }

  function startCountdown(d) {
    stopCountdown();
    let left = 120;
    const cd = d.querySelector('[data-role=cd]'), rs = d.querySelector('[data-role=resend]');
    const tick = () => { if (!cd) return; if (left > 0) { cd.textContent = `(ارسال دوباره تا ${n(left)} ثانیه)`; left--; } else { cd.textContent = ''; if (rs) rs.disabled = false; stopCountdown(); } };
    tick();
    app.countdown = setInterval(tick, 1000);
  }
  function stopCountdown() { if (app.countdown) clearInterval(app.countdown); app.countdown = null; }

  function waitSiteReady(ms) {
    return new Promise((resolve) => {
      app.siteReady = false;
      const t = setTimeout(() => { off(); resolve(false); }, ms);
      const cb = (msg) => { if (msg.event === 'ready') { clearTimeout(t); off(); resolve(true); } };
      const off = () => { const i = siteWaiters.indexOf(cb); if (i >= 0) siteWaiters.splice(i, 1); };
      siteWaiters.push(cb);
    });
  }
  async function waitLoggedIn(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { const s = await S.hook.cmd('state', {}, 4000); if (s) { app.siteState = s; if (s.page === 'loggedIn') return true; } } catch (e) { /* در حال بارگذاری */ }
      await U.sleep(1000);
    }
    return false;
  }

  /* ---------- پس از ورود: گردآوری پشت پرده ---------- */
  async function afterLogin() {
    if (app.collecting && !app.collecting.done) return;
    stopCountdown();
    app.login.otpSent = false; app.login.needCaptcha = false; app.login.otpDraft = ''; app.login.capDraft = ''; app.login.focus = null; setMsg(null);
    S.hook.sessionExpired = false;
    S.exporter.resumeQueue();
    await collectAll();
  }

  function executiveHave() {
    const docs = st().state.sections.get('/executive/documents');
    if (!docs) return [];
    return [...new Set(docs.records.map((r) => String(r.flat.caseNo) + '|' + String(r.flat.caseSubNo)))];
  }

  async function collectAll(keys) {
    const plan = S.siteMap.collectPlan().filter((p) => !keys || keys.includes(p.key));
    app.collecting = { items: plan.map((p) => ({ key: p.key, label: p.label, step: 'در صف' })), done: false, error: null, startedAt: Date.now() };
    go('collecting');
    const remaining = () => app.collecting.items.filter((i) => i.step !== 'انجام شد' && i.step !== 'یافت نشد').map((i) => i.key);
    for (let attempt = 0; attempt < 4 && remaining().length; attempt++) {
      try {
        await S.hook.cmd('collect', { sections: remaining(), have: executiveHave() }, 1200000);
      } catch (e) {
        if (e.code === 'SESSION_EXPIRED' || S.hook.sessionExpired) { setMsg('warn', 'نشست تمام شد؛ دوباره وارد شوید. گردآوری از همان‌جا ادامه می‌یابد.'); app.collecting.done = true; app.lastCollect = app.lastCollect || Date.now(); return go('login'); }
        const ok = await waitSiteReady(20000);
        if (!ok) { app.collecting.error = e.message; break; }
      }
    }
    // گام دوم: فهرست گزارش‌های رسمی و پیوست‌های هر مدرک اجرایی (پشت پرده، با سرعت تطبیقی) + روند/پیوست بخش‌های دیگر
    const docs = st().state.sections.get('/executive/documents');
    if (docs) S.exporter.enqueueTyped(docs, docs.records, null);
    for (const sec of st().sectionList()) { if (S.siteMap.sectionFor(sec.path)) continue; S.exporter.enqueueChildren(sec, sec.records, 'روند'); S.exporter.enqueueChildren(sec, sec.records, 'پیوست‌ها'); }
    app.collecting.done = true;
    app.lastCollect = Date.now();
    go('dashboard');
    toast('گردآوری داده‌ها انجام شد.');
  }

  function renderCollecting(box) {
    const c = app.collecting || { items: [] };
    const done = c.items.filter((i) => i.step === 'انجام شد' || i.step === 'یافت نشد').length;
    const pct = c.items.length ? Math.round((done / c.items.length) * 100) : 0;
    const secOf = (key) => { const s = S.siteMap.byId(key); return s ? st().state.sections.get(s.path) : null; };
    const d = el(`<div class="collect card glass-strong">
      <div class="login-brand" style="margin-bottom:6px"><img src="نشان.png" alt="" class="login-mark" style="height:120px;margin-bottom:-26px"><div class="login-name" style="font-size:2em">ثبت من</div></div>
      <h2 style="justify-content:center">در حال گردآوری داده‌ها <span class="spin"></span></h2>
      <div class="muted" style="text-align:center">برنامه پشت پرده به بخش‌های سامانه سر می‌زند و همهٔ داده‌ها را می‌خواند؛ چند لحظه صبر کنید.</div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <ul class="plist">${c.items.map((i) => { const sec = secOf(i.key); const extra = i.key === 'executive-cases' && i.total ? ` · پروندهٔ ${n(i.page)} از ${n(i.total)}` : (i.page ? ' · صفحهٔ ' + n(i.page) : ''); return `<li><span>${esc(i.label)}</span><span class="st">${esc(i.step)}${extra}${i.note ? ' — ' + esc(i.note) : ''}</span><span class="n">${n(sec ? sec.records.length : (i.count || 0))} رکورد</span></li>`; }).join('')}</ul>
      ${c.error ? `<div class="msg err" style="margin-top:10px">${esc(c.error)}</div><div style="margin-top:8px"><button class="btn" data-act="skip">ادامه با داده‌های گرفته‌شده</button></div>` : ''}
    </div>`);
    box.appendChild(d);
    d.addEventListener('click', (e) => { if (e.target.closest('[data-act=skip]')) { app.collecting.done = true; app.lastCollect = Date.now(); go('dashboard'); } });
  }

  /* ---------- زمان‌بند خودکار ---------- */
  function setupScheduler() {
    if (app.timer) clearInterval(app.timer);
    const min = Number(st().state.settings.autoRefreshMin) || 0;
    if (!min) return;
    app.timer = setInterval(() => {
      if (S.hook.sessionExpired || !(app.siteState && app.siteState.page === 'loggedIn')) return;
      if (app.collecting && !app.collecting.done) return;
      if (app.page === 'login' || app.page === 'collecting') return;
      collectAll();
    }, min * 60000);
  }

  /* ---------- جست‌وجوی سراسری ---------- */
  function renderSearch(box, q) {
    q = (q || '').trim();
    const list = st().sectionList();
    const hits = [];
    for (const sec of list) for (const r of S.reports.filterRecords(sec, sec.records, { q })) hits.push({ sec, r });
    const d = el(`<div class="page"><div class="card"><h2>${icon('search')} نتیجهٔ جست‌وجو برای «${esc(q)}» <span class="tail">${n(hits.length)} مورد</span></h2>
      ${hits.length ? `<div class="list-rows">${hits.slice(0, 200).map((h, i) => { const known = S.siteMap.sectionFor(h.sec.path); const stt = known && known.status ? h.r.flat[known.status] : null; return `<div class="r" data-i="${i}"><span class="badge muted">${esc(st().labelFor(h.sec.path))}</span><span class="w">${esc(st().caseNameOf(h.sec, h.r))}</span><span>${stt ? UI.badge(stt) : ''}</span></div>`; }).join('')}</div>` : '<div class="empty">چیزی پیدا نشد.</div>'}
    </div></div>`);
    box.appendChild(d);
    d.addEventListener('click', (e) => { const r = e.target.closest('.r'); if (!r) return; const h = hits[+r.dataset.i]; S.ui.openRecord(h.sec, h.r); });
  }

  /* ---------- راه‌اندازی ---------- */
  function start() {
    app.el.page = $('[data-role=page]');
    app.el.nav = $('[data-role=nav]');
    app.el.topbar = $('[data-role=topbar]');
    app.el.railfoot = $('[data-role=railfoot]');
    S.bridge.install();
    S.hook.install();
    S.hook.on('capture', (cap) => { try { st().ingest(cap); } catch (e) { console.error('[ثبت من] ingest', e); } });
    S.hook.on('file', (f) => { try { st().ingestFile(f); } catch (e) { console.error('[ثبت من] file', e); } });
    S.hook.on('session', (ev) => {
      if (ev.expired) { setMsg('warn', 'نشست تمام شد؛ دوباره وارد شوید. کارهای در صف پس از ورود ادامه می‌یابد.'); app.login.otpSent = false; app.siteState = null; if (app.page !== 'login') go('login'); }
      else { S.exporter.resumeQueue(); }
      renderStatus();
    });
    S.hook.onSite((msg) => {
      if (msg.event === 'ready') {
        const wasReady = app.siteReady, prevPage = app.siteState && app.siteState.page;
        app.siteReady = true; app.siteState = msg.state || app.siteState;
        for (const cb of [...siteWaiters]) cb(msg);
        if (app.page === 'login' && !app.login.otpSent) {
          if (msg.state && msg.state.page === 'loggedIn' && !app.lastCollect) afterLogin();
          else if (!wasReady || prevPage !== (app.siteState && app.siteState.page)) go('login');
        }
      } else if (msg.event === 'progress' && app.collecting) {
        const it = app.collecting.items.find((i) => i.key === msg.progress.key);
        if (it) Object.assign(it, msg.progress);
        if (app.page === 'collecting') go('collecting');
      }
    });
    S.bridge.onMessage((msg) => { if (msg.type === 'state' || msg.type === 'dest') { renderStatus(); if (msg.type === 'dest' && app.page === 'settings') go('settings'); } if (msg.type === 'log' && msg.level === 'err') toast(msg.text, 'err'); });
    st().subscribe((what, payload) => {
      renderStatus();
      if (what === 'section' || what === 'child' || what === 'file') { renderNav(); if (app.page === 'dashboard' || app.page === 'collecting' || app.page === 'section') scheduleRerender(); }
    });
    S.exporter.onQueue(renderStatus);
    app.el.nav.addEventListener('click', (e) => {
      const b = e.target.closest('[data-nav]'); if (!b) return;
      const k = b.dataset.nav;
      if (k === 'refresh') collectAll();
      else if (k === 'logout') logout();
      else if (k === 'dashboard' || k === 'reports' || k === 'settings') go(k);
      else go('section', k);
    });
    applyAppearance();
    setupScheduler();
    go('login');
    S.bridge.requestState();
    S.hook.cmd('state', {}, 8000).then((stt) => { if (!app.siteReady) { app.siteReady = true; app.siteState = stt; if (app.page === 'login') { if (stt && stt.page === 'loggedIn' && !app.lastCollect) afterLogin(); else go('login'); } } }).catch(() => {});
  }

  function logout() {
    S.bridge.post({ type: 'logout' });
    app.lastCollect = null; app.siteState = null; app.login.otpSent = false; app.login.needCaptcha = false; setMsg('info', 'از حساب خارج شدید.');
    S.exporter.pauseQueue();
    go('login');
  }

  let rerenderTimer = null;
  function scheduleRerender() { clearTimeout(rerenderTimer); rerenderTimer = setTimeout(() => { if (app.page === 'section' && S.ui.refreshSection) S.ui.refreshSection(); else if (app.page === 'dashboard' || app.page === 'collecting') go(app.page, app.arg); }, 400); }

  S.ui.pages = Object.assign(S.ui.pages || {}, { login: renderLogin, collecting: renderCollecting, search: renderSearch });
  S.app = { start, go, collectAll, applyAppearance, setupScheduler, logout, state: app, setMsg, toast };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(window.SabtMan = window.SabtMan || {});
