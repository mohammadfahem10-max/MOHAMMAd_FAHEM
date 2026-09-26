/* پل پوستهٔ ویندوزی (WebView2): رابط با window.chrome.webview.postMessage با پوسته حرف می‌زند و پوسته مستقیم روی دیسک می‌نویسد.
   پیام‌های رابط → پوسته:  {type:'job', name, base64}  {type:'file', name, base64, mime}  {type:'browse'}  {type:'openDest'}
                            {type:'setConfig', dest?, mode?}  {type:'state'}  {type:'ready'}
   پیام‌های پوسته → رابط:  {type:'state', dest, service:{...}}  {type:'dest', path}  {type:'toggle'}  {type:'settings'}  {type:'log', level, text} */
(function (S) {
  'use strict';
  const listeners = [];
  let last = null;

  function available() {
    try { return Boolean(window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function'); } catch (e) { return false; }
  }

  function post(msg) {
    if (!available()) return false;
    try { window.chrome.webview.postMessage(JSON.stringify(msg)); return true; } catch (e) { console.error('[ثبت من] پل', e); return false; }
  }

  /** Uint8Array → base64 (تکه‌تکه تا رشتهٔ بزرگ حافظه را نگیرد) */
  function toBase64(bytes) {
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  function sendJob(name, bytes) { return post({ type: 'job', name, base64: toBase64(bytes) }); }
  function sendFile(name, bytes, mime) { return post({ type: 'file', name, base64: toBase64(bytes), mime: mime || '' }); }
  function browseDest() { return post({ type: 'browse' }); }
  function openDest() { return post({ type: 'openDest' }); }
  function setConfig(cfg) { return post(Object.assign({ type: 'setConfig' }, cfg)); }
  function requestState() { return post({ type: 'state' }); }
  function setDns(name, ips) { return post({ type: 'setDns', name: name || '', ips: ips || '' }); }
  function reloadSite() { return post({ type: 'reloadSite' }); }

  function onMessage(cb) { listeners.push(cb); if (last) cb(last); }

  function install() {
    if (!available()) return;
    try {
      window.chrome.webview.addEventListener('message', (ev) => {
        let msg = ev.data;
        if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch (e) { return; } }
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'state') last = msg;
        else if (msg.type === 'dest') last = Object.assign({}, last || { type: 'state' }, { dest: msg.path });
        for (const cb of listeners) { try { cb(msg); } catch (e) { console.error('[ثبت من] پیام پوسته', e); } }
      });
      post({ type: 'ready', url: location.href });
    } catch (e) { console.error('[ثبت من] پل', e); }
  }

  S.bridge = { available, post, sendJob, sendFile, browseDest, openDest, setConfig, requestState, setDns, reloadSite, onMessage, install, toBase64, get last() { return last; } };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
