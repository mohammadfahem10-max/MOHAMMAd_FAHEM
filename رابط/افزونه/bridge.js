/* پل دانلود (دنیای ایزولهٔ افزونه): پیام دانلود را از رابط (دنیای اصلی صفحه) می‌گیرد و به background می‌دهد
   تا فایل بدون پرسش در زیرپوشهٔ «ثبت من» پوشهٔ Downloads ذخیره شود. وضعیت پل برای عیب‌یابی روی <html data-sabtman-bridge> نوشته می‌شود. */
(function () {
  'use strict';
  const mark = (v) => { try { document.documentElement.setAttribute('data-sabtman-bridge', v); } catch (e) { /* ادامه */ } };
  mark('ready');

  function fallback(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a); a.click(); setTimeout(() => a.remove(), 30000);
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== 'sabtman' || ev.data.type !== 'download') return;
    const { url, name } = ev.data;
    mark('message');
    fetch(url).then((r) => r.blob()).then((blob) => {
      const reader = new FileReader();
      reader.onload = () => {
        mark('sending');
        // اگر background در ۱۰ ثانیه پاسخ نداد (مثلاً مرورگر دانلود افزونه را بست)، دانلود معمولی صفحه انجام می‌شود
        let settled = false;
        const timer = setTimeout(() => { if (!settled) { settled = true; mark('fallback:timeout'); fallback(url, name); } }, 10000);
        try {
          chrome.runtime.sendMessage({ type: 'download', dataUrl: reader.result, name }, (res) => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            if (chrome.runtime.lastError || !res || !res.ok) {
              mark('fallback:' + ((chrome.runtime.lastError && chrome.runtime.lastError.message) || (res && res.error) || 'no-response'));
              fallback(url, name);
            } else mark('saved:' + res.id);
          });
        } catch (e) { if (!settled) { settled = true; clearTimeout(timer); mark('fallback:' + e.message); fallback(url, name); } }
      };
      reader.onerror = () => { mark('fallback:read'); fallback(url, name); };
      reader.readAsDataURL(blob);
    }).catch((e) => { mark('fallback:fetch ' + e.message); fallback(url, name); });
  });
})();
