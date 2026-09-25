/* نقطهٔ ورود رابط «ثبت من»: نصب قلاب، اتصال انبار، تزریق تم و فونت همراه، نمایش پنل.
   با ابزار/build.js همراه هسته‌ها در یک فایل بسته می‌شود (افزونه + اسکریپت کاربر). */
(function (S) {
  'use strict';
  if (typeof window === 'undefined' || window.__sabtmanStarted) return;
  window.__sabtmanStarted = true;

  function injectStyles() {
    if (document.getElementById('sabtman-style')) return;
    const style = document.createElement('style');
    style.id = 'sabtman-style';
    style.textContent = (S.fontCss || '') + '\n' + (S.themeCss || '');
    (document.head || document.documentElement).appendChild(style);
  }

  function start() {
    S.hook.install();
    S.hook.on('capture', (cap) => { try { S.store.ingest(cap); } catch (e) { console.error('[ثبت من] ingest', e); } });
    S.hook.on('file', (f) => { try { S.store.ingestFile(f); } catch (e) { console.error('[ثبت من] file', e); } });
    S.hook.on('session', (ev) => {
      if (ev.expired) S.store.addLog('warn', 'نشست پایان یافته است؛ دوباره وارد شوید.');
      else { S.store.addLog('ok', 'نشست برقرار شد؛ ادامه می‌دهیم.'); S.exporter.resumeQueue(); }
    });
    const ready = () => { injectStyles(); S.panel.mount(); };
    if (document.body) ready(); else document.addEventListener('DOMContentLoaded', ready, { once: true });
  }

  start();
})(window.SabtMan = window.SabtMan || {});
