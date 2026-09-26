/* قلاب fetch/XHR — کشف خودکار بخش‌ها و گرفتن پاکت {Success/Data} از درخواست‌های خودِ سایت.
   هیچ آدرسی ثابت نیست؛ هرچه سایت بخواند، همان گرفته می‌شود. داده هرگز از رایانه بیرون نمی‌رود. */
(function (S) {
  'use strict';
  const U = S.util;

  const listeners = { capture: [], file: [], session: [] };
  const discovery = [];          // نقشهٔ کشف‌شده: فقط مسیر ماسک‌شده + نام فیلدها (بدون مقدار)
  const discoveryIndex = new Map();
  let originalFetch = null;
  let installed = false;
  let sessionExpired = false;
  let lastHeaders = {};           // سرآیندهای آخرین درخواست خودِ سایت به همان مبدأ (احراز هویت، نوع محتوا) — برای بازپخش

  function on(event, cb) { (listeners[event] || (listeners[event] = [])).push(cb); }
  function emit(event, payload) {
    for (const cb of listeners[event] || []) {
      try { cb(payload); } catch (e) { console.error('[ثبت من] listener', e); }
    }
  }

  /** شِمای مقدار: فقط نام فیلد + نوع (هیچ مقداری برنمی‌گردد) */
  function schema(v, d) {
    d = d || 0;
    if (d > 4) return typeof v;
    if (Array.isArray(v)) return v.length ? ['len' + v.length, schema(v[0], d + 1)] : [];
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).slice(0, 80)) o[k] = schema(v[k], d + 1);
      return o;
    }
    return typeof v;
  }

  function normalizeUrl(input) {
    try {
      if (typeof input === 'string') return new URL(input, location.href).href;
      if (input && typeof input.url === 'string') return new URL(input.url, location.href).href;
      if (input instanceof URL) return input.href;
    } catch (e) { /* ادامه */ }
    return String(input || '');
  }

  /** مسیر ماسک‌شده (بدون origin؛ پارامترهای query فقط نام) */
  function pathKey(url) {
    try {
      const u = new URL(url, location.href);
      const ps = [...u.searchParams.keys()];
      return U.maskPath(u.pathname) + (ps.length ? '?' + ps.join('&') : '');
    } catch (e) {
      return U.maskPath(String(url).split('#')[0]);
    }
  }

  function bodyToString(body) {
    if (body === null || body === undefined) return null;
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const o = {};
      body.forEach((v, k) => { o[k] = typeof v === 'string' ? v : '[file]'; });
      return JSON.stringify({ __formData: o });
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return null;
    try { return JSON.stringify(body); } catch (e) { return null; }
  }

  function headersToObject(h) {
    const out = {};
    if (!h) return out;
    try {
      if (typeof Headers !== 'undefined' && h instanceof Headers) h.forEach((v, k) => { out[k.toLowerCase()] = v; });
      else if (Array.isArray(h)) for (const [k, v] of h) out[String(k).toLowerCase()] = String(v);
      else for (const k of Object.keys(h)) out[k.toLowerCase()] = String(h[k]);
    } catch (e) { /* ادامه */ }
    return out;
  }

  function recordDiscovery(method, url, json, isBinary, contentType) {
    const path = pathKey(url);
    const key = method + ' ' + path;
    if (discoveryIndex.has(key)) {
      discoveryIndex.get(key).count++;
      return;
    }
    if (discovery.length >= 300) return;
    const item = { m: method, path, keys: json ? schema(json, 0) : null, binary: Boolean(isBinary), type: contentType || '', count: 1 };
    discovery.push(item);
    discoveryIndex.set(key, item);
  }

  function isLoginRedirect(finalUrl) {
    return /login|signin|auth|ورود/i.test(String(finalUrl || '')) && !/logout/i.test(String(finalUrl || ''));
  }

  /** پردازش یک پاسخ (مشترک بین fetch و XHR) */
  function handleResponse(info) {
    // info: {method, url, finalUrl, status, contentType, text?, bytes?, requestHeaders, requestBody, disposition, ts}
    const method = String(info.method || 'GET').toUpperCase();
    const ct = String(info.contentType || '').toLowerCase();
    try {
      const h = info.requestHeaders || {};
      if (h.authorization && String(info.url).startsWith(location.origin)) lastHeaders = Object.assign({}, h);
    } catch (e) { /* ادامه */ }
    if (info.status === 401 || info.status === 403 || (info.status >= 300 && info.status < 400 && isLoginRedirect(info.finalUrl)) ||
        (info.finalUrl && info.finalUrl !== info.url && isLoginRedirect(info.finalUrl))) {
      markSessionExpired(info);
      return;
    }
    if (info.text !== undefined && info.text !== null) {
      let json = null;
      const t = info.text.trim();
      if (t && (t[0] === '{' || t[0] === '[')) {
        try { json = JSON.parse(t); } catch (e) { json = null; }
      }
      if (json === null) {
        if (ct.includes('text/html') && /(<form[^>]*login|name=["']password["']|رمز\s*یکبار|کد\s*ملی)/i.test(t) && !ct.includes('json')) {
          markSessionExpired(info);
        }
        recordDiscovery(method, info.url, null, false, ct);
        return;
      }
      recordDiscovery(method, info.url, json, false, ct);
      if (sessionExpired) { sessionExpired = false; emit('session', { expired: false }); }
      emit('capture', {
        method, url: info.url, path: pathKey(info.url), status: info.status, json, ts: info.ts || Date.now(),
        requestHeaders: info.requestHeaders || {}, requestBody: info.requestBody ?? null, contentType: ct,
      });
      return;
    }
    if (info.bytes) {
      recordDiscovery(method, info.url, null, true, ct);
      const name = U.fileNameFromDisposition(info.disposition) || U.fileNameFromUrl(info.url);
      emit('file', {
        method, url: info.url, path: pathKey(info.url), status: info.status, bytes: info.bytes, contentType: ct,
        fileName: name, requestHeaders: info.requestHeaders || {}, requestBody: info.requestBody ?? null, ts: info.ts || Date.now(),
      });
    }
  }

  function markSessionExpired(info) {
    if (!sessionExpired) {
      sessionExpired = true;
      emit('session', { expired: true, url: info && info.url, status: info && info.status });
    }
  }

  function isTextLike(ct) {
    ct = String(ct || '').toLowerCase();
    return !ct || ct.includes('json') || ct.includes('text/') || ct.includes('javascript') || ct.includes('xml');
  }

  /** نصب قلاب‌ها (یک بار) */
  function install() {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    originalFetch = window.fetch.bind(window);
    const ofetch = window.fetch;

    window.fetch = async function (input, init) {
      const startedAt = Date.now();
      const url = normalizeUrl(input);
      let method = (init && init.method) || (input && input.method) || 'GET';
      let requestHeaders = headersToObject(init && init.headers);
      if (!Object.keys(requestHeaders).length && input && input.headers) requestHeaders = headersToObject(input.headers);
      let requestBody = bodyToString(init && init.body);
      if (requestBody === null && input && typeof input.clone === 'function' && input.method && input.method !== 'GET') {
        try { requestBody = await input.clone().text(); } catch (e) { requestBody = null; }
      }
      const res = await ofetch.apply(this, arguments);
      try {
        const ct = res.headers.get('content-type') || '';
        const disposition = res.headers.get('content-disposition') || '';
        const clone = res.clone();
        const base = { method, url, finalUrl: res.url, status: res.status, contentType: ct, requestHeaders, requestBody, disposition, ts: startedAt };
        if (isTextLike(ct) && !disposition.toLowerCase().includes('attachment')) {
          clone.text().then((text) => handleResponse({ ...base, text })).catch(() => {});
        } else {
          clone.arrayBuffer().then((buf) => handleResponse({ ...base, bytes: new Uint8Array(buf) })).catch(() => {});
        }
      } catch (e) { /* قلاب هرگز نباید سایت را بشکند */ }
      return res;
    };

    const XP = XMLHttpRequest.prototype;
    const oOpen = XP.open, oSend = XP.send, oSetHeader = XP.setRequestHeader;
    XP.open = function (method, url) {
      this.__sm = { method: method || 'GET', url: normalizeUrl(url), headers: {}, ts: Date.now() };
      return oOpen.apply(this, arguments);
    };
    XP.setRequestHeader = function (k, v) {
      try { if (this.__sm) this.__sm.headers[String(k).toLowerCase()] = String(v); } catch (e) { /* ادامه */ }
      return oSetHeader.apply(this, arguments);
    };
    XP.send = function (body) {
      const x = this;
      const meta = x.__sm || { method: 'GET', url: '', headers: {}, ts: Date.now() };
      meta.body = bodyToString(body);
      x.addEventListener('load', function () {
        try {
          const ct = x.getResponseHeader('content-type') || '';
          const disposition = x.getResponseHeader('content-disposition') || '';
          const base = {
            method: meta.method, url: meta.url, finalUrl: x.responseURL, status: x.status, contentType: ct,
            requestHeaders: meta.headers, requestBody: meta.body, disposition, ts: meta.ts,
          };
          const rt = x.responseType;
          if (rt === '' || rt === 'text') handleResponse({ ...base, text: x.responseText });
          else if (rt === 'json') handleResponse({ ...base, text: JSON.stringify(x.response) });
          else if (rt === 'arraybuffer') handleResponse({ ...base, bytes: new Uint8Array(x.response) });
          else if (rt === 'blob' && x.response) {
            x.response.arrayBuffer().then((buf) => handleResponse({ ...base, bytes: new Uint8Array(buf) })).catch(() => {});
          }
        } catch (e) { /* ادامه */ }
      });
      return oSend.apply(this, arguments);
    };
  }

  /**
   * بازپخش یک درخواست در همان نشست کاربر (برای گرفتن «گزارشات»/«پیوست‌ها» هر رکورد).
   * خروجی: {status, json?, bytes?, fileName?, contentType}
   */
  /** سرآیندهای احراز هویت جاری سایت (از آخرین درخواست خودِ سایت؛ وگرنه توکن localStorage) */
  function authHeaders() {
    const h = Object.assign({}, lastHeaders);
    if (!h.authorization) {
      try { const t = localStorage.getItem('token'); if (t) h.authorization = 'Bearer ' + t.replace(/^"|"$/g, ''); } catch (e) { /* ادامه */ }
    }
    return h;
  }

  async function replay(req, opts) {
    opts = opts || {};
    const f = originalFetch || window.fetch;
    const headers = Object.assign({}, req.headers || {});
    delete headers['content-length'];
    if (!headers.authorization) { const a = authHeaders(); if (a.authorization) headers.authorization = a.authorization; }
    if (!headers['content-type'] && req.body && (req.method || 'GET') !== 'GET') headers['content-type'] = /^\s*[{[]/.test(String(req.body)) ? 'application/json' : 'application/x-www-form-urlencoded';
    if (!headers.accept) headers.accept = 'application/json, text/plain, */*';
    const init = { method: req.method || 'GET', headers, credentials: 'include' };
    if (req.body !== null && req.body !== undefined && init.method !== 'GET' && init.method !== 'HEAD') init.body = req.body;
    const res = await f(req.url, init);
    const ct = res.headers.get('content-type') || '';
    const disposition = res.headers.get('content-disposition') || '';
    if (res.status === 401 || res.status === 403 || (res.url && res.url !== req.url && isLoginRedirect(res.url))) {
      markSessionExpired({ url: req.url, status: res.status });
      const err = new Error('SESSION_EXPIRED');
      err.code = 'SESSION_EXPIRED';
      throw err;
    }
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.code = 'HTTP';
      err.status = res.status;
      throw err;
    }
    if (isTextLike(ct) && !disposition.toLowerCase().includes('attachment')) {
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { json = null; }
      if (json === null) {
        if (ct.includes('text/html') && /name=["']password["']|رمز\s*یکبار/i.test(text)) {
          markSessionExpired({ url: req.url, status: res.status });
          const err = new Error('SESSION_EXPIRED');
          err.code = 'SESSION_EXPIRED';
          throw err;
        }
        return { status: res.status, text, contentType: ct };
      }
      recordDiscovery(String(init.method).toUpperCase(), req.url, json, false, ct);
      if (sessionExpired) { sessionExpired = false; emit('session', { expired: false }); }
      if (opts.emit) emit('capture', { method: String(init.method).toUpperCase(), url: req.url, path: pathKey(req.url), status: res.status, json, ts: Date.now(), requestHeaders: headers, requestBody: req.body ?? null, contentType: ct });
      return { status: res.status, json, contentType: ct };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const fileName = U.fileNameFromDisposition(disposition) || U.fileNameFromUrl(req.url);
    if (opts.emit) emit('file', { method: String(init.method).toUpperCase(), url: req.url, path: pathKey(req.url), status: res.status, bytes, contentType: ct, fileName, requestHeaders: headers, requestBody: req.body ?? null, ts: Date.now() });
    return { status: res.status, bytes, contentType: ct, fileName };
  }

  /** فراخوانی مستقیم یک API سایت با احراز هویت جاری؛ پاسخ به رابط هم فرستاده می‌شود (emit) */
  function api(path, params, opts) {
    opts = opts || {};
    const body = params ? (typeof params === 'string' ? params : new URLSearchParams(params).toString()) : null;
    return replay({ method: opts.method || 'POST', url: new URL(path, location.origin).href, headers: {}, body }, { emit: opts.emit !== false });
  }

  function exportDiscovery() {
    return {
      ساخته‌شده: U.formatSystemDate(),
      صفحه: U.maskPath(location.pathname),
      توضیح: 'نقشهٔ کشف‌شده: فقط مسیرهای ماسک‌شده و نام فیلدها؛ هیچ مقداری ثبت نشده است.',
      درخواست‌ها: discovery,
    };
  }

  S.hook = { install, on, replay, api, authHeaders, exportDiscovery, pathKey, get sessionExpired() { return sessionExpired; }, schema, _handleResponse: handleResponse };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
