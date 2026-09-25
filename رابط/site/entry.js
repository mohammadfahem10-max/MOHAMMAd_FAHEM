/* نقطهٔ ورود بستهٔ سمتِ سایت (قلاب.js) — در WebView2ِ پنهانِ سایت تزریق می‌شود؛ هیچ رابطی نشان نمی‌دهد. */
(function (S) {
  'use strict';
  if (typeof window === 'undefined' || window.__sabtmanSiteStarted) return;
  try { if (window.top !== window) return; } catch (e) { return; }
  if (!/(^|\.)ssaa\.ir$/i.test(location.hostname) && !/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return;
  window.__sabtmanSiteStarted = true;
  S.relay.install();
})(window.SabtMan = window.SabtMan || {});
