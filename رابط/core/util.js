/* ابزارهای مشترک «ثبت من» — بدون وابستگی خارجی */
(function (S) {
  'use strict';

  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  /** همهٔ ارقام (لاتین و عربی) را فارسی می‌کند. */
  function faDigits(input) {
    if (input === null || input === undefined) return '';
    return String(input)
      .replace(/[0-9]/g, (d) => FA_DIGITS[d.charCodeAt(0) - 48])
      .replace(/[٠-٩]/g, (d) => FA_DIGITS[AR_DIGITS.indexOf(d)]);
  }

  /** ارقام فارسی/عربی را لاتین می‌کند (فقط برای محاسبه). */
  function enDigits(input) {
    if (input === null || input === undefined) return '';
    return String(input)
      .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  }

  /**
   * خواندن پاکت پاسخ سامانه: {Success/success, Message/message, Data/data}
   * خروجی: {ok, message, data, isEnvelope}
   */
  function readEnvelope(res) {
    if (!res || typeof res !== 'object' || Array.isArray(res)) {
      return { ok: false, message: '', data: undefined, isEnvelope: false };
    }
    const hasSuccess = 'success' in res || 'Success' in res || 'isSuccess' in res || 'IsSuccess' in res;
    const hasData = 'data' in res || 'Data' in res;
    if (!hasSuccess && !hasData) return { ok: false, message: '', data: undefined, isEnvelope: false };
    const success = res.success ?? res.Success ?? res.isSuccess ?? res.IsSuccess ?? true;
    const data = 'data' in res ? res.data : res.Data;
    const message = res.message ?? res.Message ?? '';
    return { ok: Boolean(success), message: String(message || ''), data, isEnvelope: true };
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /**
   * تخت‌کردن شیء تودرتو به «مسیر.نقطه‌ای» → مقدار.
   * آرایهٔ مقدارهای ساده با «، » جدا می‌شود؛ آرایهٔ شیء‌ها با کلید «مسیر[]» دست‌نخورده می‌ماند.
   */
  function flatten(obj, prefix, out) {
    out = out || {};
    prefix = prefix || '';
    if (!isPlainObject(obj)) {
      out[prefix || 'مقدار'] = obj;
      return out;
    }
    for (const key of Object.keys(obj)) {
      const path = prefix ? prefix + '.' + key : key;
      const val = obj[key];
      if (isPlainObject(val)) flatten(val, path, out);
      else if (Array.isArray(val)) {
        if (val.every((x) => !isPlainObject(x) && !Array.isArray(x))) out[path] = val.map(formatValue).join('، ');
        else out[path + '[]'] = val;
      } else out[path] = val;
    }
    return out;
  }

  /** نمایش متنی یک مقدار: عینِ داده با ارقام فارسی؛ بولی فارسی؛ تهی → خط تیره. */
  function formatValue(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (v === true) return 'بله';
    if (v === false) return 'خیر';
    if (Array.isArray(v)) return v.map(formatValue).join('، ');
    if (isPlainObject(v)) return faDigits(JSON.stringify(v));
    return faDigits(String(v));
  }

  /** نام فایل امن برای ویندوز؛ نام فارسی حفظ می‌شود. */
  function safeFileName(name, fallback) {
    let s = String(name ?? '').trim();
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/\.+$/g, '').trim();
    if (!s) s = fallback || 'بدون-نام';
    return s.length > 150 ? s.slice(0, 150) : s;
  }

  /** نام فایل از سرآیند Content-Disposition (با پشتیبانی filename*=UTF-8''...) */
  function fileNameFromDisposition(header) {
    if (!header) return '';
    const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
    if (star) {
      try { return decodeURIComponent(star[2].trim().replace(/^"|"$/g, '')); } catch (e) { /* ادامه */ }
    }
    const plain = /filename\s*=\s*("([^"]*)"|([^;]+))/i.exec(header);
    if (plain) {
      const raw = (plain[2] ?? plain[3] ?? '').trim();
      try { return decodeURIComponent(escape(raw)); } catch (e) { return raw; }
    }
    return '';
  }

  /** نام فایل از انتهای یک URL/مسیر. */
  function fileNameFromUrl(url) {
    try {
      const u = new URL(url, typeof location !== 'undefined' ? location.href : 'http://x/');
      const last = u.pathname.split('/').filter(Boolean).pop() || '';
      return decodeURIComponent(last);
    } catch (e) {
      return String(url || '').split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
    }
  }

  /** پسوند فایل از نوع MIME */
  function extFromMime(mime) {
    const m = String(mime || '').toLowerCase().split(';')[0].trim();
    const map = {
      'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/tiff': 'tif', 'image/gif': 'gif',
      'image/webp': 'webp', 'application/zip': 'zip', 'text/plain': 'txt', 'application/json': 'json',
      'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    };
    return map[m] || '';
  }

  /* ---------- تاریخ جلالی ---------- */

  function div(a, b) { return Math.trunc(a / b); }

  function jalaliToGregorian(jy, jm, jd) {
    jy = Number(jy); jm = Number(jm); jd = Number(jd);
    let gy = jy <= 979 ? 621 : 1600;
    jy -= jy <= 979 ? 0 : 979;
    let days = 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    gy += 400 * div(days, 146097);
    days %= 146097;
    if (days > 36524) {
      gy += 100 * div(--days, 36524);
      days %= 36524;
      if (days >= 365) days++;
    }
    gy += 4 * div(days, 1461);
    days %= 1461;
    if (days > 365) {
      gy += div(days - 1, 365);
      days = (days - 1) % 365;
    }
    let gd = days + 1;
    const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
    const sal = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm = 0;
    for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
    return [gy, gm, gd];
  }

  function gregorianToJalali(gy, gm, gd) {
    const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = gy <= 1600 ? 0 : 979;
    gy -= gy <= 1600 ? 621 : 1600;
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days = 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + gdm[gm - 1];
    jy += 33 * div(days, 12053);
    days %= 12053;
    jy += 4 * div(days, 1461);
    days %= 1461;
    if (days > 365) {
      jy += div(days - 1, 365);
      days = (days - 1) % 365;
    }
    const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }

  /**
   * تجزیهٔ تاریخ سامانه (نمونه: «۱۴۰۳/۰۹/۰۳-۰۷:۳۷»). خروجی میلی‌ثانیه یا null.
   * تاریخ میلادی/ISO هم پذیرفته می‌شود.
   */
  function parseSystemDate(text) {
    if (text === null || text === undefined) return null;
    const s = enDigits(String(text)).trim();
    const m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[\sT\-–_]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3], h = +(m[4] || 0), mi = +(m[5] || 0), se = +(m[6] || 0);
      if (y >= 1200 && y <= 1600) {
        const [gy, gm, gd] = jalaliToGregorian(y, mo, d);
        return new Date(gy, gm - 1, gd, h, mi, se).getTime();
      }
      if (y >= 1900) return new Date(y, mo - 1, d, h, mi, se).getTime();
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const t = Date.parse(s);
      return Number.isNaN(t) ? null : t;
    }
    return null;
  }

  /** آیا این متن شبیه تاریخ سامانه است؟ */
  function looksLikeDate(text) {
    if (typeof text !== 'string') return false;
    return /^\s*[\d۰-۹]{4}[\/\-.][\d۰-۹]{1,2}[\/\-.][\d۰-۹]{1,2}/.test(text);
  }

  /** زمانِ داده‌شده به قالب سامانه: ۱۴۰۳/۰۹/۰۳-۰۷:۳۷ */
  function formatSystemDate(ms) {
    const d = new Date(ms ?? Date.now());
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const p = (n) => String(n).padStart(2, '0');
    return faDigits(`${jy}/${p(jm)}/${p(jd)}-${p(d.getHours())}:${p(d.getMinutes())}`);
  }

  /** فقط تاریخ: ۱۴۰۳/۰۹/۰۳ */
  function formatSystemDay(ms) {
    return formatSystemDate(ms).split('-')[0];
  }

  /** مدت به فارسی: «۲ روز و ۳ ساعت» */
  function formatDuration(ms) {
    if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
    ms = Math.abs(ms);
    const min = Math.floor(ms / 60000);
    const days = Math.floor(min / 1440);
    const hours = Math.floor((min % 1440) / 60);
    const mins = min % 60;
    const parts = [];
    if (days) parts.push(`${days} روز`);
    if (hours) parts.push(`${hours} ساعت`);
    if (mins || !parts.length) parts.push(`${mins} دقیقه`);
    return faDigits(parts.join(' و '));
  }

  /* ---------- CRC32 و ZIP (فقط ذخیره، بدون فشرده‌سازی) ---------- */

  const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = -1;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  function utf8(str) { return new TextEncoder().encode(str); }

  function dosDateTime(date) {
    const d = date || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, day };
  }

  /**
   * ساخت ZIP در مرورگر. entries: [{name, data: Uint8Array|string}] → Uint8Array
   * نام‌ها UTF-8 (بیت ۱۱ پرچم عمومی) ثبت می‌شوند.
   */
  function buildZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    const { time, day } = dosDateTime();
    for (const e of entries) {
      const name = utf8(e.name);
      const data = typeof e.data === 'string' ? utf8(e.data) : e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, day, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);
      locals.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, day, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      centrals.push(central);
      offset += local.length + data.length;
    }
    const cdSize = centrals.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + cdSize + 22);
    let pos = 0;
    for (const part of [...locals, ...centrals, end]) { out.set(part, pos); pos += part.length; }
    return out;
  }

  /** base64 → Uint8Array */
  function base64ToBytes(b64) {
    const clean = String(b64).replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** ماسک‌کردن شماره‌های ۳ رقم و بیشتر در مسیر (برای نقشهٔ کشف‌شده) */
  function maskPath(s) {
    return String(s).replace(/\d{3,}/g, '#');
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  S.util = {
    faDigits, enDigits, readEnvelope, isPlainObject, flatten, formatValue, safeFileName,
    fileNameFromDisposition, fileNameFromUrl, extFromMime, jalaliToGregorian, gregorianToJalali,
    parseSystemDate, looksLikeDate, formatSystemDate, formatSystemDay, formatDuration, crc32, buildZip,
    base64ToBytes, uid, escapeHtml, utf8, maskPath, sleep,
  };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
