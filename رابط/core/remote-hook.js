/* جایگزین S.hook در رابطِ برنامه (WebView2ِ دیدنی): رویدادهای قلابِ سایتِ پنهان از راه پوسته می‌رسند و
   بازپخش درخواست‌ها (روند/پیوست/فایل هر رکورد) در همان نشستِ سایت انجام می‌شود. API همان S.hook است. */
(function (S) {
  'use strict';
  const U = S.util;
  const listeners = { capture: [], file: [], session: [] };
  const pending = new Map();      // id → {resolve, reject, timer}
  const siteListeners = [];       // رویدادهای خام سایت (ready/progress/…)
  let sessionExpired = false;
  let discovery = { درخواست‌ها: [] };
  let seq = 0;

  function on(event, cb) { (listeners[event] || (listeners[event] = [])).push(cb); }
  function emit(event, payload) { for (const cb of listeners[event] || []) { try { cb(payload); } catch (e) { console.error('[ثبت من]', e); } } }

  function fromBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** فرمان به سایت پنهان؛ خروجی Promise با پاسخ رله */
  function cmd(name, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!S.bridge || !S.bridge.available()) return reject(new Error('پوسته در دسترس نیست'));
      const id = 'c' + (++seq) + Math.random().toString(36).slice(2, 6);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('پاسخی از سایت نرسید (' + name + ')')); }, timeoutMs || 60000);
      pending.set(id, { resolve, reject, timer });
      S.bridge.post(Object.assign({ type: 'site-cmd', cmd: name, id }, payload || {}));
    });
  }

  function handleSiteMessage(msg) {
    switch (msg.event) {
      case 'capture': emit('capture', msg.cap); break;
      case 'file': {
        const f = msg.file;
        emit('file', Object.assign({}, f, { bytes: fromBase64(f.base64 || '') }));
        break;
      }
      case 'session':
        sessionExpired = Boolean(msg.expired);
        emit('session', { expired: sessionExpired });
        break;
      case 'reply': {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.result);
        else {
          const err = new Error(msg.error || 'خطا');
          if (msg.error === 'SESSION_EXPIRED') { err.code = 'SESSION_EXPIRED'; sessionExpired = true; emit('session', { expired: true }); }
          p.reject(err);
        }
        break;
      }
      default: break;
    }
    for (const cb of siteListeners) { try { cb(msg); } catch (e) { console.error('[ثبت من]', e); } }
  }

  async function replay(req) {
    const res = await cmd('replay', { req }, 90000);
    if (sessionExpired) { sessionExpired = false; emit('session', { expired: false }); }
    const out = { status: res.status, contentType: res.contentType, fileName: res.fileName };
    if (res.json !== undefined) out.json = res.json;
    if (res.text !== undefined) out.text = res.text;
    if (res.base64) out.bytes = fromBase64(res.base64);
    return out;
  }

  async function refreshDiscovery() {
    try { discovery = await cmd('discovery', {}, 10000); } catch (e) { /* ادامه */ }
    return discovery;
  }

  function install() {
    if (!S.bridge || !S.bridge.available()) return;
    S.bridge.onMessage((msg) => { if (msg && msg.type === 'site') handleSiteMessage(msg); });
  }

  S.hook = {
    install, on, replay, cmd, refreshDiscovery, onSite: (cb) => siteListeners.push(cb),
    exportDiscovery: () => discovery,
    get sessionExpired() { return sessionExpired; },
    set sessionExpired(v) { sessionExpired = Boolean(v); },
    pathKey: (url) => { try { const u = new URL(url, location.href); return U.maskPath(u.pathname); } catch (e) { return String(url); } },
  };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
