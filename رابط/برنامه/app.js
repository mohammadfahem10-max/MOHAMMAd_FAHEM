/* صفحه‌های خودِ برنامه (WebView2ِ دیدنی): ورود (کد ملی → ارسال کد → کد پیامکی)، گردآوری پشت پرده، پیشخوان، بخش‌ها، گزارش‌ها، تنظیمات.
   کاربر هرگز سایت را نمی‌بیند؛ همهٔ کار با سایتِ پنهان از راه پوسته (S.hook = remote-hook) انجام می‌شود. */
(function (S) {
  'use strict';
  const U = S.util;
  const esc = U.escapeHtml;
  const n = U.faDigits;
  const st = () => S.store;

  const SECTIONS = [
    { key: 'estate', label: 'املاک من', module: 'estate' },
    { key: 'ssar', label: 'اسناد رسمی من', module: 'ssar' },
    { key: 'sset', label: 'وقایع ازدواج و طلاق من', module: 'sset' },
    { key: 'companies', label: 'شرکت‌های من', module: 'companies' },
    { key: 'ilenc', label: 'شناسه‌های ثبت موقت', module: 'ilenc' },
    { key: 'mechLetter', label: 'وضعیت مکاتبات', module: 'mechletter' },
    { key: 'profile', label: 'پروفایل', module: 'profile' },
  ];

  const app = {
    page: 'login', siteState: null, siteReady: false, collecting: null, lastCollect: null, countdown: null, msg: null,
    login: { nationalCode: '', captcha: null, needCaptcha: false, otpSent: false },
    el: { page: null, nav: null, status: null },
  };

  /* ---------- تم و نوشتار (بخش ۹: فقط سکو، نوشتار، رنگ‌ها، تم‌ها از میزبان) ---------- */

  const FALLBACK_THEMES = {
    'طلوع': {},
    'روشن': { '--base': '#F5F7FB', '--b1': '#DCE4F5', '--b2': '#E9E1F7', '--b3': '#E0EEF8', '--b4': '#F4E6F3' },
    'تیره': { '--base': '#141A2A', '--b1': '#1F2A44', '--b2': '#2A2340', '--b3': '#1B2A3E', '--b4': '#2E2238', '--tx': '#E9EDF7', '--tx2': '#BAC3DA', '--tx3': '#8B95B0', '--glass': 'rgba(20,26,42,.56)', '--glass-2': 'rgba(24,31,50,.78)', '--glass-3': 'rgba(30,38,60,.92)', '--edge': 'rgba(255,255,255,.08)', '--line': 'rgba(255,255,255,.08)', '--line-2': 'rgba(255,255,255,.16)', '--hover': 'rgba(255,255,255,.05)', 'color-scheme': 'dark' },
  };

  function themeNames() {
    if (window.THEMES) return Array.isArray(window.THEMES) ? window.THEMES.map((t) => t.name || t.id || String(t)) : Object.keys(window.THEMES);
    return Object.keys(FALLBACK_THEMES);
  }

  function applyTheme(name) {
    const roots = [document.documentElement, document.getElementById('sabtman-root')].filter(Boolean);
    if (window.Theme && typeof window.Theme.apply === 'function') { try { window.Theme.apply(name); } catch (e) { console.error(e); } }
    else {
      const vars = FALLBACK_THEMES[name] || {};
      for (const root of roots) {
        for (const k of Object.keys(FALLBACK_THEMES['تیره'])) root.style.removeProperty(k);
        for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
      }
    }
    if (roots[1]) { // متغیرهای :root را روی پنل هم ببر
      const cs = getComputedStyle(document.documentElement);
      for (const k of ['--base', '--b1', '--b2', '--b3', '--b4', '--ac', '--ac2', '--tx', '--tx2', '--tx3', '--glass', '--glass-2', '--glass-3', '--edge', '--line', '--line-2', '--hover', '--fs']) {
        const v = cs.getPropertyValue(k); if (v) roots[1].style.setProperty(k, v);
      }
    }
  }

  function applyFontSize(px) {
    document.documentElement.style.setProperty('--fs', px + 'px');
    const p = document.getElementById('sabtman-root'); if (p) p.style.fontSize = Math.round(px * 0.82) + 'px';
  }

  function applyAppearance() {
    const s = st().state.settings;
    applyTheme(s.theme || 'طلوع');
    applyFontSize(Number(s.fontSize) || 17);
  }

  /* ---------- ناوبری ---------- */

  const NAV = [['dashboard', 'پیشخوان'], ['sections', 'بخش‌ها'], ['reports', 'گزارش‌ها'], ['settings', 'تنظیمات']];

  function renderNav() {
    const loggedIn = app.page !== 'login' && app.page !== 'collecting' || app.lastCollect;
    let html = '';
    if (loggedIn) {
      for (const [k, l] of NAV) html += `<button data-nav="${k}" class="${app.page === k || (k === 'sections' && app.page === 'section') ? 'on' : ''}">${l}</button>`;
      html += `<button data-nav="refresh" title="گردآوری دوباره پشت پرده">به‌روزرسانی داده‌ها</button><button data-nav="logout" class="warn">خروج از حساب</button>`;
    }
    app.el.nav.innerHTML = html;
  }

  function renderStatus() {
    const sh = S.bridge.last || {};
    const svc = sh.service || {};
    const sess = S.hook.sessionExpired ? '<span class="dot err"></span>نشست تمام شد' : (app.siteState && app.siteState.page === 'loggedIn' ? '<span class="dot"></span>وارد شده' : '<span class="dot warn"></span>وارد نشده');
    const q = S.exporter.queue;
    const work = q.items.length || q.running ? ` · در حال گرفتن ${n(q.done + q.failed)}/${n(q.done + q.failed + q.items.length)}` : (svc.busy ? ' · در حال مرتب‌سازی' : '');
    app.el.status.innerHTML = `<span>${sess}</span><span>${work}</span><span title="${esc(sh.dest || '')}">${sh.dest ? 'مقصد: ' + esc(String(sh.dest).split(/[\\/]/).slice(-2).join('/')) : ''}</span>`;
  }

  function go(page, arg) {
    app.page = page;
    renderNav();
    const el = app.el.page;
    const panelRoot = document.getElementById('sabtman-root');
    if (panelRoot) panelRoot.style.display = page === 'section' ? '' : 'none';
    for (const c of [...el.children]) if (c.id !== 'sabtman-host') c.remove();
    if (page === 'login') renderLogin();
    else if (page === 'collecting') renderCollecting();
    else if (page === 'dashboard') renderDashboard();
    else if (page === 'sections') renderSections();
    else if (page === 'section') { if (!panelRoot) mountPanel(); S.panel.show(arg); }
    else if (page === 'reports') renderReports();
    else if (page === 'settings') renderSettings();
    renderStatus();
  }

  function mountPanel() {
    let host = document.getElementById('sabtman-host');
    if (!host) { host = document.createElement('div'); host.id = 'sabtman-host'; host.className = 'ap-section'; app.el.page.appendChild(host); }
    S.panel.mount({ embedded: true, container: host });
    applyAppearance();
  }

  function card(html) { const d = document.createElement('div'); d.className = 'ap-page'; d.innerHTML = html; app.el.page.appendChild(d); return d; }

  /* ---------- صفحهٔ ۱: ورود ---------- */

  function renderLogin() {
    const L = app.login;
    const stt = app.siteState || {};
    const closed = stt.page === 'closed';
    const d = card(`<div class="ap-login ap-card">
      <h1>ورود به ثبت من</h1>
      <div class="lead">کد ملی خود را بنویسید؛ کد یک‌بارمصرف به تلفن همراه شما فرستاده می‌شود. هیچ اطلاعات ورودی ذخیره نمی‌شود.</div>
      ${app.msg ? `<div class="ap-msg ${app.msg.level}">${esc(app.msg.text)}</div>` : ''}
      ${closed ? `<div class="ap-msg warn">سامانه در دسترس نیست (سامانه شب‌ها بسته است). بعداً دوباره بزنید.</div>` : ''}
      ${!app.siteReady ? `<div class="ap-msg info">در حال اتصال به سامانه…</div>` : ''}
      <label>کد ملی</label>
      <input class="ap-input ltr" data-f="nat" inputmode="numeric" maxlength="10" value="${esc(L.nationalCode)}" ${L.otpSent ? 'disabled' : ''} autofocus>
      ${L.needCaptcha && stt.captcha ? `<label>تصویر امنیتی سامانه (عین تصویر را بنویسید)</label><div class="ap-captcha"><img src="${esc(stt.captcha)}" alt="تصویر امنیتی"><input class="ap-input ltr" data-f="cap" style="max-width:180px"></div>` : ''}
      ${!L.otpSent ? `<div class="row"><button class="ap-btn pri" data-act="send" ${!app.siteReady || closed ? 'disabled' : ''}>ارسال کد</button></div>` : `
      <div class="ap-msg ok">کد به تلفن همراه شما فرستاده شد. <span data-role="cd"></span></div>
      <label>کد پیامکی</label>
      <input class="ap-input ltr" data-f="otp" inputmode="numeric" maxlength="8" autofocus>
      <div class="row"><button class="ap-btn pri" data-act="login">ورود</button><button class="ap-btn" data-act="resend" data-role="resend" disabled>ارسال دوباره</button><button class="ap-btn" data-act="back">تغییر کد ملی</button></div>`}
    </div>`);
    d.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'send' || b.dataset.act === 'resend') await sendCode(d);
      else if (b.dataset.act === 'login') await submitOtp(d);
      else if (b.dataset.act === 'back') { L.otpSent = false; L.needCaptcha = false; app.msg = null; stopCountdown(); go('login'); }
    });
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const btn = d.querySelector('[data-act=login]') || d.querySelector('[data-act=send]'); if (btn && !btn.disabled) btn.click(); } });
    if (L.otpSent) startCountdown(d);
    const first = d.querySelector('[data-f=otp]') || d.querySelector('[data-f=nat]');
    if (first) first.focus();
  }

  function setMsg(level, text) { app.msg = text ? { level, text } : null; }

  /** فرمان به سایت پنهان که ممکن است صفحهٔ سایت را کامل بارگذاری کند (فرم معمولی): هرکدام زودتر رسید — پاسخ فرمان یا «ready» تازه */
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
      if (res.page === 'otp') { L.otpSent = true; setMsg(null); return go('login'); }
      if (res.page === 'loggedIn') return afterLogin();
      setMsg('warn', 'پاسخ سامانه: ' + (res.messages && res.messages.length ? res.messages.join(' | ') : 'کادر کد پیامکی دیده نشد. پیکربندی-سایت.json را بررسی کنید.'));
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
  const siteWaiters = [];

  /* ---------- پس از ورود: گردآوری پشت پرده ---------- */

  async function afterLogin() {
    stopCountdown();
    app.login.otpSent = false; app.login.needCaptcha = false; setMsg(null);
    S.hook.sessionExpired = false;
    await collectAll();
  }

  async function collectAll(keys) {
    app.collecting = { items: SECTIONS.filter((s) => !keys || keys.includes(s.key)).map((s) => ({ key: s.key, label: s.label, step: 'در صف' })), done: false, error: null };
    go('collecting');
    const remaining = () => app.collecting.items.filter((i) => i.step !== 'انجام شد' && i.step !== 'یافت نشد').map((i) => i.key);
    for (let attempt = 0; attempt < 4 && remaining().length; attempt++) {
      try {
        await S.hook.cmd('collect', { sections: remaining() }, 600000);
      } catch (e) {
        if (e.code === 'SESSION_EXPIRED') { setMsg('warn', 'نشست تمام شد؛ دوباره وارد شوید.'); return go('login'); }
        // بارگذاری کامل صفحهٔ سایت: پس از «ready» ادامه
        const ok = await waitSiteReady(20000);
        if (!ok) { app.collecting.error = e.message; break; }
      }
    }
    // یادگیری الگوها انجام شده؛ اکنون روند و پیوست‌های همهٔ رکوردها در صف — بخش‌های سنگین‌تر اول (بخش ۱۰-۳)
    const secs = st().sectionList().sort((a, b) => b.records.length - a.records.length);
    for (const sec of secs) { S.exporter.enqueueChildren(sec, sec.records, 'روند'); S.exporter.enqueueChildren(sec, sec.records, 'پیوست‌ها'); }
    app.collecting.done = true;
    app.lastCollect = Date.now();
    go('dashboard');
  }

  function renderCollecting() {
    const c = app.collecting || { items: [] };
    const done = c.items.filter((i) => i.step === 'انجام شد' || i.step === 'یافت نشد').length;
    const pct = c.items.length ? Math.round((done / c.items.length) * 100) : 0;
    card(`<div class="ap-card" style="max-width:640px;margin:6vh auto 0">
      <h2>در حال گردآوری داده‌ها</h2>
      <div class="ap-muted">برنامه پشت پرده به بخش‌های سامانه سر می‌زند و همهٔ داده‌ها را می‌خواند؛ چند لحظه صبر کنید.</div>
      <div class="ap-bar"><i style="width:${pct}%"></i></div>
      <ul class="ap-progress">${c.items.map((i) => { const sec = sectionFor(i.key); return `<li><span>${esc(i.label)}</span><span class="st">${esc(i.step)}${i.page ? ' · صفحهٔ ' + n(i.page) : ''}</span><span class="n">${n(sec ? sec.records.length : 0)} رکورد</span></li>`; }).join('')}</ul>
      ${c.error ? `<div class="ap-msg err">${esc(c.error)}</div><button class="ap-btn" data-act="skip">ادامه با داده‌های گرفته‌شده</button>` : ''}
    </div>`).addEventListener('click', (e) => { if (e.target.closest('[data-act=skip]')) { app.collecting.done = true; app.lastCollect = Date.now(); go('dashboard'); } });
  }

  function sectionFor(key) {
    const spec = SECTIONS.find((s) => s.key === key);
    if (!spec) return null;
    const list = st().sectionList().filter((s) => s.module === spec.module);
    return list.sort((a, b) => b.records.length - a.records.length)[0] || null;
  }

  /* ---------- صفحهٔ ۲: پیشخوان ---------- */

  function renderDashboard() {
    const tiles = SECTIONS.map((spec) => {
      const sec = sectionFor(spec.key);
      const all = st().sectionList().filter((s) => s.module === spec.module);
      if (!sec) return `<div class="ap-tile empty"><h3>${esc(spec.label)}</h3><div class="ap-muted">داده‌ای گرفته نشده است.</div><div class="acts"><button class="ap-btn sm" data-collect="${spec.key}">گردآوری این بخش</button></div></div>`;
      const total = all.reduce((a, s) => a + s.records.length, 0);
      const chips = (sec.counters || []).slice(0, 2).flatMap((c) => c.values.slice(0, 5).map((v) => `<span class="chip">${esc(v.label)} <b>${n(v.count)}</b></span>`)).join('');
      return `<div class="ap-tile"><h3>${esc(spec.label)}</h3><div class="big">${n(total)} داده</div><div class="chips">${chips}</div>
        <div class="ap-muted">آخرین به‌روزرسانی: ${esc(U.formatSystemDate(sec.lastTs))}${sec.timelines.size ? ` · روند: ${n(sec.timelines.size)}` : ''}</div>
        <div class="acts"><button class="ap-btn sm pri" data-view="${esc(sec.path)}">مشاهده</button><button class="ap-btn sm" data-dl="${esc(sec.path)}">دانلود همه</button>${all.length > 1 ? all.filter((s) => s !== sec).map((s) => `<button class="ap-btn sm" data-view="${esc(s.path)}">${esc(st().labelFor(s.path))}</button>`).join('') : ''}</div></div>`;
    }).join('');
    const others = st().sectionList().filter((s) => !SECTIONS.some((spec) => spec.module === s.module));
    const d = card(`<div class="ap-grid">${tiles}${others.map((s) => `<div class="ap-tile"><h3>${esc(st().labelFor(s.path))}</h3><div class="big">${n(s.records.length)} داده</div><div class="acts"><button class="ap-btn sm pri" data-view="${esc(s.path)}">مشاهده</button><button class="ap-btn sm" data-dl="${esc(s.path)}">دانلود همه</button></div></div>`).join('')}</div>`);
    d.addEventListener('click', async (e) => {
      const v = e.target.closest('[data-view]'); if (v) return go('section', v.dataset.view);
      const c = e.target.closest('[data-collect]'); if (c) return collectAll([c.dataset.collect]);
      const dl = e.target.closest('[data-dl]');
      if (dl) { const sec = st().state.sections.get(dl.dataset.dl); go('section', sec.path); const btn = document.querySelector('#sabtman-root [data-act=dl-all]'); if (btn) btn.click(); }
    });
  }

  function renderSections() {
    const list = st().sectionList();
    const d = card(`<div class="ap-card"><h2>بخش‌ها</h2>${list.length ? `<div class="ap-grid">${list.map((s) => `<div class="ap-tile"><h3>${esc(st().labelFor(s.path))}</h3><div class="big">${n(s.records.length)}</div><div class="acts"><button class="ap-btn sm pri" data-view="${esc(s.path)}">مشاهده</button></div></div>`).join('')}</div>` : '<div class="ap-muted">هنوز بخشی گردآوری نشده است.</div>'}</div>`);
    d.addEventListener('click', (e) => { const v = e.target.closest('[data-view]'); if (v) go('section', v.dataset.view); });
  }

  function renderReports() {
    const list = st().sectionList();
    const d = card(`<div class="ap-card"><h2>گزارش‌های رخداد و روند</h2><div class="ap-muted">برای هر بخش: جدول کامل، خط زمانی، مدت مراحل، جریان وضعیت، شمارش‌ها، روزانه/ماهانه/ساعتی، معطل‌ها، رویت‌نشده‌ها، تازه‌ها. خروجی PDF رسمی + md + Excel.</div><div class="ap-grid" style="margin-top:12px">${list.map((s) => `<div class="ap-tile"><h3>${esc(st().labelFor(s.path))}</h3><div class="ap-muted">رکورد: ${n(s.records.length)} · دارای روند: ${n(s.timelines.size)}</div><div class="acts"><button class="ap-btn sm pri" data-rep="${esc(s.path)}">نمایش گزارش</button><button class="ap-btn sm" data-repdl="${esc(s.path)}">ذخیرهٔ PDF + Excel</button></div></div>`).join('') || '<div class="ap-muted">هنوز داده‌ای نیست.</div>'}</div></div>`);
    d.addEventListener('click', (e) => {
      const r = e.target.closest('[data-rep]'); if (r) { if (!document.getElementById('sabtman-root')) mountPanel(); document.getElementById('sabtman-root').style.display = ''; S.panel.openReport(st().state.sections.get(r.dataset.rep)); }
      const dl = e.target.closest('[data-repdl]'); if (dl) { const job = S.exporter.buildReportJob(st().state.sections.get(dl.dataset.repdl)); S.exporter.sendJob(job.entries, job.manifest); toast('بستهٔ گزارش فرستاده شد؛ در پوشهٔ مقصد مرتب می‌شود.'); }
    });
  }

  function renderSettings() {
    const s = st().state.settings;
    const sh = S.bridge.last || {};
    const d = card(`<div class="ap-card"><h2>تنظیمات</h2><div class="ap-form">
      <div class="full"><label>پوشهٔ مقصد خروجی</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><code class="path" data-role="dest">${esc(sh.dest || '—')}</code><button class="ap-btn sm" data-act="browse">انتخاب پوشهٔ مقصد…</button><button class="ap-btn sm" data-act="open">باز کردن پوشهٔ مقصد</button></div></div>
      <label>حالت پیش‌فرض خروجی<select data-k="mode"><option value="pdf+text" ${s.mode === 'pdf+text' ? 'selected' : ''}>PDF + متن</option><option value="pdf" ${s.mode === 'pdf' ? 'selected' : ''}>فقط PDF</option><option value="text" ${s.mode === 'text' ? 'selected' : ''}>فقط متن</option></select></label>
      <label>تم<select data-k="theme">${themeNames().map((t) => `<option ${(s.theme || 'طلوع') === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label>اندازهٔ نوشته (پیکسل)<input type="number" data-k="fontSize" min="13" max="24" value="${s.fontSize || 17}"></label>
      <label>فاصلهٔ بین درخواست‌ها (میلی‌ثانیه)<input type="number" data-k="delayMs" value="${s.delayMs}" min="100"></label>
      <label>آستانهٔ «معطل» (روز)<input type="number" data-k="pendingDays" value="${s.pendingDays}" min="1"></label>
      <label>آستانهٔ «تازه» (روز)<input type="number" data-k="recentDays" value="${s.recentDays}" min="1"></label>
      <div class="full ap-muted">سرویس فایل: ${sh.service && sh.service.running ? 'در حال اجرا' : 'اجرا نشده'}${sh.service && sh.service.browser ? ' · چاپ PDF با: ' + esc(sh.service.browser) : ''}</div>
      <div class="full" style="display:flex;gap:8px"><button class="ap-btn pri" data-act="save">ذخیره</button><button class="ap-btn" data-act="advanced">تنظیمات پیشرفتهٔ بخش‌ها</button><button class="ap-btn" data-act="map">ذخیرهٔ نقشهٔ بخش‌ها</button></div>
    </div></div>`);
    d.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'browse') S.bridge.browseDest();
      else if (a.dataset.act === 'open') S.bridge.openDest();
      else if (a.dataset.act === 'advanced') { if (!document.getElementById('sabtman-root')) mountPanel(); document.getElementById('sabtman-root').style.display = ''; S.panel.openSettings(); }
      else if (a.dataset.act === 'map') { await S.hook.refreshDiscovery(); S.exporter.downloadText(U.safeFileName(`نقشهٔ بخش‌ها ${U.formatSystemDate().replace(/[:\/]/g, '-')}.json`), JSON.stringify(S.hook.exportDiscovery(), null, 2), 'application/json'); toast('نقشهٔ بخش‌ها (بدون داده) در «خروجی‌های دیگر» ذخیره شد.'); }
      else if (a.dataset.act === 'save') {
        d.querySelectorAll('[data-k]').forEach((el) => st().setSetting(el.dataset.k, el.type === 'number' ? Number(el.value) : el.value));
        S.bridge.setConfig({ mode: st().state.settings.mode });
        applyAppearance(); toast('ذخیره شد.'); go('settings');
      }
    });
  }

  let toastEl = null, toastTimer = null;
  function toast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.style.cssText = 'position:fixed;bottom:22px;right:22px;background:var(--glass-3);border:1px solid var(--edge);box-shadow:var(--shadow);border-radius:var(--r2);padding:10px 14px;max-width:420px;z-index:99999'; document.body.appendChild(toastEl); }
    toastEl.textContent = text; toastEl.style.display = '';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, 5000);
  }

  /* ---------- راه‌اندازی ---------- */

  function start() {
    app.el.page = document.querySelector('[data-role=page]');
    app.el.nav = document.querySelector('[data-role=nav]');
    app.el.status = document.querySelector('[data-role=status]');
    S.bridge.install();
    S.hook.install();
    S.hook.on('capture', (cap) => { try { st().ingest(cap); } catch (e) { console.error('[ثبت من] ingest', e); } });
    S.hook.on('file', (f) => { try { st().ingestFile(f); } catch (e) { console.error('[ثبت من] file', e); } });
    S.hook.on('session', (ev) => {
      if (ev.expired) { setMsg('warn', 'نشست تمام شد؛ دوباره وارد شوید. کارهای در صف پس از ورود ادامه می‌یابد.'); app.login.otpSent = false; go('login'); }
      else { S.exporter.resumeQueue(); }
      renderStatus();
    });
    S.hook.onSite((msg) => {
      if (msg.event === 'ready') {
        app.siteReady = true; app.siteState = msg.state || app.siteState;
        for (const cb of [...siteWaiters]) cb(msg);
        if (app.page === 'login' && !app.login.otpSent) {
          if (msg.state && msg.state.page === 'loggedIn' && !app.lastCollect) afterLogin();
          else go('login');
        }
      } else if (msg.event === 'progress' && app.collecting) {
        const it = app.collecting.items.find((i) => i.key === msg.progress.key);
        if (it) Object.assign(it, msg.progress);
        if (app.page === 'collecting') go('collecting');
      }
    });
    S.bridge.onMessage((msg) => { if (msg.type === 'state' || msg.type === 'dest') { renderStatus(); if (msg.type === 'dest' && app.page === 'settings') go('settings'); } });
    st().subscribe(() => { renderStatus(); if (app.page === 'dashboard' || app.page === 'collecting') scheduleRerender(); });
    S.exporter.onQueue(renderStatus);
    app.el.nav.addEventListener('click', (e) => {
      const b = e.target.closest('[data-nav]'); if (!b) return;
      const k = b.dataset.nav;
      if (k === 'refresh') collectAll();
      else if (k === 'logout') { S.bridge.post({ type: 'logout' }); app.lastCollect = null; app.siteState = null; app.login = { nationalCode: '', captcha: null, needCaptcha: false, otpSent: false }; setMsg('info', 'از حساب خارج شدید.'); go('login'); }
      else go(k);
    });
    applyAppearance();
    go('login');
    S.bridge.requestState();
    // اگر سایت پنهان زودتر از رابط بارگذاری شده باشد، وضعیتش را بپرس
    S.hook.cmd('state', {}, 8000).then((stt) => { if (!app.siteReady) { app.siteReady = true; app.siteState = stt; if (app.page === 'login') { if (stt && stt.page === 'loggedIn' && !app.lastCollect) afterLogin(); else go('login'); } } }).catch(() => {});
  }

  let rerenderTimer = null;
  function scheduleRerender() { clearTimeout(rerenderTimer); rerenderTimer = setTimeout(() => go(app.page), 250); }

  S.app = { start, go, collectAll, SECTIONS, applyTheme, state: app };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(window.SabtMan = window.SabtMan || {});
