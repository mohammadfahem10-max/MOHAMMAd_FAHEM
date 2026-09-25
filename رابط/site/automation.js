/* خودکارسازی سمتِ سایت (پشت پرده): ورود (کد ملی → ارسال کد → کد پیامکی)، تشخیص وضعیت صفحه (ورود/کد/کپچا/واردشده/بسته)،
   ناوبری به بخش‌ها و بازکردن «گزارشات»/«پیوست‌ها»ی نخستین ردیف تا الگو یاد گرفته شود، و صفحه‌بندی.
   انتخابگرها از window.__sabtmanSiteConfig (فایل پیکربندی-سایت.json کنار exe) می‌آیند تا بی کامپایل دوباره اصلاح شوند.
   هیچ کد ملی/رمزی ذخیره نمی‌شود؛ فقط همان لحظه در فیلد سایت گذاشته می‌شود. هیچ دورزدنی نیست (کپچا را خود کاربر می‌نویسد). */
(function (S) {
  'use strict';
  const U = S.util;

  const DEFAULTS = {
    loginUrl: '',                                   // خالی = ریشهٔ همان سایت
    portalPath: '/portal',
    nationalInput: ['input[name*="national" i]', 'input[id*="national" i]', 'input[name*="meli" i]', 'input[placeholder*="ملی"]', 'input[aria-label*="ملی"]', 'input[formcontrolname*="national" i]'],
    sendCodeButton: ['ارسال کد', 'ارسال رمز', 'دریافت کد', 'دریافت رمز', 'ارسال'],
    otpInput: ['input[name*="otp" i]', 'input[id*="otp" i]', 'input[name*="code" i]', 'input[formcontrolname*="code" i]', 'input[placeholder*="کد"]', 'input[placeholder*="رمز"]', 'input[autocomplete="one-time-code"]'],
    loginButton: ['ورود', 'تایید', 'تأیید', 'ادامه'],
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
    let page = 'unknown';
    if (closed && !nat && !otp) page = 'closed';
    else if (otp && !nat) page = 'otp';
    else if (nat) page = 'login';
    else if (location.pathname.startsWith(c.portalPath) && !nat) page = 'loggedIn';
    return { page, url: location.href, captcha: cap ? captchaDataUrl() : null, messages: messages(), title: document.title };
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
      const url = c.loginUrl || location.origin + '/';
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
    await waitFor(() => q(c.otpInput) || messages().length, 8000);
    await sleep(400);
    const st = detectState();
    st.wrongCaptcha = st.messages.some((m) => /امنیتی|کپچا|captcha/i.test(m));
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
    await waitFor(() => location.pathname.startsWith(c.portalPath) || messages().length, 10000);
    await sleep(500);
    const st = detectState();
    st.wrongCode = st.messages.some((m) => c.wrongCodeTexts.some((t) => m.includes(t)));
    return st;
  }

  /** ناوبری درون‌برنامه‌ای SPA (بدون بارگذاری کامل) یا کلیک روی منو */
  async function goSection(sec) {
    const before = S.hook.exportDiscovery().درخواست‌ها.length;
    const menu = byText(sec.menu, 'a, button, li, span, [role="menuitem"], [role="link"]');
    if (menu) menu.click();
    else if (sec.path) {
      history.pushState({}, '', sec.path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    } else return { ok: false, reason: 'منو پیدا نشد' };
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
      await waitFor(() => S.hook.exportDiscovery().درخواست‌ها.reduce((n, d) => n + d.count, 0) > before, 8000, 300);
      await sleep(800);
      if (onPage) onPage(i + 1);
    }
    return c.maxPages;
  }

  /** گردآوری یک یا چند بخش (پشت پرده). sections: کلیدهای بخش یا خالی = همه */
  async function collect(keys, onProgress) {
    const c = cfg();
    const list = c.sections.filter((s) => !keys || !keys.length || keys.includes(s.key));
    const result = [];
    for (const sec of list) {
      const p = { key: sec.key, label: sec.label, step: 'ناوبری' };
      if (onProgress) onProgress(p);
      const nav = await goSection(sec);
      p.step = nav.ok ? 'خواندن' : 'یافت نشد';
      if (onProgress) onProgress(p);
      if (nav.ok) {
        const learned = await learnRowLinks();
        p.step = 'صفحه‌بندی'; if (onProgress) onProgress(p);
        p.pages = await paginate((n) => { p.page = n; if (onProgress) onProgress(p); });
        p.learned = learned;
        p.step = 'انجام شد';
      }
      if (onProgress) onProgress(p);
      result.push(p);
    }
    return result;
  }

  async function clickText(text) {
    const el = byText([text], '*');
    if (!el) return false;
    el.click();
    await sleep(500);
    return true;
  }

  S.auto = { cfg, detectState, startLogin, submitOtp, collect, goSection, learnRowLinks, paginate, clickText, setValue, byText, DEFAULTS };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
