/* خودکارسازی سمتِ سایت (پشت پرده): ورود (کد ملی → ارسال کد → کد پیامکی)، تشخیص وضعیت صفحه (ورود/کد/کپچا/واردشده/بسته)،
   ناوبری به بخش‌ها و بازکردن «گزارشات»/«پیوست‌ها»ی نخستین ردیف تا الگو یاد گرفته شود، و صفحه‌بندی.
   انتخابگرها از window.__sabtmanSiteConfig (فایل پیکربندی-سایت.json کنار exe) می‌آیند تا بی کامپایل دوباره اصلاح شوند.
   هیچ کد ملی/رمزی ذخیره نمی‌شود؛ فقط همان لحظه در فیلد سایت گذاشته می‌شود. هیچ دورزدنی نیست (کپچا را خود کاربر می‌نویسد). */
(function (S) {
  'use strict';
  const U = S.util;

  const DEFAULTS = {
    loginUrl: '',                                   // خالی = /usr/login همان سایت
    portalPath: '/portal',
    loginPathPrefix: '/usr/',                       // صفحهٔ ورود my.ssaa.ir: /usr/login (کدملی + رمز پویا در یک صفحه)
    loggedInTexts: ['خروج', 'پروفایل', 'املاک من'],     // در DOM سربرگ/منو (حتی اگر پنهان باشد) — همراه با توکن
    tokenKey: 'token',                               // my.ssaa.ir پس از ورود توکن را در localStorage.token می‌گذارد
    nationalInput: ['input[name="username"]', 'input[name*="national" i]', 'input[id*="national" i]', 'input[name*="meli" i]', 'input[placeholder*="ملی"]', 'input[aria-label*="ملی"]', 'input[formcontrolname*="national" i]'],
    sendCodeButton: ['ارسال کد', 'ارسال رمز', 'دریافت کد', 'دریافت رمز', 'ارسال'],
    otpInput: ['input[name="password"]', 'input[name*="otp" i]', 'input[id*="otp" i]', 'input[name*="code" i]', 'input[formcontrolname*="code" i]', 'input[placeholder*="کد"]', 'input[placeholder*="رمز"]', 'input[autocomplete="one-time-code"]'],
    loginButton: ['ورود به درگاه', 'تایید', 'تأیید'],
    captchaImage: ['img[src*="captcha" i]', 'img[alt*="امنیتی"]', 'img[alt*="captcha" i]', '.captcha img', 'img[src^="data:image"][class*="captcha" i]'],
    captchaInput: ['input[name*="captcha" i]', 'input[id*="captcha" i]', 'input[placeholder*="امنیتی"]', 'input[formcontrolname*="captcha" i]'],
    messageBox: ['.toast', '.alert', '[role="alert"]', '.swal2-html-container', '.mat-snack-bar-container', '.error', '.text-danger', '.invalid-feedback'],
    closedTexts: ['در دسترس نیست', 'خارج از ساعت', 'بسته است', 'تعمیرات'],
    wrongCodeTexts: ['نادرست', 'اشتباه', 'نامعتبر', 'منقضی'],
    nextPage: ['button[aria-label*="next" i]', 'li.pagination-next a', 'a[aria-label*="Next" i]', '.pagination .next a', 'button.next'],
    nextPageTexts: ['بعدی', '›', '»', 'Next'],
    reportButtonTexts: ['گزارشات', 'گزارش'],
    attachButtonTexts: ['پیوست‌ها', 'پیوستها', 'پیوست', 'ضمائم'],
    attachDownloadTexts: ['دانلود', 'دریافت', 'مشاهده فایل', 'نمایش فایل'],
    maxPages: 30,
    sections: [
      { key: 'estate', label: 'املاک من', path: '/portal/estate/list-estate', menu: ['املاک من', 'املاک'] },
      { key: 'ssar', label: 'اسناد رسمی من', path: '/portal/ssar/my-documents', menu: ['اسناد رسمی من', 'اسناد رسمی'] },
      { key: 'sset', label: 'وقایع ازدواج و طلاق من', path: '', menu: ['وقایع ازدواج و طلاق', 'ازدواج و طلاق'] },
      { key: 'companies', label: 'شرکت‌های من', path: '', menu: ['شرکت‌های من', 'شرکتهای من', 'شرکت‌ها'] },
      { key: 'ilenc', label: 'شناسه‌های ثبت موقت', path: '/portal/ilenc/temp-issues', menu: ['شناسه‌های ثبت موقت', 'ثبت موقت'] },
      { key: 'mechLetter', label: 'وضعیت مکاتبات', path: '/portal/mechLetter/status-viwe', menu: ['وضعیت مکاتبات', 'مکاتبات'] },
      { key: 'profile', label: 'پروفایل', path: '', menu: ['پروفایل', 'حساب کاربری', 'مشخصات'] },
    ],
  };

  function cfg() { return Object.assign({}, DEFAULTS, window.__sabtmanSiteConfig || {}); }
  const c0 = cfg;
  const sleep = U.sleep;
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();

  function visible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && el.offsetParent !== null;
  }
  function q(selectors) {
    for (const sel of [].concat(selectors)) {
      try { const list = document.querySelectorAll(sel); for (const el of list) if (visible(el)) return el; } catch (e) { /* انتخابگر بد */ }
    }
    return null;
  }
  function byText(texts, tags) {
    tags = tags || 'button, a, [role="button"], input[type="submit"], input[type="button"], .btn';
    const wanted = [].concat(texts).map(norm);
    const nodes = [...document.querySelectorAll(tags)].filter(visible);
    for (const w of wanted) {
      const exact = nodes.find((n) => norm(n.value || n.textContent) === w);
      if (exact) return exact;
    }
    for (const w of wanted) {
      const part = nodes.find((n) => norm(n.value || n.textContent).includes(w));
      if (part) return part;
    }
    return null;
  }

  /** مقداردهی فیلد به روشی که فریم‌ورک‌های SPA (Angular/React) می‌فهمند */
  function setValue(input, value) {
    input.focus();
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    input.blur();
  }

  function messages() {
    const c = cfg();
    const out = [];
    for (const sel of c.messageBox) { try { document.querySelectorAll(sel).forEach((el) => { if (visible(el)) { const t = norm(el.textContent); if (t) out.push(t); } }); } catch (e) { /* ادامه */ } }
    return [...new Set(out)].slice(0, 5);
  }

  function captchaDataUrl() {
    const img = q(cfg().captchaImage);
    if (!img) return null;
    if (/^data:/.test(img.src)) return img.src;
    try {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth || img.width; cv.height = img.naturalHeight || img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      return cv.toDataURL('image/png');
    } catch (e) { return img.src; }
  }

  /** وضعیت صفحه برای رابط برنامه */
  function detectState() {
    const c = cfg();
    const body = norm(document.body ? document.body.innerText.slice(0, 20000) : '');
    const nat = q(c.nationalInput), otp = q(c.otpInput), cap = q(c.captchaInput);
    const closed = c.closedTexts.some((t) => body.includes(t));
    const onLoginPath = location.pathname.startsWith(c.loginPathPrefix || '/usr/');
    const all = norm(document.body ? document.body.textContent.slice(0, 80000) : '');
    const evidence = (c.loggedInTexts || []).some((t) => all.includes(norm(t)));
    let hasToken = false; try { hasToken = !c.tokenKey || Boolean(localStorage.getItem(c.tokenKey)); } catch (e) { /* ادامه */ }
    let page = 'unknown';
    if (closed && !nat && !otp) page = 'closed';
    else if (nat) page = 'login';
    else if (otp) page = 'otp';
    else if (!onLoginPath && evidence && hasToken) page = 'loggedIn';   // فقط با نشانهٔ واقعی ورود؛ صفحهٔ در حال بارگذاری «واردشده» شمرده نمی‌شود
    return { page, url: location.href, path: location.pathname, captcha: cap ? captchaDataUrl() : null, messages: messages(), title: document.title, sample: page === 'unknown' ? body.slice(0, 300) : '' };
  }

  async function waitFor(pred, timeoutMs, stepMs) {
    const end = Date.now() + (timeoutMs || 8000);
    while (Date.now() < end) { try { const v = pred(); if (v) return v; } catch (e) { /* ادامه */ } await sleep(stepMs || 200); }
    return null;
  }

  /** گام ۱: کد ملی (+ کپچا اگر بود) → «ارسال کد» */
  async function startLogin(nationalCode, captcha) {
    const c = cfg();
    if (!q(c.nationalInput)) {
      const url = c.loginUrl || location.origin + '/usr/login';
      if (location.href !== url) { location.href = url; return { page: 'navigating', url }; }
    }
    const nat = await waitFor(() => q(c.nationalInput), 10000);
    if (!nat) return Object.assign(detectState(), { error: 'کادر کد ملی در صفحهٔ سایت پیدا نشد؛ پیکربندی-سایت.json را تنظیم کنید.' });
    setValue(nat, U.enDigits(nationalCode));
    const capIn = q(c.captchaInput);
    if (capIn) {
      if (!captcha) return Object.assign(detectState(), { needCaptcha: true });
      setValue(capIn, captcha);
    }
    const btn = byText(c.sendCodeButton);
    if (!btn) return Object.assign(detectState(), { error: 'دکمهٔ «ارسال کد» پیدا نشد.' });
    btn.click();
    // در my.ssaa.ir پس از ارسال، دکمه غیرفعال می‌شود و «اعتبار N ثانیه» می‌نویسد؛ کادر رمز پویا در همان صفحه است
    const sent = await waitFor(() => { const t = norm(btn.value || btn.textContent); if (btn.disabled || /disabled/.test(btn.className) || /اعتبار|ثانیه/.test(t)) return 'sent'; return messages().length ? 'msg' : null; }, 10000);
    await sleep(400);
    const st = detectState();
    st.wrongCaptcha = st.messages.some((m) => /امنیتی|کپچا|captcha/i.test(m));
    const bad = st.messages.some((m) => /نامعتبر|نادرست|اشتباه|خطا|یافت نشد|مجاز نیست|ثبت ?‌?نام/.test(m));
    if (!st.wrongCaptcha && !bad && q(c.otpInput) && (sent === 'sent' || st.messages.some((m) => /ارسال/.test(m)))) st.page = 'otp';
    return st;
  }

  /** گام ۲: کد پیامکی → «ورود» */
  async function submitOtp(code) {
    const c = cfg();
    const otp = q(c.otpInput);
    if (!otp) return Object.assign(detectState(), { error: 'کادر کد پیامکی پیدا نشد.' });
    setValue(otp, U.enDigits(code));
    const btn = byText(c.loginButton);
    if (btn) btn.click(); else otp.form && otp.form.requestSubmit ? otp.form.requestSubmit() : otp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => !location.pathname.startsWith(c.loginPathPrefix || '/usr/') || messages().length, 15000);
    await waitFor(() => detectState().page === 'loggedIn' || (messages().length && !messages().some((m) => /خوش ?‌?آمد|موفق/.test(m))), 12000);
    await sleep(500);
    const st = detectState();
    st.wrongCode = st.messages.some((m) => c.wrongCodeTexts.some((t) => m.includes(t)));
    return st;
  }

  /** مانند byText ولی بدون شرط پیدا بودن (زیرمنوهای بسته) و فقط تطبیق دقیق */
  function byTextAny(texts, tags) {
    const wanted = [].concat(texts).map(norm);
    const nodes = [...document.querySelectorAll(tags || 'a, button, [role="menuitem"]')];
    for (const w of wanted) { const el = nodes.find((n) => norm(n.textContent) === w); if (el) return el; }
    return null;
  }

  /** ناوبری درون‌برنامه‌ای SPA (بدون بارگذاری کامل): مسیر شناخته‌شده اول، وگرنه کلیک روی منو (حتی زیرمنوی بسته) */
  async function goSection(sec) {
    const before = S.hook.exportDiscovery().درخواست‌ها.length;
    if (sec.path) {
      if (location.pathname === sec.path) { history.pushState({}, '', c0().portalPath); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); await sleep(600); }
      history.pushState({}, '', sec.path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    } else {
      const menu = byTextAny(sec.menu) || byText(sec.menu, 'a, button, li, span, [role="menuitem"], [role="link"]');
      if (!menu) return { ok: false, reason: 'منو پیدا نشد' };
      menu.click();
    }
    // منتظر درخواست تازهٔ سایت
    const got = await waitFor(() => S.hook.exportDiscovery().درخواست‌ها.length > before, 12000, 300);
    await sleep(1500);
    return { ok: Boolean(got) };
  }

  async function learnRowLinks() {
    const c = cfg();
    const out = { report: false, attach: false };
    const rep = byText(c.reportButtonTexts);
    if (rep) { rep.click(); out.report = true; await sleep(2500); await closeDialogs(); }
    const att = byText(c.attachButtonTexts);
    if (att) {
      att.click(); out.attach = true; await sleep(2500);
      // یک بار دانلود نخستین پیوست تا الگوی گرفتن فایل یاد گرفته شود (فایل در حافظه می‌ماند؛ روی دیسک نمی‌رود)
      const dl = byText(c.attachDownloadTexts);
      if (dl) { dl.click(); out.file = true; await sleep(2500); }
      await closeDialogs();
    }
    return out;
  }

  async function closeDialogs() {
    const close = byText(['بستن', 'انصراف', '×', 'Close'], 'button, a, [role="button"]');
    if (close) { close.click(); await sleep(400); }
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  async function paginate(onPage) {
    const c = cfg();
    for (let i = 1; i < c.maxPages; i++) {
      const next = q(c.nextPage) || byText(c.nextPageTexts);
      if (!next || next.disabled || /disabled/.test(next.className) || (next.parentElement && /disabled/.test(next.parentElement.className))) return i;
      const before = S.hook.exportDiscovery().درخواست‌ها.reduce((n, d) => n + d.count, 0);
      next.click();
      const more = await waitFor(() => S.hook.exportDiscovery().درخواست‌ها.reduce((n, d) => n + d.count, 0) > before, 8000, 300);
      if (!more) return i;   // صفحه‌بندی سمت مرورگر: همهٔ ردیف‌ها از پیش در یک پاسخ آمده است
      await sleep(800);
      if (onPage) onPage(i + 1);
    }
    return c.maxPages;
  }

  /* ---------- گردآوری بر پایهٔ نقشهٔ سایت (site-map) ----------
     هر بخش: رفتن به صفحهٔ بخش در SPA → صبر تا پاسخ فهرست → (صفحه‌های بعدی با API) → یادگیری کلیدهای هر ردیف (یک بار روی ردیف نخست).
     بخش اجرای اسناد رسمی: پس از فهرست پرونده‌ها، مدارک و رخدادهای هر پرونده مستقیم با API همان نشست گرفته می‌شود. */

  const captures = new Map();     // مسیر → آخرین پاسخ
  let capSeq = 0;
  function watchCaptures() {
    if (watchCaptures.done) return; watchCaptures.done = true;
    S.hook.on('capture', (cap) => { captures.set(cap.path, Object.assign({ seq: ++capSeq }, cap)); });
  }

  function goPath(p) {
    if (location.pathname === p) { history.pushState({}, '', cfg().portalPath); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); }
    history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }

  async function waitCapture(path, sinceSeq, timeoutMs) {
    return waitFor(() => { const c = captures.get(path); return c && c.seq > sinceSeq ? c : null; }, timeoutMs || 15000, 250);
  }

  function dataOf(cap) { const env = U.readEnvelope(cap.json); return env.isEnvelope ? env.data : cap.json; }
  function listOf(data, listKey) { if (Array.isArray(data)) return data; if (data && listKey && Array.isArray(data[listKey])) return data[listKey]; return []; }

  /** یادگیری کلیدهای هر ردیف: یک بار روی ردیف نخست (پاسخ‌ها به رابط می‌رسند و به رکورد وصل می‌شوند) */
  async function learnRowActions(plan) {
    const out = [];
    for (const text of plan.rowActions || []) {
      const btn = byText([text], 'table tbody tr button, table tbody tr a, table tbody tr [role="button"]');
      if (!btn) continue;
      const before = capSeq;
      btn.click();
      await waitFor(() => capSeq > before, 5000, 250);
      await sleep(800);
      out.push(text);
      await closeDialogs();
      if (location.pathname !== plan.page) { goPath(plan.page); await sleep(2500); }
    }
    return out;
  }

  /** مدارک و رخدادهای هر پروندهٔ اجرایی — مستقیم با API (بی کلیک) */
  async function collectExecutive(cases, have, p, onProgress) {
    const skip = new Set(have || []);
    let n = 0;
    for (const c of cases) {
      const key = String(c.no) + '|' + String(c.subNo);
      n++;
      if (skip.has(key)) continue;
      p.step = 'مدارک پرونده'; p.page = n; p.total = cases.length; if (onProgress) onProgress(p);
      await S.hook.api('/executive/getcasedocuments', { caseNo: c.no, caseSubNo: c.subNo });
      p.done = (p.done || 0) + 1;
      await sleep(rateDelay());
    }
  }

  /* سرعت تطبیقی سبک برای فراخوانی‌های پیاپی (بند ۱۰): با پاسخ سالم کم می‌شود، با خطا زیاد */
  const rate = { delay: 700, min: 250, max: 8000 };
  function rateDelay() { rate.delay = Math.max(rate.min, Math.round(rate.delay * 0.9)); return rate.delay; }
  function rateBackoff() { rate.delay = Math.min(rate.max, Math.round(rate.delay * 2.5)); return rate.delay; }

  /** گردآوری بخش‌ها. keys: شناسه‌های بخش (نقشهٔ سایت) یا خالی = همه؛ opts.have: کلید پرونده‌های اجرایی که مدارکشان پیش‌تر گرفته شده */
  async function collect(keys, onProgress, opts) {
    opts = opts || {};
    watchCaptures();
    const plans = (S.siteMap ? S.siteMap.collectPlan() : []).filter((pl) => !keys || !keys.length || keys.includes(pl.key));
    const result = [];
    for (const plan of plans) {
      const p = { key: plan.key, label: plan.label, step: 'ناوبری' };
      if (onProgress) onProgress(p);
      try {
        const before = capSeq;
        goPath(plan.page);
        const cap = await waitCapture(plan.api, before, 15000);
        if (!cap) { p.step = 'یافت نشد'; p.note = 'پاسخ فهرست نرسید'; result.push(p); if (onProgress) onProgress(p); continue; }
        p.step = 'خواندن'; if (onProgress) onProgress(p);
        let data = dataOf(cap);
        let rows = listOf(data, plan.list);
        p.count = rows.length;
        // صفحه‌های بعدی (اگر سایت صفحه‌بندی سمت سرور دارد)
        if (plan.paged && cap.requestBody) {
          const body = S.siteMap.parseBody(cap.requestBody);
          const size = Number(body.pageSize) || plan.paged.pageSize || 100;
          const total = data && plan.paged.total ? Number(data[plan.paged.total]) : null;
          let page = Number(body.pageIndex) || 1;
          while ((total !== null ? page * size < total : rows.length === size) && page < 50) {
            page++;
            p.step = 'صفحهٔ ' + page; if (onProgress) onProgress(p);
            const r = await S.hook.api(plan.api, Object.assign({}, body, { pageIndex: page }));
            const more = listOf(dataOf({ json: r.json }), plan.list);
            rows = rows.concat(more);
            p.count = rows.length;
            if (!more.length) break;
            await sleep(rateDelay());
          }
        }
        if (plan.deep === 'executive') await collectExecutive(rows.map((r) => ({ no: r.no, subNo: r.subNo })), opts.have, p, onProgress);
        if (plan.rowActions && plan.rowActions.length && rows.length && !opts.noLearn) {
          p.step = 'یادگیری کلیدها'; if (onProgress) onProgress(p);
          if (location.pathname !== plan.page) { goPath(plan.page); await sleep(2500); }
          p.learned = await learnRowActions(plan);
        }
        p.step = 'انجام شد';
      } catch (e) {
        if (e && e.code === 'SESSION_EXPIRED') { p.step = 'نشست تمام شد'; result.push(p); if (onProgress) onProgress(p); throw e; }
        rateBackoff();
        p.step = 'خطا'; p.note = String(e && e.message || e);
      }
      if (onProgress) onProgress(p);
      result.push(p);
    }
    return result;
  }

  /** یک بخش با کلیک روی منو (پشتیبان برای بخش‌های ناشناخته) */
  async function goSectionByMenu(menuTexts) {
    const menu = byTextAny(menuTexts) || byText(menuTexts, 'a, button, li, span, [role="menuitem"], [role="link"]');
    if (!menu) return false;
    menu.click();
    await sleep(1500);
    return true;
  }

  async function clickText(text) {
    const el = byText([text], '*');
    if (!el) return false;
    el.click();
    await sleep(500);
    return true;
  }

  S.auto = { cfg, detectState, startLogin, submitOtp, collect, collectExecutive, goPath, goSection, goSectionByMenu, learnRowLinks, learnRowActions, paginate, clickText, setValue, byText, DEFAULTS };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
