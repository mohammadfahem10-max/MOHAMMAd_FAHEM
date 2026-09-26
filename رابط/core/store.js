/* انبار داده‌های گرفته‌شده: بخش‌ها، رکوردها، شمارشگرها، پیوندهای یادگرفته‌شده (گزارشات/پیوست‌ها/فایل)، تنظیمات.
   همه‌چیز در حافظهٔ زبانهٔ خودِ کاربر است؛ تنظیمات فقط در localStorage همین سایت. */
(function (S) {
  'use strict';
  const U = S.util;

  /* برچسب فارسی ماژول‌ها (فقط برای نام‌گذاری؛ آدرس‌ها از خود سایت کشف می‌شوند) */
  const MODULE_LABELS = {
    estate: 'املاک من', ssar: 'اسناد رسمی من', sset: 'وقایع ازدواج و طلاق من', companies: 'شرکت‌های من',
    company: 'شرکت‌های من', ilenc: 'شناسه‌های ثبت موقت', mechletter: 'وضعیت مکاتبات', profile: 'پروفایل',
    account: 'پروفایل', user: 'پروفایل',
  };

  const IGNORE_PATH = /(^|\/)(assets?|static|i18n|locale|translations?|config|settings|menu|captcha|map|survey|notification-count|ping|health)(\/|\.|$)/i;
  // جدول‌های کمکی و شمارنده‌های my.ssaa.ir که دادهٔ کاربر نیستند
  const LOOKUP_PATH = /(getissuestates|getfeedbackcount|getsignabledocumentscount|checktoken|generateotp)$|^\/login$/i;

  const CATEGORICAL_KEY = /(type|kind|category|status|state|group|unit|office|نوع|وضعیت|دسته|واحد|دفتر)/i;
  const DATE_KEY = /(date|time|تاریخ|زمان|ساعت)/i;
  const ID_KEY = /(^id$|Id$|ID$|_id$|code|number|no$|شماره|کد|شناسه)/i;
  const NAME_KEY = /(title|name|subject|desc|عنوان|نام|موضوع|شرح)/i;
  const FILE_KEY = /(file|attach|image|img|pic|photo|scan|document|url|path|base64|پیوست|تصویر|فایل|سند)/i;
  const FILE_EXT = /\.(pdf|jpe?g|png|tiff?|gif|bmp|webp|zip|rar|docx?|xlsx?|txt)(\?.*)?$/i;

  const SETTINGS_KEY = 'sabtman.settings.v1';
  const LINKS_KEY = 'sabtman.links.v1';

  const defaultSettings = {
    mode: 'pdf+text',          // pdf+text | pdf | text
    delayMs: 800,              // فاصلهٔ بین درخواست‌های بازپخش
    labels: {},                // نام دلخواه بخش‌ها  path → label
    caseNameField: {},         // path → نام فیلدی که نام پوشهٔ پرونده از آن ساخته می‌شود
    counterFields: {},         // path → [field,...]
    panelOpen: false,
    pendingDays: 7,            // آستانهٔ «معطل»
    recentDays: 7,             // آستانهٔ «تازه»
  };

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? Object.assign({}, fallback, JSON.parse(raw)) : Object.assign({}, fallback);
    } catch (e) { return Object.assign({}, fallback); }
  }
  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* حافظه بسته است */ }
  }

  const state = {
    settings: loadJson(SETTINGS_KEY, defaultSettings),
    sections: new Map(),        // path → section
    links: loadJson(LINKS_KEY, { items: [] }).items || [],   // پیوندهای یادگرفته‌شده
    files: new Map(),           // url → {bytes, fileName, contentType}
    captures: [],               // تاریخچهٔ کوتاه آخرین پاسخ‌ها (برای یادگیری پیوند)
    listeners: [],
    log: [],
  };

  function saveSettings() { saveJson(SETTINGS_KEY, state.settings); }
  function saveLinks() { saveJson(LINKS_KEY, { items: state.links }); }

  function subscribe(cb) { state.listeners.push(cb); }
  function notify(what, payload) {
    for (const cb of state.listeners) { try { cb(what, payload); } catch (e) { console.error(e); } }
  }

  function addLog(level, text) {
    state.log.unshift({ ts: Date.now(), level, text });
    if (state.log.length > 200) state.log.length = 200;
    notify('log');
  }

  /* ---------- برچسب بخش ---------- */

  function moduleOf(path) {
    const parts = String(path).split('?')[0].split('/').filter(Boolean);
    return (parts[0] || '').toLowerCase();
  }

  function labelFor(path) {
    if (state.settings.labels[path]) return state.settings.labels[path];
    const known = S.siteMap && S.siteMap.sectionFor(path);
    if (known) return known.label;
    const parts = String(path).split('?')[0].split('/').filter(Boolean);
    const mod = MODULE_LABELS[(parts[0] || '').toLowerCase()];
    const op = parts.slice(1).join('/');
    const opFa = humanizeOp(op);
    return mod ? (opFa ? `${mod} — ${opFa}` : mod) : (opFa || path);
  }

  function humanizeOp(op) {
    if (!op) return '';
    let words = op.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    const dict = [
      [/get all documents|getalldocuments/, 'همهٔ اسناد'], [/person list|list/, 'فهرست'], [/login history|logins/, 'تاریخچهٔ ورود'],
      [/document/, 'سند'], [/estate/, 'ملک'], [/report/, 'گزارشات'], [/attach/, 'پیوست‌ها'], [/status/, 'وضعیت'], [/detail/, 'جزئیات'],
      [/history/, 'تاریخچه'], [/profile|info/, 'مشخصات'], [/company|companies/, 'شرکت‌ها'], [/temp|issue/, 'ثبت موقت'], [/letter/, 'مکاتبه'],
      [/event/, 'واقعه'], [/marriage/, 'ازدواج'], [/divorce/, 'طلاق'], [/file|download/, 'فایل'], [/text|content/, 'متن'], [/image|scan/, 'تصویر'],
    ];
    const found = [];
    for (const [re, fa] of dict) {
      if (!re.test(words)) continue;
      found.push(fa);
      words = words.replace(re, ' ');
    }
    return found.length ? found.join(' ') : op;
  }

  /* ---------- تحلیل رکوردها ---------- */

  /** از Data آرایهٔ رکوردها و فراداده جدا می‌کند. */
  const LIST_KEY = /(items|list|rows|records|results?|data|documents|estates|letters|issues|companies|events|entries)$/i;
  function splitData(data) {
    if (Array.isArray(data)) return { records: data, meta: null, shape: 'array' };
    if (U.isPlainObject(data)) {
      // شیءای که آرایهٔ رکورد درونش دارد (مثل {Items:[...], TotalCount}) — نه شیءِ پروفایل که فقط یک آرایهٔ فرعی دارد
      let bestKey = null, bestLen = -1;
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (Array.isArray(v) && v.length > bestLen && (v.length === 0 || U.isPlainObject(v[0]))) { bestKey = k; bestLen = v.length; }
      }
      if (bestKey !== null) {
        const others = Object.keys(data).filter((k) => k !== bestKey);
        const scalarOthers = others.every((k) => !U.isPlainObject(data[k]) && !Array.isArray(data[k]));
        const light = others.length <= 4 && others.every((k) => typeof data[k] === 'number' || typeof data[k] === 'boolean' || /(count|total|page|size|skip|take|index|has)/i.test(k));
        if (scalarOthers && (LIST_KEY.test(bestKey) || light) && (others.length <= 4 || LIST_KEY.test(bestKey) && others.length <= 6)) {
          const meta = Object.assign({}, data);
          delete meta[bestKey];
          return { records: data[bestKey], meta, shape: 'wrapped:' + bestKey };
        }
      }
      return { records: [data], meta: null, shape: 'object' };
    }
    return { records: [], meta: data, shape: 'scalar' };
  }

  function hashText(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  function recordKey(flat, index) {
    const keys = Object.keys(flat);
    const idKeys = keys.filter((k) => ID_KEY.test(k) && flat[k] !== null && flat[k] !== undefined && flat[k] !== '');
    if (idKeys.length) return idKeys.map((k) => k + '=' + flat[k]).join('|');
    return '#' + index;
  }

  /** فیلدهای شمارشی (نوع/وضعیت/…) */
  function detectCounterFields(records) {
    if (!records.length) return [];
    const flats = records.map((r) => r.flat);
    const keys = new Set();
    flats.forEach((f) => Object.keys(f).forEach((k) => keys.add(k)));
    const result = [];
    for (const k of keys) {
      if (k.endsWith('[]')) continue;
      const vals = flats.map((f) => f[k]).filter((v) => v !== null && v !== undefined && v !== '');
      if (!vals.length) continue;
      if (vals.some((v) => typeof v === 'object')) continue;
      if (vals.some((v) => U.looksLikeDate(v))) continue;
      const distinct = new Set(vals.map(String)).size;
      const named = CATEGORICAL_KEY.test(k) && !ID_KEY.test(k);
      if (named && distinct <= 40) result.push({ key: k, score: 100 - distinct });
      else if (typeof vals[0] === 'string' && distinct >= 2 && distinct <= 8 && flats.length >= 4 && !ID_KEY.test(k) && !NAME_KEY.test(k)) result.push({ key: k, score: 50 - distinct });
      else if (typeof vals[0] === 'boolean' && flats.length >= 2) result.push({ key: k, score: 10 });
    }
    return result.sort((a, b) => b.score - a.score).slice(0, 4).map((r) => r.key);
  }

  function detectDateField(records) {
    const counts = new Map();
    for (const r of records) for (const k of Object.keys(r.flat)) {
      if (DATE_KEY.test(k) || U.looksLikeDate(r.flat[k])) counts.set(k, (counts.get(k) || 0) + (U.looksLikeDate(r.flat[k]) ? 2 : 1));
    }
    let best = null, bestN = 0;
    for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
    return best;
  }

  function detectNameField(records) {
    const keys = new Set();
    records.forEach((r) => Object.keys(r.flat).forEach((k) => keys.add(k)));
    const arr = [...keys];
    return arr.find((k) => /(caseno|casenumber|docno|docnumber|documentno|شماره ?مدرک|شماره ?سند|شماره ?پرونده|trackingcode|کد ?رهگیری)/i.test(k.replace(/[_\s]/g, '')))
      || arr.find((k) => ID_KEY.test(k) && !/^id$|Id$/.test(k))
      || arr.find((k) => NAME_KEY.test(k))
      || arr.find((k) => ID_KEY.test(k))
      || arr[0] || null;
  }

  function computeCounters(section) {
    const fields = state.settings.counterFields[section.path] || section.autoCounterFields;
    const counters = [];
    for (const key of fields) {
      const map = new Map();
      for (const r of section.records) {
        const v = r.flat[key];
        const label = v === null || v === undefined || v === '' ? '—' : U.formatValue(v);
        map.set(label, (map.get(label) || 0) + 1);
      }
      counters.push({ key, values: [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })) });
    }
    return counters;
  }

  /** ثبت یک پاسخ JSON در انبار */
  /* ---------- بخش‌های شناخته‌شدهٔ سایت (site-map): رکوردهای برچسب‌دار، مدارک/رخدادهای اجرا، گزارش‌ها و فایل‌ها ---------- */

  function newSection(path, init) {
    const s = Object.assign({
      path, module: moduleOf(path), method: 'POST', url: '', records: [], meta: null, shape: 'array',
      ok: true, message: '', lastTs: 0, request: null, autoCounterFields: [], dateField: null, nameField: null,
      selected: new Set(), timelines: new Map(), attachments: new Map(), details: new Map(), lastRaw: null, requests: [], columns: [], counters: [],
    }, init || {});
    state.sections.set(path, s);
    return s;
  }

  function findRecord(path, pred) {
    const s = state.sections.get(path);
    if (!s) return null;
    return s.records.find((r) => pred(r.flat)) || null;
  }

  function finishSection(section, cap) {
    const sec = S.siteMap && S.siteMap.sectionFor(section.path);
    section.autoCounterFields = sec && sec.counters ? sec.counters.filter((k) => section.records.some((r) => r.flat[k] !== undefined)) : detectCounterFields(section.records);
    section.dateField = (sec && sec.date) || detectDateField(section.records);
    section.nameField = state.settings.caseNameField[section.path] || (sec && (sec.status ? null : null)) || detectNameField(section.records);
    section.columns = collectColumns(section.records);
    section.counters = computeCounters(section);
    if (cap) {
      state.captures.unshift({ path: cap.path, method: cap.method, url: cap.url, body: cap.requestBody, headers: cap.requestHeaders, ts: cap.ts, records: section.records.length });
      if (state.captures.length > 60) state.captures.length = 60;
    }
    notify('section', section);
  }

  /** پاسخ فهرست یک بخش شناخته‌شده */
  function ingestTyped(tr, cap) {
    const sec = tr.section;
    let section = state.sections.get(sec.path);
    if (!section) section = newSection(sec.path, { module: sec.module, typed: sec.id, virtual: !!sec.virtual });
    section.typed = sec.id;
    section.lastTs = cap.ts || Date.now();
    section.meta = tr.meta || section.meta;
    section.lastRaw = cap.json;
    if (cap.url) {
      section.request = { method: cap.method, url: cap.url, headers: cap.requestHeaders, body: cap.requestBody };
      if (!section.requests.some((r) => r.body === cap.requestBody && r.url === cap.url)) section.requests.push(section.request);
    }
    // جایگزینی: فهرست کامل (یا صفحهٔ ۱)؛ افزودن: صفحه‌های بعدی یا زیرمجموعهٔ یک پرونده (scope)
    if (tr.replace) section.records = [];
    else if (tr.scope) section.records = section.records.filter((r) => !tr.scope(r.flat));
    const existing = new Map(section.records.map((r) => [r.key, r]));
    for (const rec of tr.records) {
      const prev = existing.get(rec.key);
      if (prev) { prev.raw = rec.raw; prev.flat = rec.flat; prev.seenTs = cap.ts; }
      else { const r = { key: rec.key, raw: rec.raw, flat: rec.flat, section: sec.path, firstTs: cap.ts, seenTs: cap.ts }; section.records.push(r); existing.set(rec.key, r); }
    }
    if (tr.timelines) for (const [k, rows] of tr.timelines) section.timelines.set(k, { path: cap.path, rows, ts: Date.now() });
    if (tr.parentPatch && tr.parentPatch.record) {
      Object.assign(tr.parentPatch.record.flat, tr.parentPatch.patch);
      const ps = state.sections.get(tr.parentPatch.path);
      if (ps) finishSection(ps, null);
    }
    finishSection(section, cap);
    return section;
  }

  /** پاسخ فرزند (گزارش‌ها/پیوست‌های یک مدرک) */
  function ingestTypedChild(ch) {
    const parent = state.sections.get(ch.parentPath);
    if (!parent) return null;
    const rec = parent.records.find((r) => ch.match(r.flat));
    if (!rec) return null;
    const rows = ch.rows.map((r) => (U.isPlainObject(r) ? r : { مقدار: r }));
    const bucket = ch.kind === 'روند' ? parent.timelines : ch.kind === 'پیوست‌ها' ? parent.attachments : parent.details;
    if (ch.kind === 'گزارش‌ها') parent.details.set(rec.key, { path: ch.childPath, rows, ts: Date.now(), kind: 'گزارش‌ها' });
    else bucket.set(rec.key, { path: ch.childPath, rows, ts: Date.now() });
    notify('child', { section: parent, record: rec, kind: ch.kind });
    return rec;
  }

  /** فایل رسمی یک مدرک (مثلاً تصویر TIFF اجرائیه/ابلاغیه) از پاسخ JSON */
  function ingestTypedFile(f, cap) {
    const parent = state.sections.get(f.parentPath);
    if (!parent) return null;
    const rec = parent.records.find((r) => f.match(r.flat));
    if (!rec) return null;
    const bytes = U.base64ToBytes(f.base64);
    const name = U.safeFileName(`${rec.flat.documentTypeName || 'مدرک'}${rec.flat.documentNo ? ' ' + rec.flat.documentNo : ''}${f.reportTypeCode ? ' گزارش ' + f.reportTypeCode : ''}.${f.ext}`);
    const key = `file:${rec.key}:${f.reportTypeCode || '1'}`;
    state.files.set(key, { bytes, fileName: name, contentType: f.mime, ts: cap.ts || Date.now(), request: f.request, record: rec.key, section: parent.path });
    const list = rec.files || (rec.files = []);
    if (!list.includes(key)) list.push(key);
    notify('file', { key, fileName: name, record: rec });
    return rec;
  }

  function ingest(cap) {
    if (S.siteMap) {
      const tr = S.siteMap.transform(cap, { findRecord });
      if (tr) {
        if (tr.ignore) return null;
        if (tr.child) return ingestTypedChild(tr.child);
        if (tr.file) return ingestTypedFile(tr.file, cap);
        if (tr.section) return ingestTyped(tr, cap);
      }
    }
    const env = U.readEnvelope(cap.json);
    if (!env.isEnvelope) return null;
    if (env.data === undefined || env.data === null) return null;
    if (IGNORE_PATH.test(cap.path) || LOOKUP_PATH.test(cap.path)) return null;
    if (U.isPlainObject(env.data) && env.data.totalCount === 0) return null;   // فهرست خالی (مثلاً «موردی برای نمایش وجود ندارد»)
    const { records: rawRecords, meta, shape } = splitData(env.data);
    if (shape === 'scalar') return null;

    let section = state.sections.get(cap.path);
    const fresh = !section;
    if (!section) {
      section = {
        path: cap.path, module: moduleOf(cap.path), method: cap.method, url: cap.url, records: [], meta: null, shape,
        ok: env.ok, message: env.message, lastTs: 0, request: null, autoCounterFields: [], dateField: null, nameField: null,
        selected: new Set(), timelines: new Map(), attachments: new Map(), details: new Map(), lastRaw: null, requests: [],
      };
      state.sections.set(cap.path, section);
    }
    section.lastTs = cap.ts || Date.now();
    section.ok = env.ok;
    section.message = env.message;
    section.shape = shape;
    section.meta = meta;
    section.lastRaw = cap.json;
    section.request = { method: cap.method, url: cap.url, headers: cap.requestHeaders, body: cap.requestBody };
    if (!section.requests.some((r) => r.body === cap.requestBody && r.url === cap.url)) section.requests.push(section.request);

    // ادغام: رکوردهای تازه اضافه؛ رکوردهای قبلی با همان کلید تازه می‌شوند (صفحه‌بندی سایت را هم پوشش می‌دهد)
    const isPaged = shape.startsWith('wrapped') || (cap.requestBody && /page|skip|offset|take|limit/i.test(String(cap.requestBody)));
    if (!isPaged && !fresh && section.shape === 'array') section.records = [];
    if (shape === 'object') section.records = [];
    const existing = new Map(section.records.map((r) => [r.key, r]));
    const inBatch = new Set();
    rawRecords.forEach((raw, i) => {
      if (!U.isPlainObject(raw)) raw = { مقدار: raw };
      const flat = U.flatten(raw);
      let key = recordKey(flat, section.records.length + i);
      // کلید تکراری در همان پاسخ = شناسه‌ها یکتا نیستند (مثلاً کد ملی خودِ کاربر در همهٔ اسناد): اثر کل رکورد افزوده می‌شود تا هیچ رکوردی گم نشود
      if (inBatch.has(key)) key += '|h=' + hashText(JSON.stringify(flat));
      if (inBatch.has(key)) key += '|#' + i;
      inBatch.add(key);
      const prev = existing.get(key);
      if (prev) { prev.raw = raw; prev.flat = flat; prev.seenTs = cap.ts; return; }
      const rec = { key, raw, flat, section: section.path, firstTs: cap.ts, seenTs: cap.ts };
      section.records.push(rec);
      existing.set(key, rec);
    });
    section.autoCounterFields = detectCounterFields(section.records);
    section.dateField = detectDateField(section.records);
    section.nameField = state.settings.caseNameField[cap.path] || detectNameField(section.records);
    section.columns = collectColumns(section.records);
    section.counters = computeCounters(section);

    state.captures.unshift({ path: cap.path, method: cap.method, url: cap.url, body: cap.requestBody, headers: cap.requestHeaders, ts: cap.ts, records: rawRecords.length });
    if (state.captures.length > 60) state.captures.length = 60;

    learnLinks(section, cap, rawRecords);
    notify('section', section);
    return section;
  }

  function collectColumns(records) {
    const cols = [];
    const seen = new Set();
    for (const r of records) for (const k of Object.keys(r.flat)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
    return cols;
  }

  /* ---------- یادگیری پیوندها (گزارشات / پیوست‌ها / فایل) ---------- */

  function valuesOf(text) {
    const out = new Set();
    if (!text) return out;
    const s = String(text);
    for (const m of s.matchAll(/[\w؀-ۿ\-.]{3,}/g)) out.add(m[0]);
    return out;
  }

  /** تشخیص اینکه این پاسخ، جزئیاتِ یکی از رکوردهای بخشِ دیگری است. */
  function learnLinks(section, cap, rawRecords) {
    const probeText = (cap.requestBody || '') + ' ' + (cap.url || '');
    const tokens = valuesOf(probeText);
    if (!tokens.size) return;
    for (const parent of state.sections.values()) {
      if (parent === section) continue;
      if (parent.shape === 'object') continue;
      for (const rec of parent.records) {
        for (const [field, value] of Object.entries(rec.flat)) {
          if (value === null || value === undefined || typeof value === 'object') continue;
          const sv = String(value);
          if (sv.length < 3 || !tokens.has(sv)) continue;
          if (!ID_KEY.test(field) && !/^\d+$/.test(sv)) continue;
          const kind = guessKind(section, rawRecords);
          const link = {
            parent: parent.path, child: cap.path, method: cap.method, urlTemplate: templ(cap.url, sv), bodyTemplate: cap.requestBody ? templ(cap.requestBody, sv) : null,
            headers: cap.requestHeaders || {}, idField: field, kind,
          };
          upsertLink(link);
          section.hidden = true; // پاسخِ جزئیاتِ یک رکورد است، نه بخش مستقل
          attachChild(parent, rec, kind, cap.path, rawRecords);
          return;
        }
      }
    }
  }

  function templ(text, value) {
    return String(text).split(value).join('{{id}}');
  }

  function guessKind(section, rawRecords) {
    const keys = new Set();
    rawRecords.slice(0, 5).forEach((r) => U.isPlainObject(r) && Object.keys(U.flatten(r)).forEach((k) => keys.add(k)));
    const arr = [...keys];
    const hasStatus = arr.some((k) => /(status|state|وضعیت|step|stage|مرحله|action|اقدام)/i.test(k));
    const hasDate = arr.some((k) => DATE_KEY.test(k));
    const hasFile = arr.some((k) => FILE_KEY.test(k) && !/text|content/i.test(k));
    if (/report|history|log|flow|روند|گزارش/i.test(section.path)) return 'روند';
    if (/attach|file|پیوست|document/i.test(section.path) && hasFile) return 'پیوست‌ها';
    if (hasStatus && hasDate && rawRecords.length !== 1) return 'روند';
    if (hasFile) return 'پیوست‌ها';
    return 'جزئیات';
  }

  function upsertLink(link) {
    const i = state.links.findIndex((l) => l.parent === link.parent && l.child === link.child);
    if (i >= 0) state.links[i] = Object.assign(state.links[i], link, { kind: state.links[i].kindLocked ? state.links[i].kind : link.kind });
    else state.links.push(link);
    saveLinks();
    notify('links');
  }

  function attachChild(parent, rec, kind, childPath, rawRecords) {
    const rows = rawRecords.map((r) => (U.isPlainObject(r) ? r : { مقدار: r }));
    const bucket = kind === 'روند' ? parent.timelines : kind === 'پیوست‌ها' ? parent.attachments : parent.details;
    bucket.set(rec.key, { path: childPath, rows, ts: Date.now() });
    notify('child', { section: parent, record: rec, kind });
  }

  function linksFor(sectionPath, kind) {
    return state.links.filter((l) => l.parent === sectionPath && (!kind || l.kind === kind));
  }

  function setLinkKind(parent, child, kind) {
    const l = state.links.find((x) => x.parent === parent && x.child === child);
    if (l) { l.kind = kind; l.kindLocked = true; saveLinks(); notify('links'); }
  }

  /** ساخت درخواست بازپخش برای یک رکورد از روی پیوند یادگرفته‌شده */
  function buildRequest(link, rec, extra) {
    const id = link.idField ? rec.flat[link.idField] : null;
    if (link.idField && (id === null || id === undefined || id === '')) return null;
    const sid = id === null || id === undefined ? '' : String(id);
    const fillAll = (t, enc) => String(t).split('{{id}}').join(enc ? encodeURIComponent(sid) : sid)
      .replace(/\{\{(\w+)\}\}/g, (m, k) => { const v = extra && extra[k] !== undefined ? extra[k] : rec.flat[k]; return v === null || v === undefined ? '' : (enc ? encodeURIComponent(String(v)) : String(v)); });
    return { method: link.method, url: fillAll(link.urlTemplate, true), body: link.bodyTemplate ? fillAll(link.bodyTemplate, true) : null, headers: link.headers };
  }

  /** ثبت پاسخ بازپخش‌شده برای یک رکورد */
  function ingestChild(link, rec, json) {
    const env = U.readEnvelope(json);
    const data = env.isEnvelope ? env.data : json;
    const { records } = splitData(data === null || data === undefined ? [] : data);
    const parent = state.sections.get(link.parent);
    if (!parent) return [];
    attachChild(parent, rec, link.kind, link.child, records);
    return records;
  }

  /* ---------- فایل‌ها ---------- */

  function ingestFile(f) {
    if (!f.bytes || !f.bytes.length) return;
    state.files.set(f.url, { bytes: f.bytes, fileName: f.fileName, contentType: f.contentType, ts: f.ts, request: { method: f.method, url: f.url, headers: f.requestHeaders, body: f.requestBody } });
    // یادگیری الگوی فایل: کدام رکورد/پیوست این فایل را خواسته؟
    const tokens = valuesOf((f.requestBody || '') + ' ' + f.url);
    for (const parent of state.sections.values()) {
      const scan = (rows, ownerKey) => {
        for (const row of rows) {
          const flat = row.flat || U.flatten(row.raw || row);
          for (const [field, value] of Object.entries(flat)) {
            if (value === null || typeof value === 'object') continue;
            const sv = String(value);
            if (sv.length < 3 || !tokens.has(sv)) continue;
            if (!ID_KEY.test(field) && !FILE_KEY.test(field) && !/^\d+$/.test(sv)) continue;
            upsertLink({ parent: parent.path, child: f.path, method: f.method, urlTemplate: templ(f.url, sv), bodyTemplate: f.requestBody ? templ(f.requestBody, sv) : null, headers: f.requestHeaders || {}, idField: field, kind: 'فایل', owner: ownerKey ? 'پیوست‌ها' : 'رکورد' });
            return true;
          }
        }
        return false;
      };
      if (scan(parent.records)) break;
      let found = false;
      for (const [k, att] of parent.attachments) if (scan(att.rows, k)) { found = true; break; }
      if (found) break;
    }
    addLog('info', `فایل «${f.fileName}» از سایت گرفته شد (${U.faDigits(f.bytes.length)} بایت)`);
    notify('file', f);
  }

  /** فیلدهای فایل‌گونهٔ یک رکورد: URL، مسیر یا base64 */
  function fileFieldsOf(flat) {
    const out = [];
    for (const [k, v] of Object.entries(flat)) {
      if (typeof v !== 'string' || v.length < 4) continue;
      if (/^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(v)) out.push({ field: k, kind: 'base64', value: v });
      else if (v.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(v) && FILE_KEY.test(k)) out.push({ field: k, kind: 'base64', value: v });
      else if ((FILE_EXT.test(v) && /[\/\\]/.test(v)) || (/^(https?:)?\/\//.test(v) && FILE_KEY.test(k))) out.push({ field: k, kind: 'url', value: v });
    }
    return out;
  }

  /* ---------- تنظیمات ---------- */

  function setSetting(key, value) { state.settings[key] = value; saveSettings(); notify('settings'); }
  function setSectionLabel(path, label) { state.settings.labels[path] = label; saveSettings(); notify('settings'); }
  function setCaseNameField(path, field) {
    state.settings.caseNameField[path] = field;
    const s = state.sections.get(path);
    if (s) s.nameField = field;
    saveSettings(); notify('settings');
  }
  function setCounterFields(path, fields) {
    state.settings.counterFields[path] = fields;
    const s = state.sections.get(path);
    if (s) { s.counters = computeCounters(s); notify('section', s); }
    saveSettings();
  }

  function caseNameOf(section, rec) {
    const known = S.siteMap && S.siteMap.sectionFor(section.path);
    if (known && known.nameOf && !state.settings.caseNameField[section.path]) {
      try { const nm = known.nameOf(rec.flat); if (nm) return U.safeFileName(U.faDigits(nm), 'پرونده'); } catch (e) { /* ادامه */ }
    }
    const f = section.nameField;
    const v = f ? rec.flat[f] : null;
    const base = v === null || v === undefined || v === '' ? rec.key : U.formatValue(v);
    return U.safeFileName(base, 'پرونده');
  }

  /** برچسب فارسی فیلد (بخش شناخته‌شده → نقشه؛ وگرنه خودِ کلید) */
  function fieldLabel(section, key) {
    const path = typeof section === 'string' ? section : section && section.path;
    return S.siteMap ? S.siteMap.fieldLabel(path, key) : key;
  }

  function sectionList() {
    const childPaths = new Set(state.links.map((l) => l.child));
    const known = (p) => S.siteMap && S.siteMap.sectionFor(p);
    return [...state.sections.values()].filter((s) => !s.hidden && !childPaths.has(s.path) && !(S.siteMap && S.siteMap.CHILD_PATHS.test(s.path)))
      .sort((a, b) => { const ka = known(a.path), kb = known(b.path); if (ka && kb) return ka.order - kb.order; if (ka) return -1; if (kb) return 1; return a.lastTs - b.lastTs; });
  }

  S.store = {
    state, subscribe, notify, ingest, ingestFile, ingestChild, buildRequest, linksFor, setLinkKind, labelFor, moduleOf,
    computeCounters, caseNameOf, fieldLabel, fileFieldsOf, setSetting, setSectionLabel, setCaseNameField, setCounterFields, sectionList,
    addLog, splitData, detectCounterFields, detectDateField, detectNameField, MODULE_LABELS, newSection, findRecord, finishSection,
  };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
