# پوستهٔ ویندوزی «ثبت من» (WPF + WebView2)

یک پنجره با تم طلوع: سایت my.ssaa.ir درون آن باز می‌شود، کاربر همان‌جا وارد می‌شود، رابط (`رابط.js`) پیش از کد سایت تزریق می‌شود و بسته‌های کار با `window.chrome.webview.postMessage` مستقیم به پوسته می‌رسند — بدون افزونه، بدون Downloads، بدون صفحهٔ localhost.

## ساخت (روی رایانهٔ کاربر)
```
پوسته-ویندوزی\ساخت.cmd
```
- کامپایلر: `csc.exe` چارچوب ۴.۰ ویندوز (C# 5؛ کد بدون `$""`، `?.`، `nameof` و بدنهٔ `=>` نوشته شده).
- DLLهای WebView2 (`Microsoft.Web.WebView2.Core.dll`، `…Wpf.dll`، `WebView2Loader.dll`) در مخزن نیستند؛ از `SABTMAN_WEBVIEW2` یا پوشهٔ «اپلیکیشن میزبان» کپی می‌شوند.
- خروجی: `..\..\اپلیکیشن ثبت من\برنامه\ثبت من.exe` (یا `SABTMAN_OUT`) + `رابط.js` + `بک‌اند-فایل\` + `node.exe`.
- `node.exe` قابل‌حمل: `SABTMAN_NODE`، یا `..\سرور\node.exe`، یا «خانه کلود\سرور\node.exe».

## اجرا
دوبار کلیک روی «ثبت من.exe». همه‌چیز در `برنامه\داده\` می‌ماند: تنظیمات، دادهٔ WebView2، صفِ بسته‌ها (`صف\`)، گزارش کار. سرویس Node پنهان اجرا می‌شود و با بستن پنجره (Job Object) خاموش می‌شود.

## پل پیام‌ها
| رابط → پوسته | پوسته → رابط |
|---|---|
| `job` (name, base64) → `داده\صف\sabtman__*.zip` → سرویس مرتب می‌کند | `state` (dest, mode, service{running, browser, busy, lastText}) |
| `file` (name, base64) → `مقصد\خروجی‌های دیگر\` | `dest` (path) |
| `browse` → پنجرهٔ انتخاب پوشهٔ ویندوز | `toggle` / `settings` (از نوار بالا) |
| `openDest` · `setConfig` · `state` · `ready` | `log` (level, text) |

## چاپ PDF
فعلاً با موتور Edge/Chrome headless در سرویس (اصلاح 7ffcb0a برای لانچر ویندوز حفظ شده). جایگزین `CoreWebView2.PrintToPdfAsync` در پوسته در گام بعدی.
