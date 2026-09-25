/* background افزونه: ذخیرهٔ بسته‌های «ثبت من» در Downloads/ثبت من/ بدون پرسش (سرویس محلی همین پوشه را پایش می‌کند). */
'use strict';
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'download') return false;
  chrome.downloads.download({ url: msg.dataUrl, filename: 'ثبت من/' + msg.name, conflictAction: 'uniquify', saveAs: false }, (id) => {
    if (chrome.runtime.lastError || !id) sendResponse({ ok: false, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
    else sendResponse({ ok: true, id });
  });
  return true;
});
