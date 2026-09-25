/* رله‌ی سمتِ سایت (در WebView2ِ پنهانِ my.ssaa.ir اجرا می‌شود؛ کاربر هرگز این صفحه را نمی‌بیند).
   رویدادهای قلاب (capture/file/session) را به پوسته می‌فرستد تا به رابط برنامه برسد،
   و فرمان‌های رابط (بازپخش درخواست در همان نشست، ناوبری، ورود، گردآوری) را اجرا می‌کند. */
(function (S) {
  'use strict';
  const U = S.util;

  function post(msg) {
    try { window.chrome.webview.postMessage(JSON.stringify(Object.assign({ type: 'site' }, msg))); return true; } catch (e) { return false; }
  }

  function toBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function reply(id, ok, result, error) { post({ event: 'reply', id, ok, result, error }); }

  async function handle(cmd) {
    const id = cmd.id;
    try {
      switch (cmd.cmd) {
        case 'replay': {
          const res = await S.hook.replay(cmd.req);
          const out = { status: res.status, contentType: res.contentType, fileName: res.fileName };
          if (res.json !== undefined) out.json = res.json;
          if (res.text !== undefined) out.text = res.text;
          if (res.bytes) out.base64 = toBase64(res.bytes);
          reply(id, true, out);
          break;
        }
        case 'navigate': location.href = cmd.url; reply(id, true, { url: cmd.url }); break;
        case 'discovery': reply(id, true, S.hook.exportDiscovery()); break;
        case 'state': reply(id, true, S.auto ? S.auto.detectState() : { page: 'unknown', url: location.href }); break;
        case 'login': reply(id, true, await S.auto.startLogin(cmd.nationalCode, cmd.captcha)); break;
        case 'otp': reply(id, true, await S.auto.submitOtp(cmd.code)); break;
        case 'collect': reply(id, true, await S.auto.collect(cmd.sections, (p) => post({ event: 'progress', progress: p }))); break;
        case 'click': reply(id, true, await S.auto.clickText(cmd.text)); break;
        case 'eval': reply(id, true, String((0, eval)(cmd.code))); break;
        default: reply(id, false, null, 'فرمان ناشناخته: ' + cmd.cmd);
      }
    } catch (e) {
      reply(id, false, null, (e && e.code === 'SESSION_EXPIRED') ? 'SESSION_EXPIRED' : String(e && e.message || e));
    }
  }

  function install() {
    if (window.__sabtmanRelay) return;
    window.__sabtmanRelay = true;
    S.hook.install();
    S.hook.on('capture', (cap) => post({ event: 'capture', cap }));
    S.hook.on('file', (f) => post({ event: 'file', file: { method: f.method, url: f.url, path: f.path, status: f.status, contentType: f.contentType, fileName: f.fileName, base64: toBase64(f.bytes), requestHeaders: f.requestHeaders, requestBody: f.requestBody, ts: f.ts } }));
    S.hook.on('session', (ev) => post({ event: 'session', expired: ev.expired }));
    try {
      window.chrome.webview.addEventListener('message', (ev) => {
        let msg = ev.data;
        if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch (e) { return; } }
        if (msg && msg.type === 'site-cmd') handle(msg);
      });
    } catch (e) { /* بیرون از پوسته */ }
    const announce = () => post({ event: 'ready', url: location.href, state: S.auto ? S.auto.detectState() : null });
    if (document.readyState === 'complete') announce(); else window.addEventListener('load', announce, { once: true });
  }

  S.relay = { install, post, handle };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
