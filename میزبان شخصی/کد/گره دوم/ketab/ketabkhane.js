'use strict';
/* کتابخانهٔ حقوقی (۱٫۲۰٫۰) — به دستور کارفرما ۱۴۰۵/۰۶/۳۱:
   «برای مدل یک ابزار آموزش بذار که تمام متن‌های حقوقی به‌روز بهش بده و سایت‌های معتبر و کتابخانهٔ معتبر حقوقی، نه ویکی‌پدیا».
   متن رسمی قوانین و مقررات ایران، کلمه‌به‌کلمه از منبع رسمی، با شناسه، تاریخ تصویب، مرجع تصویب، نشانی و اثر انگشت؛
   تکه‌بندی به تفکیک ماده؛ جست‌وجوی واژه‌ای (FTS) + معنایی (BGE-M3 از danesh.js)؛ هیچ منبع کم‌اعتباری وارد نمی‌شود.
   منبع آماده: مرکز پژوهش‌های مجلس شورای اسلامی (rc.majlis.ir) — صفحهٔ چاپی هر قانون متن خام است.
   منابع دیگر (qavanin.ir، dotic.ir، rrk.ir، ara.jri.ac.ir، cbi.ir) در همین جدول ثبت‌اند ولی صفحهٔ محافظ جاوااسکریپت یا ساختار پویا دارند؛ به‌وقت خود افزوده می‌شوند و تا آن روز «آماده نیست» گزارش می‌شود، نه حدس. */
const fs = require('fs'), path = require('path'), https = require('https'), http = require('http'), crypto = require('crypto');

let S = null, H = null, DB = null, DB_ERR = '';
const NASKHE = '1.1.0';   /* ۱۴۰۵/۰۷/۰۱: تکه‌بندی ماده‌های وسط سطر و پس از ZWNJ + یافتن مستقیم «مادهٔ N قانون X» */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) naghshe-ketabkhane/1.0 (personal legal library; polite crawler)';
const PORT_EMB = 8793;
const TEKKE = 1500, TEKKE_KAM = 900;
const MANABE = {
  majlis:  { onvan: 'مرکز پژوهش‌های مجلس شورای اسلامی', host: 'rc.majlis.ir', emtiaz: 90, amade: true,  hoshdar: 'متن منتشرشده در سامانهٔ قوانین مرکز پژوهش‌های مجلس؛ اصلاحات و الحاقات بعدی را با تاریخ تصویب بسنجید' },
  /* ۱۴۰۵/۰۷/۰۲ دستور کارفرما: منابع مجاز فقط همین‌هاست (همه رسمی و دولتی)؛ ویکی‌پدیا و هر جای دیگر هرگز */
  rrk:   { onvan: 'روزنامهٔ رسمی جمهوری اسلامی ایران', host: 'rrk.ir', amade: true },
  dotic: { onvan: 'پایگاه ملی اطلاع‌رسانی قوانین و مقررات کشور', host: 'dotic.ir', amade: true },
  ara:   { onvan: 'سامانهٔ ملی آرای قضایی (پژوهشگاه قوهٔ قضاییه)', host: 'ara.jri.ac.ir', amade: true },
  ssaa:  { onvan: 'سازمان ثبت اسناد و املاک کشور — قوانین، آیین‌نامه‌ها و بخشنامه‌های ثبتی', host: 'ssaa.ir', amade: true },
  qavanin: { onvan: 'سامانهٔ ملی قوانین و مقررات جمهوری اسلامی ایران (qavanin.ir) — از راه Chrome کارفرما', host: 'qavanin.ir', amade: true },
  cbi:   { onvan: 'بانک مرکزی جمهوری اسلامی ایران — قوانین و مقررات پولی و بانکی', host: 'cbi.ir', amade: false, chera: 'لایهٔ متن PDFهایش خراب است و کارفرما OCR نخواست؛ عنوان‌های فهرست‌هایش از مرورگر کارفرما گرفته و متن هر قانون از مجلس یا روزنامهٔ رسمی آورده می‌شود (amal=cbi)' },
};
/* دسته‌ها ← مرجع تصویب در سامانهٔ مجلس (پارامتر lu_approve_reference) */
const DASTE = {
  'قانون اساسی و سیاست‌های کلی نظام': ['lar1'],
  'قوانین مصوب مجلس (کیفری، مدنی، تجارت، کار، مالیات، ثبت، آیین دادرسی و …)': ['lar2'],
  'مصوبات شورای انقلاب': ['lar3'],
  'مصوبات مجمع تشخیص مصلحت نظام': ['lar4'],
  'آرای وحدت رویهٔ دیوان عالی کشور': ['lar6'],
  'آرای وحدت رویهٔ دیوان عدالت اداری': ['lar7'],
  'مصوبات هیئت وزیران (آیین‌نامه‌ها و تصویب‌نامه‌ها)': ['lar8'],
  'مصوبات قوهٔ قضاییه': ['lar9'],
  'مصوبات و نظریات شورای نگهبان': ['lar18'],
  'مصوبات شورای پول و اعتبار (بانکی)': ['lar20'],
  'آرای دادگاه‌ها (سامانهٔ ملی آرای قضایی)': ['ara_ray'],
  'پایگاه ملی اطلاع‌رسانی قوانین و مقررات': ['dotic'],
};
/* ۱۴۰۵/۰۷/۰۲: اولویت دریافت به تفکیک دسته — قانون‌ها و آرای وحدت رویه پیش از هزاران تصویب‌نامهٔ هیئت وزیران */
const OLAVIAT = { qavanin: 60, ssaa: 92, lar1: 95, lar2: 90, lar4: 88, lar6: 85, lar3: 80, lar9: 75, lar7: 70, lar18: 65, lar20: 65, ara_ray: 60, dotic: 58, rrk: 55, lar8: 40 };
const olaviatLar = lar => OLAVIAT[lar] || 50;
const MANBA_DASTE = lar => /^qavanin/.test(lar) ? 'qavanin' : /^ssaa/.test(lar) ? 'ssaa' : /^ara_/.test(lar) ? 'ara' : /^dotic/.test(lar) ? 'dotic' : /^rrk/.test(lar) ? 'rrk' : 'majlis';
const tgk = () => { try { return !!(S && S.metaGet && S.metaGet('tamamghodrat') === '1'); } catch(e){ return false; } };
const NAM_DASTE = { qavanin: 'سامانهٔ ملی قوانین و مقررات (قانون، مقرره، رأی، نظر مشورتی)', ssaa: 'قوانین، آیین‌نامه‌ها و بخشنامه‌های ثبتی (سازمان ثبت اسناد و املاک)', lar1: 'قانون اساسی و سیاست‌های کلی نظام', lar2: 'قوانین مجلس', lar3: 'مصوبات شورای انقلاب', lar4: 'مصوبات مجمع تشخیص مصلحت نظام', lar6: 'آرای وحدت رویهٔ دیوان عالی کشور', lar7: 'آرای وحدت رویهٔ دیوان عدالت اداری', lar8: 'مصوبات هیئت وزیران', lar9: 'مصوبات قوهٔ قضاییه', lar18: 'مصوبات و نظریات شورای نگهبان', lar20: 'مصوبات شورای پول و اعتبار', ara_ray: 'آرای دادگاه‌ها', rrk: 'قوانین و مقررات منتشرشده در روزنامهٔ رسمی', dotic_ghanoon: 'قوانین', dotic_moghararat: 'مقررات', dotic_ara: 'آرای حقوقی', dotic_nazar: 'نظرات حقوقی', dotic_tarh: 'طرح‌ها و لوایح', dotic_pishnevis: 'پیش‌نویس مقررات' };
const R = { on: false, timer: null, busy: false, gam: 'خاموش', akharin: '', akharinAt: 0, khata: '', log: [], shomar: { fehrest: 0, gerefte: 0, khata: 0, namaye: 0 }, fasele: 1500 };

function log(m){ try { S.log('کتابخانه: ' + m); } catch(e){} R.log.push(new Date().toISOString().slice(11, 19) + ' ' + m); if (R.log.length > 60) R.log.shift(); }
function ts(){ return new Date().toISOString(); }
function DBP(){ return path.join(S.HERE, 'کتابخانهٔ حقوقی.sqlite'); }
function sha(s){ return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function fa(n){ return String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }

function db(){
  if (DB) return DB;
  let sqlite; try { sqlite = require('node:sqlite'); } catch(e){ DB_ERR = 'node:sqlite در دسترس نیست'; return null; }
  try {
    DB = new sqlite.DatabaseSync(DBP());
    DB.exec('PRAGMA busy_timeout=20000;');
    DB.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS saf(url TEXT PRIMARY KEY, manba TEXT NOT NULL, lar TEXT, olaviat INTEGER NOT NULL DEFAULT 50, vaziat TEXT NOT NULL DEFAULT 'dar_saf', talash INTEGER NOT NULL DEFAULT 0, khata TEXT, ts TEXT);
      CREATE INDEX IF NOT EXISTS saf_v ON saf(vaziat, olaviat DESC, ts);
      CREATE TABLE IF NOT EXISTS qanun(id INTEGER PRIMARY KEY, manba TEXT NOT NULL, shenase TEXT, url TEXT UNIQUE NOT NULL, onvan TEXT, marja TEXT, lar TEXT, tarikh TEXT, ablagh TEXT, shomare TEXT, meta TEXT, matn TEXT, sha256 TEXT, hajm INTEGER, mavad INTEGER, ts TEXT);
      CREATE INDEX IF NOT EXISTS qanun_onvan ON qanun(onvan);
      CREATE TABLE IF NOT EXISTS tekke(id INTEGER PRIMARY KEY, qid INTEGER NOT NULL, shomare INTEGER NOT NULL, madde TEXT, matn TEXT NOT NULL, bordar BLOB);
      CREATE INDEX IF NOT EXISTS tekke_q ON tekke(qid);
      CREATE INDEX IF NOT EXISTS tekke_madde ON tekke(madde);
      CREATE INDEX IF NOT EXISTS tekke_bibordar ON tekke(id) WHERE bordar IS NULL;
      CREATE VIRTUAL TABLE IF NOT EXISTS tekke_fts USING fts5(matn, onvan, tokenize='unicode61');`);
    return DB;
  } catch(e){ DB_ERR = e.message || String(e); DB = null; return null; }
}
function mget(k){ const d = db(); if (!d) return ''; const r = d.prepare('SELECT v FROM meta WHERE k=?').get(k); return r ? r.v : ''; }
function mset(k, v){ const d = db(); if (d) d.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v)); }
/* ۱۴۰۵/۰۷/۰۲ — برنامهٔ دسکتاپ گاهی دو نمونهٔ هم‌زمان سرور می‌سازد: فقط نمونهٔ دارندهٔ قفل، گردآوری و نمایه‌سازی و یکتایی را می‌راند (بی دوباره‌کاری و بی دو مدل هم‌زمان) */
function qoflK(){ try { const d = db(); if (!d) return false; const now = Date.now(); d.prepare("INSERT OR IGNORE INTO meta(k,v) VALUES('ketab_qofl','')").run(); return d.prepare("UPDATE meta SET v=? WHERE k='ketab_qofl' AND (v='' OR v LIKE ? OR CAST(substr(v, instr(v,'|')+1) AS INTEGER) < ?)").run(process.pid + '|' + now, process.pid + '|%', now - 90000).changes === 1; } catch(e){ return false; } }
function malekK(){ try { const v = String(mget('ketab_qofl') || '').split('|'); const pid = +v[0] || 0, t = +v[1] || 0; return pid && pid !== process.pid && Date.now() - t < 90000 ? pid : 0; } catch(e){ return 0; } }

/* ---------------------- دریافت (فقط GET، مؤدبانه) ---------------------- */
function get(url, ms, hop){
  return new Promise(resolve => {
    let done = false; const fin = v => { if (!done){ done = true; hoshdarMizban(url, v && v.code); resolve(v); } };
    try {
      const mod = url.startsWith('http://') ? http : https;
      const req = mod.get(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'fa,en;q=0.5' }, timeout: ms || 60000 }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (hop || 0) < 3){ res.resume(); const u = new URL(res.headers.location, url).toString(); return get(u, ms, (hop || 0) + 1).then(fin); }
        if (res.statusCode !== 200){ res.resume(); return fin({ code: res.statusCode, body: '' }); }
        const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => fin({ code: 200, body: Buffer.concat(ch).toString('utf8') }));
        res.on('error', e => fin({ code: 'net', body: '', err: e.message }));
      });
      req.on('timeout', () => { req.destroy(); fin({ code: 'timeout', body: '' }); });
      req.on('error', e => fin({ code: 'net', body: '', err: e.message }));
    } catch(e){ fin({ code: 'net', body: '', err: e.message }); }
  });
}
function decode(s){
  return String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&zwnj;/g, '‌');
}
function strip(html){ return decode(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/[‎‏]+/g, '').replace(/\s+/g, ' ').trim(); }
function matnAzHtml(html){
  let t = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '');
  t = decode(t).replace(/\r/g, '').replace(/[‎‏]+/g, '').replace(/[ \t ]+/g, ' ');
  t = t.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

/* ---------------------- مرکز پژوهش‌های مجلس ---------------------- */
const MJ = {
  fehrestUrl: (lar, page) => 'https://rc.majlis.ir/fa/law/search?lu_approve_reference=' + lar + '&o=&ot=d&page=' + page,
  showUrl: id => 'https://rc.majlis.ir/fa/law/show/' + id,
  printUrl: id => 'https://rc.majlis.ir/fa/law/print_version/' + id,
  ids(html){ const s = new Set(); const re = /\/fa\/law\/show\/(\d+)/g; let m; while ((m = re.exec(html))) s.add(m[1]); return [...s]; },
  parseShow(html){
    const t = /<h1 class="law-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    const meta = {}; const re = /<span class="law-meta-title">([^<]+)<\/span\s*>\s*<span[^>]*>([\s\S]*?)<\/span/g; let m;
    while ((m = re.exec(html))){ const k = strip(m[1]).replace(/:$/, '').trim(); const v = strip(m[2]); if (k && v) meta[k] = v; }
    return { onvan: t ? strip(t[1]) : '', meta };
  },
  parsePrint(html){
    const m = /id="law_print"[\s\S]*?<div style="[^"]*white-space:\s*pre-wrap;?"[^>]*>([\s\S]*?)<\/div>\s*<a/i.exec(html);
    if (!m) return '';
    return matnAzHtml(m[1]);
  },
};

/* ---------------------- تکه‌بندی به تفکیک ماده / اصل ---------------------- */
/* شمارهٔ ماده گاهی با واژه نوشته می‌شود: «اصل یکصد و پنجاه و هفتم» → ۱۵۷ */
const ADAD = { 'صفر':0,'یک':1,'یکم':1,'اول':1,'اولین':1,'نخست':1,'دو':2,'دوم':2,'سه':3,'سوم':3,'چهار':4,'چهارم':4,'پنج':5,'پنجم':5,'شش':6,'ششم':6,'هفت':7,'هفتم':7,'هشت':8,'هشتم':8,'نه':9,'نهم':9,'ده':10,'دهم':10,
  'یازده':11,'یازدهم':11,'دوازده':12,'دوازدهم':12,'سیزده':13,'سیزدهم':13,'چهارده':14,'چهاردهم':14,'پانزده':15,'پانزدهم':15,'شانزده':16,'شانزدهم':16,'هفده':17,'هفدهم':17,'هجده':18,'هجدهم':18,'هیجده':18,'هیجدهم':18,'نوزده':19,'نوزدهم':19,
  'بیست':20,'بیستم':20,'سی':30,'سیم':30,'سی‌ام':30,'چهل':40,'چهلم':40,'پنجاه':50,'پنجاهم':50,'شصت':60,'شصتم':60,'هفتاد':70,'هفتادم':70,'هشتاد':80,'هشتادم':80,'نود':90,'نودم':90,
  'صد':100,'صدم':100,'یکصد':100,'یکصدم':100,'دویست':200,'دویستم':200,'سیصد':300,'سیصدم':300,'چهارصد':400,'چهارصدم':400,'پانصد':500,'پانصدم':500,'ششصد':600,'ششصدم':600,'هفتصد':700,'هفتصدم':700,'هشتصد':800,'هشتصدم':800,'نهصد':900,'نهصدم':900,'هزار':1000,'هزارم':1000 };
function vazheBeAdad(s){
  const w = String(s || '').replace(/[\u200c\u200f\u200e]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').split(/\s+/).map(x => x.trim()).filter(x => x && x !== 'و');
  if (!w.length) return 0;
  let n = 0;
  for (const x of w){ if (!(x in ADAD)) return 0; n += ADAD[x]; }
  return n;
}
const NAMAYAN = /^[\s\u200c\u200d\u200e\u200f\ufeff]+/;
function sarMadde(line){
  const l = line.replace(NAMAYAN, '').trim();
  let m = /^(ماده|مادّه|ماده‌ی|اصل)\s*(واحده|[\d۰-۹]+(?:\s*مکرر(?:\s*[\d۰-۹]+)?)?)(?=[\s:\-–—ـ.)]|$)/.exec(l);
  if (m){ const noe = /^اصل/.test(m[1]) ? 'اصل' : 'ماده'; const sh = m[2].replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)); return noe + ' ' + sh.replace(/\s+/g, ' '); }
  m = /^(ماده|مادّه|ماده‌ی|اصل)\s+([آ-ی\u200c\s]{2,60}?)\s*[:\-–—ـ]/.exec(l);
  if (m){ const n = vazheBeAdad(m[2]); if (n > 0) return (/^اصل/.test(m[1]) ? 'اصل ' : 'ماده ') + n; }
  return '';
}
/* ۱۴۰۵/۰۷/۰۱: سرِ ماده در متن‌های مجلس اغلب وسط سطر می‌آید («... نافذ است . ماده 11 - اموال») یا پس از نویسهٔ نامرئی ZWNJ.
   سر ماده = «ماده/اصل» + شماره (رقمی، با پرانتز یا بی آن، با «مکرر») + خط تیره یا دونقطه؛ ارجاع‌ها («موضوع ماده 5 این قانون»، «ماده (326) در») خط تیره ندارند. */
const SAR_VASAT = /(^|[^\p{L}\p{N}])(ماده|مادّه|اصل)[\s\u200c]*\(?[\s\u200c]*([\d۰-۹]+(?:[\s\u200c]*مکرر(?:[\s\u200c]*[\d۰-۹]+)?)?|واحده)[\s\u200c]*\)?[\s\u200c]*[-–—ـ:]/gu;
const ERJA = /(موضوع|مذکور|مندرج|مقرر|طبق|مطابق|موجب|برابر|اصلاح|الحاق|ذیل|تبصره|مورد|مفاد|رعایت|بند|قسمت|دستور|اجرای|مواد|و)[\s\u200c(]*$/;
const FEHREST_ADAD = /^[\s\u200c]*[\d۰-۹]+[\s\u200c]*([-–—،,)]|و[\s\u200c]|تا[\s\u200c])/;
function sarha(matn){
  const s = String(matn || ''); const out = new Map();
  let m; SAR_VASAT.lastIndex = 0;
  while ((m = SAR_VASAT.exec(s))){
    const at = m.index + m[1].length;
    const pish = s.slice(Math.max(0, at - 25), at);
    if (ERJA.test(pish)) continue;
    if (FEHREST_ADAD.test(s.slice(m.index + m[0].length, m.index + m[0].length + 14))) continue;   /* «ماده 118 - 119 - 120» فهرست ارجاع است */
    const noe = /^اصل/.test(m[2]) ? 'اصل' : 'ماده';
    const sh = m[3].replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[\s\u200c]+/g, ' ');
    out.set(at, noe + ' ' + sh);
    SAR_VASAT.lastIndex = at + 4;
  }
  /* سرهای واژه‌ای در آغاز سطر («اصل یکصد و پنجاه و هفتم -») */
  let p = 0;
  for (const l of s.split('\n')){
    const l2 = l.replace(NAMAYAN, '').trim();
    const sm = /^(ماده|مادّه|اصل)\s*[\d۰-۹]+\s*$/.test(l2) || !/^(ماده|مادّه|ماده‌ی|اصل)\s*[\d۰-۹]/.test(l2) ? sarMadde(l) : '';
    if (sm){ const at = p + (l.length - l.replace(NAMAYAN, '').length); if (![...out.keys()].some(k => Math.abs(k - at) < 3)) out.set(at, sm); }
    p += l.length + 1;
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}
function borKon(t, madde, out){
  t = t.trim(); if (t.length <= 6) return;
  if (t.length <= TEKKE * 2){ out.push({ madde, matn: t }); return; }
  /* ماده‌های بلند: در مرز جمله یا سطر بریده می‌شوند، برچسب ماده می‌ماند */
  let i = 0;
  while (i < t.length){
    let j = Math.min(t.length, i + TEKKE * 2);
    if (j < t.length){ const k = Math.max(t.lastIndexOf('\n', j), t.lastIndexOf('. ', j), t.lastIndexOf('.\n', j)); if (k > i + TEKKE) j = k + 1; }
    const c = t.slice(i, j).trim(); if (c.length > 6) out.push({ madde, matn: c }); i = j;
  }
}
function tekkeha(matn){
  const s = String(matn || '');
  const sh = sarha(s);
  const out = [];
  if (sh.length){
    borKon(s.slice(0, sh[0][0]), '', out);
    sh.forEach(([at, madde], i) => borKon(s.slice(at, i + 1 < sh.length ? sh[i + 1][0] : s.length), madde, out));
  }
  /* اگر قانون ماده ندارد (رأی، سیاست کلی)، تکه‌های پیوسته */
  if (out.filter(x => x.madde).length === 0){
    if (s.length <= TEKKE){ return s.trim().length > 6 ? [{ madde: '', matn: s.trim() }] : []; }
    const o2 = []; let buf = '';
    for (const p of s.split(/\n\n+/)){ if ((buf + '\n\n' + p).length > TEKKE_KAM && buf){ borKon(buf, '', o2); buf = p; } else buf = buf ? buf + '\n\n' + p : p; }
    if (buf.trim().length > 30) borKon(buf, '', o2);
    return o2;
  }
  return out;
}

/* ---------------------- گام‌های کار ---------------------- */
function larHa(){ try { return JSON.parse(mget('lar_ha') || '[]'); } catch(e){ return []; } }
function beroz(){ return mget('halat') === 'beroz'; }
async function gamFehrest(){
  const d = db(); const lars = larHa(); if (!lars.length) return false;
  /* آرا و پایگاه ملی فقط شماره به صف می‌افزایند (بی‌درخواست شبکه)؛ پیش از صفحه‌های مجلس، تا هر سه منبع هم‌زمان کار کنند */
  const pishro = l => /^(ara_|dotic)/.test(l) ? 0 : 1;
  /* ۱۴۰۵/۰۷/۰۲: همهٔ دسته‌ها به نوبت (نه یکی پس از دیگری) تا هیچ دسته‌ای «در انتظار نوبت» نماند؛ آرا و پایگاه ملی (بی‌درخواست شبکه) پیش از همه */
  const baz = [...lars].sort((a, b) => pishro(a) - pishro(b)).filter(l => mget('fehrest:' + l + ':tamam') !== '1');
  const pishL = baz.find(l => pishro(l) === 0); R.fk = (R.fk || 0) + 1;
  for (const lar of (pishL ? [pishL] : baz.length ? [baz[R.fk % baz.length]] : [])){
    if (lar === 'dotic'){   /* پایگاه ملی: هر مطلب نشانی /news/شماره دارد؛ شماره‌ها پیاپی‌اند */
      const az = +(mget('fehrest:dotic:page') || 1), ta = az + 4999, SAGHF = +(mget('dotic:saghf') || 21800);
      const ins = d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)'); let nu = 0;
      d.exec('BEGIN'); try { for (let i = az; i <= Math.min(ta, SAGHF); i++){ if (ins.run('https://dotic.ir/news/' + i, 'dotic', 'dotic', olaviatLar('dotic'), 'dar_saf', ts()).changes) nu++; } d.exec('COMMIT'); } catch(e){ d.exec('ROLLBACK'); throw e; }
      mset('fehrest:dotic:page', ta + 1); if (ta >= SAGHF) mset('fehrest:dotic:tamam', '1');
      R.shomar.fehrest += nu; log('فهرست پایگاه ملی: شماره‌های ' + az + ' تا ' + Math.min(ta, SAGHF) + ' به صف رفت'); return true;
    }
    if (lar === 'ara_ray'){   /* سامانهٔ ملی آرا: هر رأی نشانی /Judge/Text/شماره دارد؛ شماره‌ها پیاپی‌اند و در دسته‌های ۵۰۰۰تایی به صف می‌روند */
      const az = +(mget('fehrest:ara_ray:page') || 1), ta = az + 4999, SAGHF = +(mget('ara:saghf') || 46000);
      const ins = d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)'); let nu = 0;
      d.exec('BEGIN'); try { for (let i = az; i <= Math.min(ta, SAGHF); i++){ if (ins.run('https://ara.jri.ac.ir/Judge/Text/' + i, 'ara', 'ara_ray', olaviatLar('ara_ray'), 'dar_saf', ts()).changes) nu++; } d.exec('COMMIT'); } catch(e){ d.exec('ROLLBACK'); throw e; }
      mset('fehrest:ara_ray:page', ta + 1); if (ta >= SAGHF) mset('fehrest:ara_ray:tamam', '1');
      R.shomar.fehrest += nu; log('فهرست آرای قضایی: شماره‌های ' + az + ' تا ' + Math.min(ta, SAGHF) + ' به صف رفت'); return true;
    }
    const page = +(mget('fehrest:' + lar + ':page') || 1);
    R.gam = 'فهرست ' + lar + ' صفحهٔ ' + page;
    const r = await get(MJ.fehrestUrl(lar, page), 60000);
    R.akharinAt = Date.now();
    if (r.code !== 200){ R.khata = 'فهرست ' + lar + ' صفحهٔ ' + page + ': ' + r.code; log(R.khata); const bad = +(mget('fehrest:' + lar + ':bad') || 0) + 1; mset('fehrest:' + lar + ':bad', bad); if (bad >= 6){ mset('fehrest:' + lar + ':tamam', '1'); log('فهرست ' + lar + ' پس از ۶ خطای پیاپی کنار گذاشته شد'); } return true; }
    mset('fehrest:' + lar + ':bad', 0);
    const ids = MJ.ids(r.body);
    let nu = 0; const ins = d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)');
    for (const id of ids){ const c = ins.run(MJ.showUrl(id), 'majlis', lar, olaviatLar(lar), 'dar_saf', ts()); if (c.changes) nu++; }
    R.shomar.fehrest += nu;
    const khali = ids.length === 0; const tekrari = !khali && nu === 0;
    const pish = +(mget('fehrest:' + lar + ':tekrari') || 0); mset('fehrest:' + lar + ':tekrari', tekrari ? pish + 1 : 0);
    if (khali || (tekrari && pish >= 2) || page >= 20000){ mset('fehrest:' + lar + ':tamam', '1'); log('فهرست ' + lar + ' تمام شد در صفحهٔ ' + page + (khali ? ' (خالی)' : ' (تازه‌ای نبود)')); }
    else mset('fehrest:' + lar + ':page', page + 1);
    log('فهرست ' + lar + ' صفحهٔ ' + page + ': ' + ids.length + ' مورد، ' + nu + ' تازه');
    return true;
  }
  return false;
}
/* ---------------------- سامانهٔ ملی آرای قضایی (ara.jri.ac.ir) — ۱۴۰۵/۰۷/۰۲ ----------------------
   هر رأی: عنوان، پیام (چکیده)، شمارهٔ پرونده و دادنامه، شعبه، تاریخ، موضوع و متن کامل رأی‌ها (بدوی/تجدیدنظر)، کلمه‌به‌کلمه. */
function tekkehaRay(matn){
  const out = []; const s = String(matn || '');
  const re = /^(?:رأی|رای|دادنامه|تصمیم)[^\n]{0,60}(?:دادگاه|دیوان|شعبه)[^\n]{0,60}$/gm; const sar = []; let m;
  while ((m = re.exec(s))) sar.push([m.index, m[0].trim()]);
  if (!sar.length){ borKon(s, 'رأی', out); return out; }
  borKon(s.slice(0, sar[0][0]), 'چکیده', out);
  sar.forEach(([at, t], i) => borKon(s.slice(at, i + 1 < sar.length ? sar[i + 1][0] : s.length), t.slice(0, 80), out));
  return out;
}
async function gamDaryaftAra(row){
  const d = db(); const id = (/\/Judge\/Text\/(\d+)/.exec(row.url) || [])[1];
  if (!id){ d.prepare("UPDATE saf SET vaziat='khata', khata=? WHERE url=?").run('نشانی ناشناخته', row.url); return true; }
  R.gam = 'دریافت رأی ' + id;
  const a = await get(row.url, 60000); R.akharinAt = Date.now();
  if (a.code !== 200){ d.prepare("UPDATE saf SET talash=talash+1, khata=?, ts=? WHERE url=?").run('صفحه: ' + a.code, ts(), row.url); if (row.talash + 1 >= 4) d.prepare("UPDATE saf SET vaziat='khata' WHERE url=?").run(row.url); return true; }
  const html = a.body;
  const onvan = strip((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '');
  if (!onvan){ d.prepare("UPDATE saf SET vaziat='khali', ts=? WHERE url=?").run(ts(), row.url); return true; }   /* شمارهٔ بی‌رأی */
  const i = html.indexOf('id="treeText"'); let tan = i >= 0 ? html.slice(html.indexOf('>', i) + 1) : '';
  const j = tan.search(/>\s*فهرست\s*</); if (j > 0) tan = tan.slice(0, j);
  const matnRay = matnAzHtml(tan.replace(/<h1[^>]*>/gi, '\n').replace(/<\/h1>/gi, '\n'));
  const kol = matnAzHtml(html);
  const payam = ((/پیام:\s*([^\n]+)/.exec(kol) || [])[1] || '').trim();
  /* تاریخ و شماره: در رأی‌های تازه «تاریخ:» در متن است؛ در رأی‌های قدیم‌تر در کادر «تاریخ دادنامه قطعی» (۱۴۰۵/۰۷/۰۲) */
  const tarikh = ((/تاریخ:\s*(1[34]\d\d\/\d{1,2}\/\d{1,2})/.exec(matnRay) || /تاریخ دادنامه قطعی\s*:\s*(1[34]\d\d\/\d{1,2}\/\d{1,2})/.exec(kol) || [])[1] || '').replace(/\/(\d)(?=\/|$)/g, '/0$1');
  const shomareRay = ((/شماره دادنامه قطعی\s*:\s*(\d{6,})/.exec(kol) || [])[1] || '');
  const shobeHa = [...matnRay.matchAll(/شعبه\s+[\d۰-۹]+\s+دادگاه[^\n\-–<]{2,50}/g)].map(x => x[0].trim());
  const shobe = ((/شعبه:\s*([^\n]+)/.exec(matnRay) || [])[1] || shobeHa[shobeHa.length - 1] || '').trim();
  const mowzoo = ((/موضوع:\s*([^\n]+)/.exec(matnRay) || [])[1] || '').trim();
  const goroh = ((/گروه رأی\s*:\s*\n?\s*([^\n]+)/.exec(kol) || [])[1] || '').trim();
  if (matnRay.length < 40){ d.prepare("UPDATE saf SET talash=talash+1, khata=?, ts=? WHERE url=?").run('متن رأی خالی', ts(), row.url); if (row.talash + 1 >= 4) d.prepare("UPDATE saf SET vaziat='khata' WHERE url=?").run(row.url); return true; }
  const matn = 'عنوان: ' + onvan + (tarikh ? '\nتاریخ دادنامه: ' + tarikh : '') + (shomareRay ? '\nشماره دادنامه: ' + shomareRay : '') + (shobe ? '\nصادرکننده: ' + shobe : '') + (payam ? '\nپیام: ' + payam : '') + (goroh ? '\nگروه رأی: ' + goroh : '') + '\n\n' + matnRay;
  const meta = { shobe, mowzoo, payam, goroh, shomare: shomareRay }; const h = sha(matn); const tk = tekkehaRay(matn);
  d.exec('BEGIN');
  try {
    const old = d.prepare('SELECT id, sha256 FROM qanun WHERE url=?').get(row.url);
    if (old && old.sha256 === h){ d.prepare('UPDATE qanun SET ts=? WHERE id=?').run(ts(), old.id); }
    else {
      if (old){ d.prepare('DELETE FROM tekke_fts WHERE rowid IN (SELECT id FROM tekke WHERE qid=?)').run(old.id); d.prepare('DELETE FROM tekke WHERE qid=?').run(old.id); noskheKohne(d, old.id, h); d.prepare('DELETE FROM qanun WHERE id=?').run(old.id); }
      const qid = d.prepare('INSERT INTO qanun(manba, shenase, url, onvan, marja, lar, tarikh, ablagh, shomare, meta, matn, sha256, hajm, mavad, ts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run('ara', id, row.url, onvan, shobe || 'سامانهٔ ملی آرای قضایی', 'ara_ray', tarikh, '', shomareRay, JSON.stringify(meta), matn, h, matn.length, tk.length, ts()).lastInsertRowid;
      const it = d.prepare('INSERT INTO tekke(qid, shomare, madde, matn) VALUES(?,?,?,?)'); const ft = d.prepare('INSERT INTO tekke_fts(rowid, matn, onvan) VALUES(?,?,?)');
      tk.forEach((x, k) => { const tid = it.run(qid, k + 1, x.madde, x.matn).lastInsertRowid; ft.run(tid, x.matn, onvan + ' ' + (mowzoo || '')); });
    }
    d.prepare("UPDATE saf SET vaziat='gerefte', khata=NULL, ts=? WHERE url=?").run(ts(), row.url);
    d.exec('COMMIT');
  } catch(e){ d.exec('ROLLBACK'); throw e; }
  R.shomar.gerefte++; R.akharin = 'رأی: ' + onvan; R.khata = '';
  return true;
}
/* ---------------------- پایگاه ملی اطلاع‌رسانی قوانین و مقررات کشور (dotic.ir) — ۱۴۰۵/۰۷/۰۲ ----------------------
   فقط مطالب حقوقی (قانون، مقرره، رأی، نظر حقوقی، طرح و لایحه، پیش‌نویس مقرره) گرفته می‌شود؛ خبرهای عمومی کنار می‌روند. متن از بخش «matn» و پیوست‌ها با نشانی. */
const MAH_FA = { 'فروردین': 1, 'اردیبهشت': 2, 'خرداد': 3, 'تیر': 4, 'مرداد': 5, 'شهریور': 6, 'مهر': 7, 'آبان': 8, 'آذر': 9, 'دی': 10, 'بهمن': 11, 'اسفند': 12 };
const DOTIC_DASTE = [[/اخبار قوانین/, 'dotic_ghanoon'], [/اخبار مقررات/, 'dotic_moghararat'], [/اخبار آرا[ءی]? حقوقی|اخبار آراء حقوقی/, 'dotic_ara'], [/اخبار نظرات حقوقی/, 'dotic_nazar'], [/اخبار طرحها|اخبار لوایح/, 'dotic_tarh'], [/پیش[‌ ]?نویس مقررات/, 'dotic_pishnevis']];
/* ۱۴۰۵/۰۷/۰۳ کارفرما: «قوانین و مقررات اداره ثبت اسناد و اجرا … هیچی نیومده ازش» — منبع رسمی سازمان ثبت اسناد و املاک کشور (ssaa.ir): قوانین (۲۸۷۰۹۸)، آیین‌نامه‌ها (۲۸۷۱۱۱)، بخشنامه‌ها و مجموعه بخشنامه‌های ثبتی (۲۸۷۰۸۵)، مصوبات ماده ۹ (۲۹۰۵۱۶). پیمایش درختی از صفحه‌های ریشه؛ هر صفحهٔ دارای متن یک سند است و عنوانش با عنوان پدر (مثلاً «قانون ثبت اسناد و املاک — باب پنجم») ساخته می‌شود؛ صفحه‌های فهرست فقط فرزندانشان را به صف می‌دهند */
const SSAA_DASTE = new Set(['287098', '287111', '287085', '290516']);
const SSAA_RISHE = [...SSAA_DASTE].map(x => 'https://ssaa.ir/portal/home/?' + x + '/');
function ssaaKelid(href){ try { const u = new URL(String(href).replace(/&amp;/g, '&'), 'https://ssaa.ir/'); if (!/(^|\.)ssaa\.ir$/.test(u.hostname) || u.hostname !== 'ssaa.ir' && u.hostname !== 'www.ssaa.ir' || u.pathname !== '/portal/home/') return null; let q = u.search.slice(1); try { q = decodeURIComponent(q); } catch(e){} let m = /^INSTRUCTION\/(\d+)((?:\/\d+)*)/.exec(q); if (m) return SSAA_DASTE.has(m[1]) ? 'https://ssaa.ir/portal/home/?INSTRUCTION/' + m[1] + m[2] + '/' : null; m = /^(\d+)(\/|$)/.exec(q); return m && SSAA_DASTE.has(m[1]) ? 'https://ssaa.ir/portal/home/?' + m[1] + '/' : null; } catch(e){ return null; } }
async function gamDaryaftSsaa(row){
  const d = db(); d.exec('CREATE TABLE IF NOT EXISTS ssaa_pedar(url TEXT PRIMARY KEY, onvan TEXT)');
  const id = row.url.replace(/^.*\?/, '').replace(/\/$/, ''); R.gam = 'دریافت سازمان ثبت ' + id;
  const a = await get(row.url, 60000); R.akharinAt = Date.now();
  if (a.code === 404){ d.prepare("UPDATE saf SET vaziat='khali', ts=? WHERE url=?").run(ts(), row.url); return true; }
  if (a.code !== 200){ d.prepare('UPDATE saf SET talash=talash+1, khata=?, ts=? WHERE url=?').run('صفحه: ' + a.code, ts(), row.url); if (row.talash + 1 >= 4) d.prepare("UPDATE saf SET vaziat='khata' WHERE url=?").run(row.url); return true; }
  const html = a.body;
  const titr = strip(rrkUnesc((/<h1 class="title">([\s\S]*?)<\/h1>/.exec(html) || [])[1] || (/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '')).replace(/\s*\|\s*سازمان ثبت[\s\S]*$/, '').replace(/\s+/g, ' ').trim().normalize('NFKC');
  const pedar = (d.prepare('SELECT onvan FROM ssaa_pedar WHERE url=?').get(row.url) || {}).onvan || '';
  const onvan = (pedar && !titr.startsWith(pedar) ? pedar + ' — ' : '') + titr;
  const rishe = /\?\d+\/$/.test(row.url); const cat = rishe ? id.replace(/\D/g, '') : ''; let n = 0;
  const ins = d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)'); const insP = d.prepare('INSERT OR IGNORE INTO ssaa_pedar(url, onvan) VALUES(?,?)');
  for (const m of html.matchAll(/href="([^"]+)"/g)){ const k = ssaaKelid(rrkUnesc(m[1])); if (!k || k === row.url) continue;
    if (rishe ? !k.startsWith('https://ssaa.ir/portal/home/?INSTRUCTION/' + cat + '/') : !k.startsWith(row.url)) continue;
    if (ins.run(k, 'ssaa', 'ssaa', olaviatLar('ssaa'), 'dar_saf', ts()).changes) n++; if (!rishe) insP.run(k, onvan); }
  const i = html.indexOf('<div class="content-text'); let tan = i >= 0 ? html.slice(html.indexOf('>', i) + 1) : '';
  const j = tan.search(/<div class="print-share|<div class="MainCommentWrapper|class="hitcount/); if (j > 0) tan = tan.slice(0, j);
  const peyvast = [...tan.matchAll(/href="([^"]+\.(?:pdf|docx?|zip|rar))"/gi)].map(x => { try { return new URL(rrkUnesc(x[1]), 'https://ssaa.ir/').toString(); } catch(e){ return x[1]; } });
  const badane = matnAzHtml(tan).normalize('NFKC');
  if (badane.length < 150 && !peyvast.length){ d.prepare("UPDATE saf SET vaziat='kenar', khata=?, ts=? WHERE url=?").run('فهرست (' + n + ' پیوند تازه)', ts(), row.url); return true; }
  const tarikhE = (/<div class="date date-box[^>]*><span>([\d\/]+)<\/span>/.exec(html) || [])[1] || '';
  const tm = /مصوب\s*(?:مورخ\s*)?(\d{1,2})[\/\.](\d{1,2})[\/\.](1[34]\d\d)|(1[34]\d\d)[\/\.](\d{1,2})[\/\.](\d{1,2})/.exec(onvan + ' ' + badane.slice(0, 400));
  const tarikh = tm ? (tm[3] ? tm[3] + '/' + tm[2].padStart(2, '0') + '/' + tm[1].padStart(2, '0') : tm[4] + '/' + tm[5].padStart(2, '0') + '/' + tm[6].padStart(2, '0')) : '';
  const matn = onvan + '\nمرجع: سازمان ثبت اسناد و املاک کشور' + (tarikh ? '\nتاریخ: ' + tarikh : '') + (tarikhE ? '\nتاریخ درج در پایگاه سازمان ثبت: ' + tarikhE : '') + '\n\n' + badane + (peyvast.length ? '\n\nپیوست: ' + peyvast.join(' · ') : '');
  const h = sha(matn); const tk = tekkeha(matn);
  d.exec('BEGIN');
  try {
    const old = d.prepare('SELECT id, sha256 FROM qanun WHERE url=?').get(row.url);
    if (old && old.sha256 === h){ d.prepare('UPDATE qanun SET ts=? WHERE id=?').run(ts(), old.id); }
    else {
      if (old){ d.prepare('DELETE FROM tekke_fts WHERE rowid IN (SELECT id FROM tekke WHERE qid=?)').run(old.id); d.prepare('DELETE FROM tekke WHERE qid=?').run(old.id); noskheKohne(d, old.id, h); d.prepare('DELETE FROM qanun WHERE id=?').run(old.id); }
      const qid = d.prepare('INSERT INTO qanun(manba, shenase, url, onvan, marja, lar, tarikh, ablagh, shomare, meta, matn, sha256, hajm, mavad, ts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run('ssaa', id, row.url, onvan, 'سازمان ثبت اسناد و املاک کشور', 'ssaa', tarikh, tarikhE, '', JSON.stringify({ peyvast, pedar }), matn, h, matn.length, tk.filter(x => x.madde).length, ts()).lastInsertRowid;
      const it = d.prepare('INSERT INTO tekke(qid, shomare, madde, matn) VALUES(?,?,?,?)'); const ft = d.prepare('INSERT INTO tekke_fts(rowid, matn, onvan) VALUES(?,?,?)');
      tk.forEach((x, k) => { const tid = it.run(qid, k + 1, x.madde, x.matn).lastInsertRowid; ft.run(tid, x.matn, onvan + (x.madde ? ' ' + x.madde : '')); });
    }
    d.prepare("UPDATE saf SET vaziat='gerefte', khata=NULL, ts=? WHERE url=?").run(ts(), row.url);
    d.exec('COMMIT');
  } catch(e){ d.exec('ROLLBACK'); throw e; }
  R.shomar.gerefte++; R.akharin = 'سازمان ثبت: ' + onvan; log('گرفته شد: ' + onvan.slice(0, 90) + ' (' + fa(matn.length) + ' نویسه، ' + fa(tk.length) + ' تکه)');
  return true;
}
/* ۱۴۰۵/۰۷/۰۳ کارفرما: «چک کن هیچ قانونی یا مصوبه یا آیین‌نامه یا بخشنامه یا شیوه‌نامه … جا نمونه» — سامانهٔ ملی قوانین و مقررات (qavanin.ir، ۱۶۷٬۷۵۸ سند: قانون، مقرره، رأی، نظر مشورتی ادارهٔ کل حقوقی قوه قضاییه …). پشت محافظ جاوااسکریپتی است و فقط در Chrome کارفرما باز می‌شود؛ زبانهٔ همان سایت فهرست و متن‌ها را به این سرور می‌فرستد (/rabet/qavanin/kar، fehrest، matn). عنوانی که با نوشتار یکسان‌شده در کتابخانه هست گرفته نمی‌شود (بی تکرار) */
const QV = { onvanha: null, t: 0, dar: new Map(), n: 0 };
function qvOnvanha(){ if (QV.onvanha && Date.now() - QV.t < 3600000) return QV.onvanha; const s = new Set(); for (const r of db().prepare("SELECT onvan FROM qanun WHERE manba != 'qavanin' AND (mavad > 0 OR hajm >= 1500)").all()) s.add(nrmMatn(String(r.onvan).replace(/\s*با اصلاحات و الحاقات بعدی\s*$/, ''))); QV.onvanha = s; QV.t = Date.now(); return s; }
function qvKelid(h){ try { const u = new URL(String(h), 'https://qavanin.ir/'); if (!/(^|\.)qavanin\.ir$/.test(u.hostname)) return null; const ids = u.searchParams.get('IDS'); return ids && /^\d+$/.test(ids) ? 'https://qavanin.ir/Law/TreeText/?IDS=' + ids : null; } catch(e){ return null; } }
const qvNrm = t => nrmMatn(String(t || '').replace(/\s*با اصلاحات و الحاقات بعدی\s*$/, ''));
/* ۱۴۰۵/۰۷/۰۵: فهرست فقط ثبت می‌شود (عنوان، تاریخ تصویب، مرجع تصویب از ستون‌های فهرست سایت)؛ تصمیمِ «گرفتن یا تکراری» پس از کامل شدن فهرست در qavaninNiaz گرفته می‌شود، چون عنوان‌های همسان (مثلاً هزاران «نظر مشورتی … اداره کل حقوقی») را فقط با دیدن کل فهرست می‌شود شناخت. تکراری = عنوانِ یکتا در سامانهٔ ملی که عیناً با متنِ واقعیِ (نه سرصفحه) منبع رسمی دیگری در کتابخانه یکی است */
function qvJadval(d){ if (QV.jadval) return; d.exec('CREATE TABLE IF NOT EXISTS qavanin_onvan(url TEXT PRIMARY KEY, onvan TEXT)'); for (const c of ['tarikh', 'marja', 'nrm']){ try { d.exec('ALTER TABLE qavanin_onvan ADD COLUMN ' + c + ' TEXT'); } catch(e){} } d.exec('CREATE INDEX IF NOT EXISTS qavanin_onvan_nrm ON qavanin_onvan(nrm)'); QV.jadval = true; }
const qvTarikh = s => { const m = /(1[234]\d\d)[\/,](\d{1,2})[\/,](\d{1,2})/.exec(String(s || '')); return m ? m[1] + '/' + m[2].padStart(2, '0') + '/' + m[3].padStart(2, '0') : ''; };
function qavaninFehrest(b){
  const d = db(); if (!d) return { ok: false }; qvJadval(d);
  const ins = d.prepare('INSERT INTO qavanin_onvan(url, onvan, tarikh, marja, nrm) VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET onvan=excluded.onvan, tarikh=excluded.tarikh, marja=excluded.marja, nrm=excluded.nrm');
  let n = 0; d.exec('BEGIN');
  try {
    for (const x of (Array.isArray(b.items) ? b.items : [])){ const k = qvKelid(x.h); if (!k) continue; const t = String(x.t || '').replace(/\s+/g, ' ').trim().normalize('NFKC'); if (!t) continue; ins.run(k, t.slice(0, 1000), qvTarikh(x.d), String(x.m || '').replace(/\s+/g, ' ').trim().normalize('NFKC').slice(0, 200), qvNrm(t)); n++; }
    d.exec('COMMIT');
  } catch(e){ d.exec('ROLLBACK'); throw e; }
  const kel = b.tartib === 'desc' ? 'qavanin:page_desc' : 'qavanin:page';
  if (+b.page) mset(kel, Math.max(+mget(kel) || 0, +b.page));
  if (+b.kol) mset('qavanin:kol', +b.kol);
  QV.khatT = 0; return { ok: true, n };
}
function qavaninNiaz(){
  const d = db(); if (!d) return 'پایگاه باز نشد'; qvJadval(d); QV.onvanha = null; const S0 = qvOnvanha();
  const chand = new Set(d.prepare('SELECT nrm FROM qavanin_onvan GROUP BY nrm HAVING COUNT(*) > 1').all().map(r => r.nrm));
  const dar = new Set(d.prepare("SELECT url FROM qanun WHERE manba='qavanin'").all().map(r => r.url));
  const vaz = new Map(d.prepare("SELECT url, vaziat FROM saf WHERE manba='qavanin'").all().map(r => [r.url, r.vaziat]));
  const up = d.prepare('UPDATE saf SET vaziat=?, ts=? WHERE url=?'); const ins = d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)');
  const niaz = []; let hast = 0, gerefte = 0, kenar = 0, kol = 0; d.exec('BEGIN');
  try {
    for (const r of d.prepare('SELECT url, nrm FROM qavanin_onvan').all()){
      kol++; const v = vaz.get(r.url);
      if (dar.has(r.url) || v === 'gerefte'){ gerefte++; continue; }
      if (v === 'kenar'){ kenar++; continue; }
      const tekrar = S0.has(r.nrm) && !chand.has(r.nrm); const vz = tekrar ? 'hast' : 'niaz_morurgar';
      if (v !== vz && !up.run(vz, ts(), r.url).changes) ins.run(r.url, 'qavanin', 'qavanin', olaviatLar('qavanin'), vz, ts());
      if (tekrar) hast++; else niaz.push(r.url.replace(/^.*IDS=/, '')); // رشته، نه عدد: شناسه‌های بزرگ‌تر از 2^53 با تبدیل به عدد گرد و خراب می‌شدند (پاسخ 500 سایت)
    }
    d.exec('COMMIT');
  } catch(e){ d.exec('ROLLBACK'); throw e; }
  niaz.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)); fs.mkdirSync(qvdPoshe(), { recursive: true });
  const f = path.join(qvdPoshe(), 'mizban-niaz.json'); fs.writeFileSync(f, JSON.stringify({ noe: 'mizban-niaz', t: Date.now(), ids: niaz }));
  QV.khatT = 0; log('سامانهٔ ملی: فهرست نیاز ساخته شد — ' + niaz.length + ' سند برای گرفتن');
  return 'سامانهٔ ملی قوانین: در فهرست ' + fa(kol) + ' سند (از ' + fa(+mget('qavanin:kol') || 0) + ') · گرفته‌شده ' + fa(gerefte) + ' · بی‌متن ' + fa(kenar) + ' · تکراری (متن واقعی همین عنوان از منبع رسمی دیگر در کتابخانه هست) ' + fa(hast) + ' · باید گرفته شود ' + fa(niaz.length) + '\nفهرست نیاز: ' + f;
}
/* پایش پوشهٔ دریافت مرورگر: زبانهٔ سامانهٔ ملی در Chrome کارفرما بسته‌های JSON (فشرده) را در «خانه کلود\\دریافت مرورگر» دانلود می‌کند؛ این‌جا خوانده و وارد کتابخانه می‌شوند و بستهٔ پردازش‌شده به سطل زباله می‌رود (هرگز پاک نمی‌شود) */
const QVD = { n: 0, doc: 0, khata: 0, akharin: '', dar: false, timer: null };
function qvdPoshe(){ return path.join(S.ROOT, 'خانه کلود', 'دریافت مرورگر'); }
function qvdBebar(p, f){ const satl = path.join(S.ROOT, 'سطل زباله', 'خانه کلود', 'دریافت مرورگر — بسته‌های پردازش‌شدهٔ سامانهٔ ملی'); fs.mkdirSync(satl, { recursive: true }); let q = path.join(satl, f), k = 1; while (fs.existsSync(q)) q = path.join(satl, f.replace(/(\.json(\.gz)?)$/, ' (' + (k++) + ')$1')); fs.renameSync(p, q); }
function qvdGam(){
  if (QVD.dar) return; try { if (!qoflK()) return; } catch(e){ return; }
  let fa0; try { fa0 = fs.readdirSync(qvdPoshe()).filter(f => /^mizban-qv-.*\.json(\.gz)?$/.test(f)).sort(); } catch(e){ return; }
  if (!fa0.length) return; QVD.dar = true; const zlib = require('zlib');
  try {
    for (const f of fa0.slice(0, 3)){
      const p = path.join(qvdPoshe(), f); let b;
      try { if (Date.now() - fs.statSync(p).mtimeMs < 2000) continue; let buf = fs.readFileSync(p); if (/\.gz$/.test(f)) buf = zlib.gunzipSync(buf); b = JSON.parse(buf.toString('utf8')); }
      catch(e){ QVD.khata++; QVD.akharin = f + ': ' + e.message; try { qvdBebar(p, f.replace(/(\.json(\.gz)?)$/, ' — خراب$1')); } catch(e2){} continue; }
      if (b && b.noe === 'mizban-qavanin'){
        if (b.type === 'fehrest'){ try { qavaninFehrest(b); } catch(e){ QVD.khata++; QVD.akharin = f + ': ' + e.message; } }
        else if (b.type === 'matn'){ for (const x of (Array.isArray(b.docs) ? b.docs : [])){ try { const r = qavaninMatn(x); if (r && r.gerefte) QVD.doc++; } catch(e){ QVD.khata++; QVD.akharin = f + ': ' + e.message; } } }
      }
      try { qvdBebar(p, f); QVD.n++; } catch(e){ QVD.khata++; QVD.akharin = 'انتقال ' + f + ': ' + e.message; }
    }
  } finally { QVD.dar = false; }
}
function qvdKhat(){
  if (QV.khatT && Date.now() - QV.khatT < 15000) return QV.khat; let s = '';
  try { const d = db(); const q = x => (d.prepare(x).get() || {}).c || 0; const f = q('SELECT COUNT(*) c FROM qavanin_onvan'); if (f || QVD.n) s = '\nسامانهٔ ملی قوانین (از راه دریافت‌های Chrome کارفرما): در فهرست ' + fa(f) + ' از ' + fa(+mget('qavanin:kol') || 0) + ' · در کتابخانه ' + fa(q("SELECT COUNT(*) c FROM qanun WHERE manba='qavanin'")) + ' · مانده برای مرورگر ' + fa(q("SELECT COUNT(*) c FROM saf WHERE manba='qavanin' AND vaziat='niaz_morurgar'")) + ' · تکراری ' + fa(q("SELECT COUNT(*) c FROM saf WHERE manba='qavanin' AND vaziat='hast'")) + ' · بستهٔ پردازش‌شده ' + fa(QVD.n) + (QVD.khata ? ' · خطا ' + fa(QVD.khata) + ' (' + QVD.akharin + ')' : ''); } catch(e){}
  QV.khat = s; QV.khatT = Date.now(); return s;
}
/* ۱۴۰۵/۰۷/۰۵ کارفرما: «متن هارو کپی کن بده سرور … خود سرور بزار کپی کنه» — زبانهٔ سامانهٔ ملی هر بسته را با سرخط MIZBAN-QV|نام در کلیپ‌بورد می‌گذارد؛ این پایش (PowerShell پنهان، فقط به دستور، هر ۲۵۰ میلی‌ثانیه) فقط متن‌های دارای همین سرخط را در «خانه کلود\\دریافت مرورگر» می‌نویسد و پایش پوشه آن را وارد کتابخانه می‌کند؛ کلیپ‌بورد را هرگز نمی‌نویسد و ۱۵ دقیقه بی‌داده خودش خاموش می‌شود تا در کار برنامه‌های دیگر اختلالی نباشد */
const KLP = { p: null, t: 0 };
function qvKlip(khamush){
  if (khamush){ if (KLP.p){ try { KLP.p.kill(); } catch(e){} KLP.p = null; } return 'پایش کلیپ‌بورد خاموش شد'; }
  if (KLP.p) return 'پایش کلیپ‌بورد روشن است (از ' + new Date(KLP.t).toLocaleTimeString('fa-IR') + ')';
  fs.mkdirSync(qvdPoshe(), { recursive: true }); const dir = qvdPoshe().replace(/'/g, "''");
  const ps = "Add-Type -AssemblyName System.Windows.Forms\n$dir = '" + dir + "'; $akhar = ''; $t0 = Get-Date\nwhile (((Get-Date) - $t0).TotalMinutes -lt 15) {\n  $t = $null; try { if ([System.Windows.Forms.Clipboard]::ContainsText()) { $t = [System.Windows.Forms.Clipboard]::GetText() } } catch {}\n  if ($t -and $t.StartsWith('MIZBAN-QV|')) { $i = $t.IndexOf([char]10); if ($i -gt 10) { $nam = $t.Substring(10, $i - 10); if ($nam -ne $akhar -and $nam -match '^mizban-qv-[a-z0-9-]+$') { $akhar = $nam; $f = Join-Path $dir ($nam + '.json'); if (Test-Path $f) { $f = Join-Path $dir ($nam + '-' + [DateTime]::Now.Ticks + '.json') }; [IO.File]::WriteAllText($f + '.tmp', $t.Substring($i + 1), (New-Object Text.UTF8Encoding $false)); Move-Item ($f + '.tmp') $f; $t0 = Get-Date } } }\n  Start-Sleep -Milliseconds 250\n}";
  const { spawn } = require('child_process');
  KLP.p = spawn('powershell.exe', ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true, stdio: 'ignore' });
  KLP.p.on('exit', () => { KLP.p = null; log('پایش کلیپ‌بورد سامانهٔ ملی پایان یافت'); }); KLP.t = Date.now(); log('پایش کلیپ‌بورد سامانهٔ ملی روشن شد');
  return 'پایش کلیپ‌بورد روشن شد (فرایند ' + KLP.p.pid + ')';
}
function qavaninKar(n, lp){
  const d = db(); if (!d) return { ok: false }; const now = Date.now(); n = Math.max(1, Math.min(20, +n || 4));
  for (const [u, t] of QV.dar) if (now - t > 300000) QV.dar.delete(u);
  const urls = d.prepare("SELECT url FROM saf WHERE manba='qavanin' AND vaziat='dar_saf' AND talash < 4 ORDER BY ts LIMIT ?").all(n + QV.dar.size).map(r => r.url).filter(u => !QV.dar.has(u)).slice(0, n);
  urls.forEach(u => QV.dar.set(u, now));
  const kol = +mget('qavanin:kol') || 0, p = (+mget('qavanin:page') || 0) + 1;
  const saf = (d.prepare("SELECT COUNT(*) c FROM saf WHERE manba='qavanin' AND vaziat='dar_saf'").get() || {}).c || 0;
  const page = lp && saf < 300 && (!kol || (p - 1) * 25 < kol) && mget('auto') === '1' ? p : null;
  return { ok: true, page, urls, saf, kol, auto: mget('auto') === '1' };
}
function qavaninMatn(b){
  const d = db(); if (!d) return { ok: false }; const url = qvKelid(b.url); if (!url) return { ok: false, text: 'نشانی نادرست' };
  QV.dar.delete(url); const html = String(b.html || '');
  if (html.length < 12000 && /Transferring|ﺍﻧﺘﻘﺎﻝ|انتقال به سایت/.test(html)){ d.prepare('UPDATE saf SET talash=talash+1, ts=? WHERE url=?').run(ts(), url); return { ok: false, text: 'صفحهٔ محافظ' }; }
  const onvan = strip(rrkUnesc((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '')).replace(/\s*با اصلاحات و الحاقات بعدی\s*$/, '').replace(/\s+/g, ' ').trim().normalize('NFKC');
  const i = html.indexOf('id="treeText"'); let tan = i >= 0 ? html.slice(html.indexOf('>', i) + 1) : '';
  const j = tan.search(/id="Links"|<div class="modal|<footer/); if (j > 0) tan = tan.slice(0, j);
  const badane = matnAzHtml(tan).normalize('NFKC');
  if (!onvan || badane.length < 40){ d.prepare("UPDATE saf SET vaziat='kenar', khata=?, ts=? WHERE url=?").run('بی‌متن', ts(), url); return { ok: true, kenar: true }; }
  qvJadval(d); const qo = d.prepare('SELECT tarikh, marja FROM qavanin_onvan WHERE url=?').get(url) || {}; const sv = (d.prepare('SELECT vaziat FROM saf WHERE url=?').get(url) || {}).vaziat;
  if (sv !== 'niaz_morurgar' && qvOnvanha().has(qvNrm(onvan)) && ((d.prepare('SELECT COUNT(*) c FROM qavanin_onvan WHERE nrm=?').get(qvNrm(onvan)) || {}).c || 0) <= 1){ d.prepare("UPDATE saf SET vaziat='hast', ts=? WHERE url=?").run(ts(), url); return { ok: true, hast: true }; }
  const tarikh = qvTarikh(qo.tarikh) || qvTarikh((/مصوب\s*(1[234]\d\d[\/,]\d{1,2}[\/,]\d{1,2})/.exec(badane) || [])[1]) || qvTarikh(onvan);
  const on2 = onvan.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const marja = qo.marja ? qo.marja.replace(/ي/g, 'ی').replace(/ك/g, 'ک') : /اداره کل حقوقی/.test(on2) ? 'اداره کل حقوقی قوه قضاییه' : /دیوان عالی/.test(on2) ? 'دیوان عالی کشور' : /دیوان عدالت/.test(on2) ? 'دیوان عدالت اداری' : 'سامانهٔ ملی قوانین و مقررات';
  const matn = onvan + '\nمرجع: ' + marja + (tarikh ? '\nتاریخ: ' + tarikh : '') + '\nمنبع: سامانهٔ ملی قوانین و مقررات (qavanin.ir)\n\n' + badane;
  const h = sha(matn); const tk = tekkeha(matn); const id = url.replace(/^.*IDS=/, '');
  d.exec('BEGIN');
  try {
    const old = d.prepare('SELECT id, sha256 FROM qanun WHERE url=?').get(url);
    if (old && old.sha256 === h){ d.prepare('UPDATE qanun SET ts=? WHERE id=?').run(ts(), old.id); }
    else {
      if (old){ d.prepare('DELETE FROM tekke_fts WHERE rowid IN (SELECT id FROM tekke WHERE qid=?)').run(old.id); d.prepare('DELETE FROM tekke WHERE qid=?').run(old.id); noskheKohne(d, old.id, h); d.prepare('DELETE FROM qanun WHERE id=?').run(old.id); }
      const qid = d.prepare('INSERT INTO qanun(manba, shenase, url, onvan, marja, lar, tarikh, ablagh, shomare, meta, matn, sha256, hajm, mavad, ts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run('qavanin', id, url, onvan, marja, 'qavanin', tarikh, '', '', JSON.stringify({}), matn, h, matn.length, tk.filter(x => x.madde).length, ts()).lastInsertRowid;
      const it = d.prepare('INSERT INTO tekke(qid, shomare, madde, matn) VALUES(?,?,?,?)'); const ft = d.prepare('INSERT INTO tekke_fts(rowid, matn, onvan) VALUES(?,?,?)');
      tk.forEach((x, k) => { const tid = it.run(qid, k + 1, x.madde, x.matn).lastInsertRowid; ft.run(tid, x.matn, onvan + (x.madde ? ' ' + x.madde : '')); });
    }
    d.prepare("UPDATE saf SET vaziat='gerefte', khata=NULL, ts=? WHERE url=?").run(ts(), url);
    d.exec('COMMIT');
  } catch(e){ d.exec('ROLLBACK'); throw e; }
  QV.n++; QV.khatT = 0; R.shomar.gerefte++; R.akharin = 'سامانهٔ ملی: ' + onvan;
  return { ok: true, gerefte: true, onvan: onvan.slice(0, 80) };
}
async function gamDaryaftDotic(row){
  const d = db(); const id = (/\/news\/(\d+)/.exec(row.url) || [])[1];
  if (!id){ d.prepare("UPDATE saf SET vaziat='khata', khata=? WHERE url=?").run('نشانی ناشناخته', row.url); return true; }
  R.gam = 'دریافت پایگاه ملی ' + id;
  const a = await get(row.url, 60000); R.akharinAt = Date.now();
  if (a.code === 404){ d.prepare("UPDATE saf SET vaziat='khali', ts=? WHERE url=?").run(ts(), row.url); return true; }
  if (a.code !== 200){ d.prepare("UPDATE saf SET talash=talash+1, khata=?, ts=? WHERE url=?").run('صفحه: ' + a.code, ts(), row.url); if (row.talash + 1 >= 4) d.prepare("UPDATE saf SET vaziat='khata' WHERE url=?").run(row.url); return true; }
  const html = a.body;
  const cats = []; const reT = /<div class="tags">\s*<h4[^>]*>\s*<span>([^<]+)<\/span>[\s\S]*?<ul>([\s\S]*?)<\/ul>/g; let m; const bakhsh = {};
  while ((m = reT.exec(html))){ const names = [...m[2].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map(x => strip(x[1])).filter(Boolean); bakhsh[strip(m[1])] = names; }
  (bakhsh['دسته بندی ها'] || []).forEach(c => cats.push(c));
  let lar = ''; for (const [re, l] of DOTIC_DASTE) if (cats.some(c => re.test(c))){ lar = l; break; }
  const onvan = strip((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '').replace(/\s*[-|]\s*پایگاه ملی[\s\S]*$/, '').trim();
  if (!onvan || !lar){ d.prepare("UPDATE saf SET vaziat='kenar', khata=?, ts=? WHERE url=?").run(onvan ? 'خبر غیرحقوقی: ' + cats.join('، ').slice(0, 200) : 'بی‌عنوان', ts(), row.url); return true; }
  const i = html.indexOf('<div class="matn">'); let tan = i >= 0 ? html.slice(i + 18) : '';
  const j = tan.search(/<div class="(?:tags|social|comment)|<h4 class="header_box">/); if (j > 0) tan = tan.slice(0, j);
  const peyvast = [...tan.matchAll(/href="([^"]+\.(?:pdf|docx?|zip|rar))"/gi)].map(x => x[1]);
  const badane = matnAzHtml(tan);
  const tm = /تاریخ خبر:\s*[^\d<]*?(\d{1,2})\s+([آ-ی]+)\s+(1[34]\d\d)/.exec(html);
  const mahN = tm ? MAH_FA[tm[2].replace(/ي/g, 'ی').replace(/ك/g, 'ک')] : 0;   /* صفحه‌ها «تير» را با ی عربی می‌نویسند */
  const tarikh = mahN ? tm[3] + '/' + String(mahN).padStart(2, '0') + '/' + tm[1].padStart(2, '0') : '';
  const marja = (bakhsh['مرجع وضع'] || []).join('، ');
  const matn = onvan + (tarikh ? '\nتاریخ درج در پایگاه ملی: ' + tarikh : '') + (marja ? '\nمرجع وضع: ' + marja : '') + ((bakhsh['دستگاه مجری'] || []).length ? '\nدستگاه مجری: ' + bakhsh['دستگاه مجری'].join('، ') : '') + '\n\n' + badane + (peyvast.length ? '\n\nپیوست (متن کامل): ' + peyvast.join(' · ') : '');
  if (badane.length < 20 && !peyvast.length){ d.prepare("UPDATE saf SET vaziat='kenar', khata=?, ts=? WHERE url=?").run('بی‌متن', ts(), row.url); return true; }
  const h = sha(matn); const tk = tekkeha(matn);
  d.exec('BEGIN');
  try {
    const old = d.prepare('SELECT id, sha256 FROM qanun WHERE url=?').get(row.url);
    if (old && old.sha256 === h){ d.prepare('UPDATE qanun SET ts=? WHERE id=?').run(ts(), old.id); }
    else {
      if (old){ d.prepare('DELETE FROM tekke_fts WHERE rowid IN (SELECT id FROM tekke WHERE qid=?)').run(old.id); d.prepare('DELETE FROM tekke WHERE qid=?').run(old.id); noskheKohne(d, old.id, h); d.prepare('DELETE FROM qanun WHERE id=?').run(old.id); }
      const qid = d.prepare('INSERT INTO qanun(manba, shenase, url, onvan, marja, lar, tarikh, ablagh, shomare, meta, matn, sha256, hajm, mavad, ts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run('dotic', id, row.url, onvan, marja || 'پایگاه ملی اطلاع‌رسانی قوانین و مقررات', lar, tarikh, '', '', JSON.stringify({ cats, peyvast, bakhsh }), matn, h, matn.length, tk.filter(x => x.madde).length, ts()).lastInsertRowid;
      const it = d.prepare('INSERT INTO tekke(qid, shomare, madde, matn) VALUES(?,?,?,?)'); const ft = d.prepare('INSERT INTO tekke_fts(rowid, matn, onvan) VALUES(?,?,?)');
      tk.forEach((x, k) => { const tid = it.run(qid, k + 1, x.madde, x.matn).lastInsertRowid; ft.run(tid, x.matn, onvan + (x.madde ? ' ' + x.madde : '')); });
    }
    d.prepare("UPDATE saf SET vaziat='gerefte', khata=NULL, ts=? WHERE url=?").run(ts(), row.url);
    d.exec('COMMIT');
  } catch(e){ d.exec('ROLLBACK'); throw e; }
  R.shomar.gerefte++; R.akharin = 'پایگاه ملی: ' + onvan; R.khata = '';
  return true;
}
/* ۱۴۰۵/۰۷/۰۲: انتخاب ردیف بعدی — اول قوانین هدف (اولویت ۹۷ به بالا)، سپس دسته‌ها به نوبت تا همهٔ دسته‌ها هم‌زمان پیش بروند؛
   ردیفی که همین حالا در دست دریافت هم‌زمان دیگری است برداشته نمی‌شود */
const DAR_KAR = new Map();
function radifNobati(d, manba){
  const now = Date.now(); for (const [u, t] of DAR_KAR) if (now - t > 90000) DAR_KAR.delete(u);
  const azad = rows => rows.find(r => !DAR_KAR.has(r.url));
  let row = azad(d.prepare("SELECT url, manba, lar, talash FROM saf WHERE vaziat='dar_saf' AND talash < 4 AND manba=? AND olaviat >= 97 ORDER BY olaviat DESC, ts LIMIT 6").all(manba));
  if (!row){
    if (!R.larSaf || now - R.larSaf.t > 60000) R.larSaf = { t: now, l: d.prepare("SELECT lar FROM saf WHERE vaziat='dar_saf' AND talash < 4 AND manba=? GROUP BY lar ORDER BY MAX(olaviat) DESC").all(manba).map(x => x.lar) };
    const L = R.larSaf.l;
    for (let i = 0; i < L.length && !row; i++){ R.dk = (R.dk || 0) + 1; const lar = L[R.dk % L.length]; row = azad(d.prepare("SELECT url, manba, lar, talash FROM saf WHERE vaziat='dar_saf' AND talash < 4 AND manba=? AND lar=? ORDER BY olaviat DESC, ts LIMIT 6").all(manba, lar)); }
  }
  if (!row) row = azad(d.prepare("SELECT url, manba, lar, talash FROM saf WHERE vaziat='dar_saf' AND talash < 4 AND manba=? ORDER BY olaviat DESC, ts LIMIT 6").all(manba));
  if (row) DAR_KAR.set(row.url, now);
  return row || null;
}
async function gamDaryaft(manba){
  const d = db();
  const row = manba ? d.prepare("SELECT url, manba, lar, talash FROM saf WHERE vaziat='dar_saf' AND talash < 4 AND manba=? ORDER BY olaviat DESC, ts LIMIT 1").get(manba) ? radifNobati(d, manba) : null
                    : d.prepare("SELECT url, manba, lar, talash FROM saf WHERE vaziat='dar_saf' AND talash < 4 ORDER BY olaviat DESC, ts LIMIT 1").get();
  if (!row) return false;
  if (row.manba === 'ara') return gamDaryaftAra(row);
  if (row.manba === 'dotic') return gamDaryaftDotic(row);
  if (row.manba === 'ssaa') return gamDaryaftSsaa(row);
  const id = /\/show\/(\d+)/.exec(row.url); if (!id){ d.prepare("UPDATE saf SET vaziat='khata', khata=? WHERE url=?").run('نشانی ناشناخته', row.url); return true; }
  R.gam = 'دریافت ' + id[1];
  const a = await get(MJ.showUrl(id[1]), 60000); R.akharinAt = Date.now();
  if (a.code !== 200){ d.prepare("UPDATE saf SET talash=talash+1, khata=?, ts=? WHERE url=?").run('صفحه: ' + a.code, ts(), row.url); R.khata = 'دریافت ' + id[1] + ': ' + a.code; log(R.khata); if (row.talash + 1 >= 4) d.prepare("UPDATE saf SET vaziat='khata' WHERE url=?").run(row.url); return true; }
  const sh = MJ.parseShow(a.body);
  await new Promise(r => setTimeout(r, R.fasele));
  const p = await get(MJ.printUrl(id[1]), 60000); R.akharinAt = Date.now();
  const matn = p.code === 200 ? MJ.parsePrint(p.body) : '';
  if (!matn || matn.length < 40){ d.prepare("UPDATE saf SET talash=talash+1, khata=?, ts=? WHERE url=?").run('متن چاپی ' + (p.code === 200 ? 'خالی' : String(p.code)), ts(), row.url); R.khata = 'متن ' + id[1] + ' نیامد'; log(R.khata); if (row.talash + 1 >= 4) d.prepare("UPDATE saf SET vaziat='khata' WHERE url=?").run(row.url); return true; }
  const meta = sh.meta; const h = sha(matn);
  const tk = tekkeha(matn);
  d.exec('BEGIN');
  try {
    const old = d.prepare('SELECT id, sha256 FROM qanun WHERE url=?').get(row.url);
    if (old && old.sha256 === h){ d.prepare('UPDATE qanun SET ts=? WHERE id=?').run(ts(), old.id); }
    else {
      if (old){ d.prepare('DELETE FROM tekke_fts WHERE rowid IN (SELECT id FROM tekke WHERE qid=?)').run(old.id); d.prepare('DELETE FROM tekke WHERE qid=?').run(old.id); noskheKohne(d, old.id, h); d.prepare('DELETE FROM qanun WHERE id=?').run(old.id); }
      const ins = d.prepare('INSERT INTO qanun(manba, shenase, url, onvan, marja, lar, tarikh, ablagh, shomare, meta, matn, sha256, hajm, mavad, ts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const qid = ins.run('majlis', id[1], row.url, sh.onvan, meta['مرجع تصویب'] || '', row.lar, meta['تاریخ تصویب'] || '', meta['تاریخ ابلاغیه'] || meta['تاریخ ابلاغ'] || '', meta['شماره ابلاغیه'] || meta['شماره'] || '', JSON.stringify(meta), matn, h, matn.length, tk.filter(x => x.madde).length, ts()).lastInsertRowid;
      const it = d.prepare('INSERT INTO tekke(qid, shomare, madde, matn) VALUES(?,?,?,?)'); const ft = d.prepare('INSERT INTO tekke_fts(rowid, matn, onvan) VALUES(?,?,?)');
      tk.forEach((x, i) => { const tid = it.run(qid, i + 1, x.madde, x.matn).lastInsertRowid; ft.run(tid, x.matn, sh.onvan + (x.madde ? ' ' + x.madde : '')); });
    }
    d.prepare("UPDATE saf SET vaziat='gerefte', khata=NULL, ts=? WHERE url=?").run(ts(), row.url);
    d.exec('COMMIT');
  } catch(e){ d.exec('ROLLBACK'); throw e; }
  R.shomar.gerefte++; R.akharin = sh.onvan; R.khata = '';
  log('گرفته شد: ' + sh.onvan.slice(0, 80) + ' (' + fa(matn.length) + ' نویسه، ' + fa(tk.length) + ' تکه)');
  return true;
}
function tekkeDobare(){
  const d = db(); if (!d) return 0;
  const rows = d.prepare('SELECT id, onvan, matn FROM qanun').all(); let n = 0;
  d.exec('BEGIN');
  try {
    d.exec('DELETE FROM tekke_fts'); d.exec('DELETE FROM tekke');
    const it = d.prepare('INSERT INTO tekke(qid, shomare, madde, matn) VALUES(?,?,?,?)'); const ft = d.prepare('INSERT INTO tekke_fts(rowid, matn, onvan) VALUES(?,?,?)'); const up = d.prepare('UPDATE qanun SET mavad=? WHERE id=?');
    for (const r of rows){ const tk = tekkeha(r.matn); tk.forEach((x, i) => { const tid = it.run(r.id, i + 1, x.madde, x.matn).lastInsertRowid; ft.run(tid, x.matn, r.onvan + (x.madde ? ' ' + x.madde : '')); n++; }); up.run(tk.filter(x => x.madde).length, r.id); }
    d.exec('COMMIT');
  } catch(e){ d.exec('ROLLBACK'); throw e; }
  return n;
}
/* ---------------------- گره دوم: نمایهٔ معنایی روی مادربورد دوم (۱۴۰۵/۰۷/۰۱) ----------------------
   اگر گره دوم (نشانی در meta «gere2_ip»، یافته در بخش «شبکه») زنده باشد، بردار تکه‌ها و بردار پرسش‌ها آن‌جا ساخته می‌شود
   (همان مدل bge-m3 Q8_0 با pooling cls؛ بردارها همسان‌اند) و پردازندهٔ رایانهٔ اصلی برای میزبان آزاد می‌ماند. */
const G2 = { ip: '', ok: false, at: 0, timers: [], n: 0, khata: '', dar: false };
function g2Req(ip, p, body, ms){
  return new Promise(res => {
    const d = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({ host: ip, port: 8800, path: p, method: d ? 'POST' : 'GET', timeout: ms || 5000, headers: d ? { 'content-type': 'application/json', 'content-length': d.length } : {} }, s => {
      const ch = []; s.on('data', c => ch.push(c)); s.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(ch).toString('utf8')); } catch(e){} res({ status: s.statusCode, json: j }); });
    });
    r.on('timeout', () => { r.destroy(); res(null); }); r.on('error', () => res(null)); if (d) r.write(d); r.end();
  });
}
async function g2Amade(){
  const ip = (S && S.metaGet && S.metaGet('gere2_ip')) || ''; if (!ip){ G2.ok = false; return false; }
  if (ip === G2.ip && Date.now() - G2.at < 60000) return G2.ok;
  G2.ip = ip; G2.at = Date.now();
  const r = await g2Req(ip, '/salamat', null, 10000);   /* ۱۴۰۵/۰۷/۰۵: گره دوم زیر بار کامل نمایه گاهی دیرتر از ۳ ثانیه پاسخ می‌داد و کار به کیس یک می‌افتاد */
  G2.ok = !!(r && r.json && r.json.gere === 'mizban-gere2' && r.json.emb);
  return G2.ok;
}
async function g2Bordarha(matnha){
  const r = await g2Req(G2.ip, '/bordar', { model: 'danesh', input: matnha }, 900000);
  if (!r || r.status !== 200 || !r.json || !Array.isArray(r.json.data)){ G2.at = 0; G2.ok = false; throw new Error('گره دوم بردار نداد (' + (r ? r.status : 'بی‌پاسخ') + ')'); }
  const arr = r.json.data.sort((a, b) => a.index - b.index).map(x => x.embedding);
  if (arr.length !== matnha.length) throw new Error('شمار بردارهای گره دوم ناهمخوان است');
  return arr.map(v => { const f = Float32Array.from(v); let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i]; s = Math.sqrt(s) || 1; for (let i = 0; i < f.length; i++) f[i] /= s; return f; });
}
/* ۱۴۰۵/۰۷/۰۲: سه رشتهٔ هم‌زمان (هر کدام تکه‌های id % 3 خودش) — llama-server گره دوم چند درخواست را با هم پردازش می‌کند و یک رشتهٔ تنها آن را بیکار می‌گذاشت */
const G2_RESHTE = 3;
async function halgheGere(k){
  k = k || 0;
  if (malekK()){ G2.timers[k] = setTimeout(() => halgheGere(k), 30000); return; }
  let bad = 30000;
  try {
    if (await g2Amade()){
      const d = db();
      const rows = d ? bibordar('(id % ?) = ?', [G2_RESHTE, k], '', 16) : [];
      if (rows.length){
        G2.dar = true;
        const vs = await g2Bordarha(rows.map(r => r.matn.slice(0, 3000)));
        const up = d.prepare('UPDATE tekke SET bordar=? WHERE id=? AND bordar IS NULL');
        d.exec('BEGIN'); try { rows.forEach((r, i) => up.run(Buffer.from(vs[i].buffer, vs[i].byteOffset, vs[i].byteLength), r.id)); d.exec('COMMIT'); } catch(e){ d.exec('ROLLBACK'); throw e; }
        G2.n += rows.length; R.shomar.namaye += rows.length; G2.khata = ''; bad = 50;
      } else G2.dar = false;
    } else G2.dar = false;
  } catch(e){ G2.khata = e.message || String(e); G2.dar = false; bad = 60000; }
  G2.timers[k] = setTimeout(() => halgheGere(k), bad);
}
/* ۱۴۰۵/۰۷/۰۲ — در «حالت تمام‌قدرت آموزش» این رایانه هم هم‌زمان با گره دوم نمایه می‌سازد: از انتهای جدول (id نزولی) با مدل معنایی
   پایگاه دانش روی کارت گرافیک؛ گره دوم از ابتدا. نوشتن فقط روی تکه‌های بی‌بردار (بی دوباره‌نویسی). */
const ML = { timer: null, n: 0, khata: '', dar: false };
async function halgheMahalli(){
  let bad = 60000;
  if (malekK()){ ML.timer = setTimeout(halgheMahalli, bad); return; }
  try {
    if (tgk()){
      const DN = require('./danesh.js'); const d = db();
      if (d && DN.startEmb && DN.bordarha && await DN.startEmb()){
        const rows = bibordar('(id % 2) = 0', [], 'DESC', 16);
        if (rows.length){
          ML.dar = true;
          const vs = await DN.bordarha(rows.map(r => r.matn.slice(0, 3000)));
          const up = d.prepare('UPDATE tekke SET bordar=? WHERE id=? AND bordar IS NULL');
          d.exec('BEGIN'); try { rows.forEach((r, i) => up.run(Buffer.from(vs[i].buffer, vs[i].byteOffset, vs[i].byteLength), r.id)); d.exec('COMMIT'); } catch(e){ d.exec('ROLLBACK'); throw e; }
          ML.n += rows.length; R.shomar.namaye += rows.length; ML.khata = ''; bad = 100;
        } else ML.dar = false;
      } else { ML.dar = false; bad = 15000; }
    } else ML.dar = false;
  } catch(e){ ML.khata = e.message || String(e); ML.dar = false; bad = 20000; }
  ML.timer = setTimeout(halgheMahalli, bad);
}
/* ۱۴۰۵/۰۷/۰۲ — رشتهٔ پردازندهٔ این رایانه در «حالت تمام‌قدرت»: یک مدل معنایی جدا روی پردازنده (درگاه 8794، ۱۰ رشته) تا پردازنده هم
   بیکار نماند. تقسیم کار بی‌هم‌پوشانی: کارت گرافیک id زوج از انتها، پردازنده id فرد از انتها، گره دوم از ابتدا. */
const PORT_CPU = 8794;
const MC = { proc: null, ready: false, timer: null, n: 0, khata: '', dar: false, starting: null };
function postLocal(port, p, obj, ms){
  return new Promise(res => {
    const d = Buffer.from(JSON.stringify(obj));
    const r = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', timeout: ms || 600000, headers: { 'content-type': 'application/json', 'content-length': d.length } }, s => { const ch = []; s.on('data', c => ch.push(c)); s.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(ch).toString('utf8')); } catch(e){} res({ status: s.statusCode, json: j }); }); });
    r.on('timeout', () => { r.destroy(); res(null); }); r.on('error', () => res(null)); r.write(d); r.end();
  });
}
async function mcStart(){
  if (MC.ready) return true; if (MC.starting) return MC.starting;
  MC.starting = (async () => {
    try { const h = await H.httpGet(PORT_CPU, '/health'); if (h && h.status === 200){ MC.ready = true; return true; } } catch(e){}
    const p = H && H.pickExe && H.pickExe(); const f = path.join(S.HERE, 'موتور خوانش', 'مدل‌ها', 'دانش', 'bge-m3-Q8_0.gguf');
    if (!p || !fs.existsSync(f)){ MC.khata = 'موتور یا مدل bge-m3 پیدا نشد'; return false; }
    const exe = path.join(path.dirname(path.dirname(p.exe)), 'cpu', path.basename(p.exe)); const bin = fs.existsSync(exe) ? exe : p.exe;
    try { H.ensureRuntimeDlls && H.ensureRuntimeDlls(path.dirname(bin)); } catch(e){}
    const { spawn } = require('child_process');
    MC.proc = spawn(bin, ['-m', f, '--embedding', '--pooling', 'cls', '--host', '127.0.0.1', '--port', String(PORT_CPU), '-c', '4096', '-b', '4096', '-ub', '4096', '--parallel', '1', '-t', '10', '-ngl', '0'], { cwd: path.dirname(bin), windowsHide: true, stdio: 'ignore' });
    const pr = MC.proc; pr.on('exit', () => { if (MC.proc === pr){ MC.proc = null; MC.ready = false; } });
    for (let i = 0; i < 120; i++){ await new Promise(r => setTimeout(r, 1000)); if (!MC.proc) break; try { const h = await H.httpGet(PORT_CPU, '/health'); if (h && h.status === 200){ MC.ready = true; MC.khata = ''; log('مدل معنایی پردازنده (تمام‌قدرت) روشن شد'); return true; } } catch(e){} }
    MC.khata = 'مدل معنایی پردازنده بالا نیامد'; mcStop(); return false;
  })();
  try { return await MC.starting; } finally { MC.starting = null; }
}
function mcStop(){ const p = MC.proc; MC.proc = null; MC.ready = false; if (p){ try { p.kill(); } catch(e){} try { H.killPid && H.killPid(p.pid); } catch(e){} log('مدل معنایی پردازنده (تمام‌قدرت) بسته شد'); } }
async function halghePardazande(){
  let bad = 60000;
  if (malekK()){ MC.timer = setTimeout(halghePardazande, bad); return; }
  try {
    if (tgk()){
      const d = db();
      if (d && await mcStart()){
        const rows = bibordar('(id % 2) = 1', [], 'DESC', 16);
        if (rows.length){
          MC.dar = true;
          const r = await postLocal(PORT_CPU, '/v1/embeddings', { model: 'danesh', input: rows.map(x => x.matn.slice(0, 3000)) }, 900000);
          if (!r || r.status !== 200 || !r.json || !Array.isArray(r.json.data)) throw new Error('مدل پردازنده بردار نداد (' + (r ? r.status : 'بی‌پاسخ') + ')');
          const vs = r.json.data.sort((a, b) => a.index - b.index).map(x => { const f = Float32Array.from(x.embedding); let q = 0; for (let i = 0; i < f.length; i++) q += f[i] * f[i]; q = Math.sqrt(q) || 1; for (let i = 0; i < f.length; i++) f[i] /= q; return f; });
          const up = d.prepare('UPDATE tekke SET bordar=? WHERE id=? AND bordar IS NULL');
          d.exec('BEGIN'); try { rows.forEach((x, i) => up.run(Buffer.from(vs[i].buffer, vs[i].byteOffset, vs[i].byteLength), x.id)); d.exec('COMMIT'); } catch(e){ d.exec('ROLLBACK'); throw e; }
          MC.n += rows.length; R.shomar.namaye += rows.length; MC.khata = ''; bad = 50;
        } else MC.dar = false;
      } else { MC.dar = false; bad = 20000; }
    } else { MC.dar = false; if (MC.proc) mcStop(); }
  } catch(e){ MC.khata = e.message || String(e); MC.dar = false; bad = 20000; }
  MC.timer = setTimeout(halghePardazande, bad);
}
async function gamNamaye(had){
  /* گره دوم در کار است: کار نمایه با اوست؛ این حلقه فقط منتظر می‌ماند */
  /* ۱۴۰۵/۰۷/۰۵ تقسیم کارفرما: کیس اول و کارت فقط برای گفتگو؛ تا گره دوم در دسترس است نمایه فقط با اوست (نه فقط وقتی در کار است) */
  if (G2.ok || (S && S.metaGet && S.metaGet('gere2_ip'))){ await new Promise(r => setTimeout(r, 5000)); const d0 = db(); return d0 && d0.prepare('SELECT 1 FROM tekke WHERE bordar IS NULL LIMIT 1').get() ? 1 : 0; }
  const d = db(); let DN = null; try { DN = require('./danesh.js'); } catch(e){ return 0; }
  if (!DN.startEmb || !DN.bordarha) return 0;
  const rows = bibordar('', [], '', Math.max(1, Math.min(64, +had || 12)));
  if (!rows.length) return 0;
  if (!(await DN.startEmb())) return 0;
  R.gam = 'نمایهٔ معنایی';
  const vs = await DN.bordarha(rows.map(r => r.matn.slice(0, 3000)));
  const up = d.prepare('UPDATE tekke SET bordar=? WHERE id=?');
  d.exec('BEGIN'); try { rows.forEach((r, i) => up.run(Buffer.from(vs[i].buffer, vs[i].byteOffset, vs[i].byteLength), r.id)); d.exec('COMMIT'); } catch(e){ d.exec('ROLLBACK'); throw e; }
  R.shomar.namaye += rows.length; return rows.length;
}
/* ۱۴۰۵/۰۷/۰۲ به دستور کارفرما «سرعت گردآوری زیاد کن»: دریافت هم‌زمان از هر منبع (هر منبع میزبان جدای خودش را دارد؛ DAR_KAR نمی‌گذارد یک نشانی دو بار هم‌زمان گرفته شود) */
/* ۱۴۰۵/۰۷/۰۳ بررسی عمیق: جست‌وجوی معنایی هر بار همهٔ بردارها را از دیسک می‌خواند (صدها مگابایت؛ سرور چند ثانیه قفل می‌شد). اکنون بردارها یک بار، تکه‌تکه و بی قفل کردن سرور، فشرده (int8، هر بردار ۱ کیلوبایت) در حافظه نگه داشته و هر ۲۰ دقیقه تازه می‌شوند؛ ۲۰۰ نامزد برتر با بردار دقیق از پایگاه دوباره سنجیده می‌شوند */
const VK = { n: 0, dim: 0, ids: null, q: null, sc: null, t: 0, dar: false };
async function vkSakht(){
  if (VK.dar) return; VK.dar = true;
  try {
    const d = db(); let last = 0, n = 0, cap = ((d.prepare('SELECT COUNT(*) c FROM tekke').get() || {}).c | 0) + 4096, dim = 0;
    let ids = new Int32Array(cap), sc = new Float32Array(cap), q = null;
    const st = d.prepare('SELECT id, bordar FROM tekke WHERE id > ? AND bordar IS NOT NULL ORDER BY id LIMIT 2000');
    for (;;){
      const rows = st.all(last); if (!rows.length) break;
      for (const r of rows){
        last = r.id; const u = new Uint8Array(r.bordar); if (!dim){ dim = u.length / 4; q = new Int8Array(cap * dim); } if (u.length !== dim * 4) continue;
        if (n >= cap){ const nc = cap * 2; const ni = new Int32Array(nc); ni.set(ids); ids = ni; const ns = new Float32Array(nc); ns.set(sc); sc = ns; const nq = new Int8Array(nc * dim); nq.set(q); q = nq; cap = nc; }
        const v = new Float32Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.length)); let m = 0; for (let i = 0; i < dim; i++){ const a = Math.abs(v[i]); if (a > m) m = a; }
        const k = m ? 127 / m : 0, o = n * dim; for (let i = 0; i < dim; i++) q[o + i] = Math.round(v[i] * k); ids[n] = r.id; sc[n] = m / 127; n++;
      }
      await khab(5);
    }
    Object.assign(VK, { n, dim, ids, q, sc, t: Date.now() }); log('نمایهٔ معنایی در حافظه: ' + n + ' بردار');
  } catch(e){ log('نمایهٔ معنایی در حافظه: ' + e.message); } finally { VK.dar = false; }
}
const HAMZAMAN = { majlis: 10, ara: 12, dotic: 10, ssaa: 3 };
/* ۱۴۰۵/۰۷/۰۲ کارفرما: «نباید مسدود شویم» — اگر سایتی ۵ بار پشت‌سرهم پاسخ نداد، کارگرهای همان منبع ۳ دقیقه دست نگه می‌دارند */
const HOSHDAR = {};
function hoshdarMizban(url, code){ try { const h = new URL(url).hostname.replace(/^www\./, ''); const bad = code === 429 || code === 403 || code === 503 || code === 'timeout' || code === 'net'; const x = HOSHDAR[h] || (HOSHDAR[h] = { n: 0, ta: 0 }); if (!bad){ x.n = 0; return; } x.n++; if (x.n >= 5 && Date.now() > x.ta){ x.ta = Date.now() + 180000; x.n = 0; log('هشدار: ' + h + ' پشت‌سرهم پاسخ نداد (' + code + ')؛ ۳ دقیقه دست نگه داشته می‌شود تا مسدود نشویم'); } } catch(e){} }
function mandeMaks(manba){ const h = String((MANABE[manba] || {}).host || '').replace(/^www\./, ''); const x = HOSHDAR[h]; return x && Date.now() < x.ta ? x.ta - Date.now() : 0; }
const KARGAR = {};
async function kargar(manba){   /* هر کارگر پشت‌سرهم از صف همان منبع می‌گیرد؛ منتظر منبع‌های دیگر نمی‌ماند */
  try {
    while (R.on){
      if (mget('auto') !== '1' || malekK()) break;
      { const mk = mandeMaks(manba); if (mk){ await khab(mk); continue; } }
      try { const t = +((S && S.metaGet && S.metaGet('mizban_dar_kar')) || 0); if (t && Date.now() - t < 300000){ await khab(5000); continue; } } catch(e){}
      let did = false; try { did = await gamDaryaft(manba); } catch(e){ R.khata = e.message || String(e); log('خطا (' + manba + '): ' + R.khata); await khab(5000); }
      await khab(did ? (tgk() ? 300 : R.fasele) : 30000);
    }
  } finally { KARGAR[manba] = Math.max(0, (KARGAR[manba] || 1) - 1); }
}
/* ۱۴۰۵/۰۷/۰۳ کارفرما: «تعداد کارگرهای روزنامهٔ رسمی تا حد امکان بالا ببر» — هر کارگر نشست APEX جدای خودش را دارد (نشست مشترکِ هم‌زمان ممکن بود متن یک کد را زیر کد دیگر بدهد)؛ صفحه‌های فهرست میان کارگرها تقسیم و صفحه‌های نیمه‌کاره در meta.rrk:dar نگه داشته می‌شوند تا پس از بازراه‌اندازی از دست نروند؛ نگهبان مسدود نشدن روی rrk.ir هم هست */
const RRK_KARGAR = 8;
const RP = { bar: false, mande: [], next: 1, dar: new Set(), bad: {} };
function rpBar(){ if (RP.bar) return; RP.bar = true; RP.next = +(mget('rrk:page') || 1); try { RP.mande = JSON.parse(mget('rrk:dar') || '[]').filter(x => x < RP.next); } catch(e){ RP.mande = []; } }
function rpZakhire(){ mset('rrk:page', RP.next); mset('rrk:dar', JSON.stringify([...RP.dar, ...RP.mande])); }
function rpBegir(){ rpBar(); const p = RP.mande.length ? RP.mande.shift() : RP.next++; RP.dar.add(p); rpZakhire(); return p; }
function rpVel(p, tamam){ RP.dar.delete(p); if (!tamam) RP.mande.unshift(p); rpZakhire(); }
async function kargarRrk(k){
  const ns = { jar: {}, s: null, pending: [], page: 0 };
  try {
    while (R.on){
      if (mget('auto') !== '1' || malekK() || mget('rrk:tamam') === '1' || !(MANABE.rrk && MANABE.rrk.amade)) break;
      { const mk = mandeMaks('rrk'); if (mk){ await khab(mk); continue; } }
      try { const t = +((S && S.metaGet && S.metaGet('mizban_dar_kar')) || 0); if (t && Date.now() - t < 300000){ await khab(5000); continue; } } catch(e){}
      let did = false;
      try {
        if (!ns.pending.length){
          if (ns.page){ rpVel(ns.page, true); ns.page = 0; }
          const p = rpBegir(); R.gam = 'فهرست روزنامهٔ رسمی صفحهٔ ' + p;
          const rows = await rrkSafhe(p, '', ns); R.akharinAt = Date.now();
          if (!rows.length){
            if (RRK.kol && (p - 1) * 20 >= RRK.kol){ rpVel(p, true); if (!RP.dar.size && !RP.mande.length){ mset('rrk:tamam', '1'); log('فهرست روزنامهٔ رسمی تمام شد'); } break; }
            rpVel(p, false); ns.s = null; await khab(10000); continue;
          }
          const d = db(); const hast = d.prepare('SELECT vaziat FROM saf WHERE url=?'); const ins = d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)');
          for (const r of rows){ const key = 'https://rrk.ir/#code=' + r.code; const h = hast.get(key); if (h && h.vaziat !== 'dar_saf') continue; ins.run(key, 'rrk', 'rrk', olaviatLar('rrk'), 'dar_saf', ts()); ns.pending.push(r); }
          ns.page = p; did = true;
        } else {
          const r = ns.pending.shift(); R.gam = 'دریافت روزنامهٔ رسمی ' + r.code;
          const ok = await rrkBegir(r, ns);
          if (ok === null){   /* نشست باطل: صفحه با نشست تازه دوباره فهرست می‌شود؛ متنی که ۳ بار نیاید کنار می‌رود */
            RRK.khata++; RP.bad[r.code] = (RP.bad[r.code] || 0) + 1; if (RP.bad[r.code] >= 3) db().prepare("UPDATE saf SET vaziat='khata', khata=?, ts=? WHERE url=?").run('نشست روزنامهٔ رسمی ۳ بار باطل شد', ts(), 'https://rrk.ir/#code=' + r.code);
            ns.s = null; ns.pending = []; if (ns.page){ rpVel(ns.page, false); ns.page = 0; } await khab(5000);
          }
          did = true;
        }
      } catch(e){ ns.s = null; RRK.khata++; log('روزنامهٔ رسمی (کارگر ' + k + '): ' + e.message); await khab(10000); }
      await khab(did ? (tgk() ? 300 : R.fasele) : 30000);
    }
  } finally { if (ns.page) rpVel(ns.page, !ns.pending.length); KARGAR.rrk = Math.max(0, (KARGAR.rrk || 1) - 1); }
}
async function halghe(){
  if (!R.on || R.busy) return;
  if (mget('auto') !== '1'){ R.on = false; R.gam = 'ایستاده'; return; }   /* ایست از نمونهٔ دیگر سرور هم اینجا دیده می‌شود */
  if (!qoflK()){ R.gam = 'در دست نمونهٔ دیگر سرور (فرایند ' + malekK() + ')'; R.timer = setTimeout(halghe, 20000); return; }
  try { const t = +((S && S.metaGet && S.metaGet('mizban_dar_kar')) || 0); if (t && Date.now() - t < 300000){ R.timer = setTimeout(halghe, 5000); return; } } catch(e){}   /* میزبان در حال پاسخ است */
  R.busy = true;
  try {
    R.tik = (R.tik || 0) + 1;   /* فهرست و دریافت درهم: دو دریافت، یک صفحهٔ فهرست */
    /* هر منبع میزبان جدای خودش را دارد؛ دریافت از منبع‌ها هم‌زمان (هر کدام با همان فاصلهٔ مؤدبانه) */
    let did;
    for (const [m, n] of Object.entries(HAMZAMAN)) while ((KARGAR[m] || 0) < n){ KARGAR[m] = (KARGAR[m] || 0) + 1; kargar(m); }
    while ((KARGAR.rrk || 0) < RRK_KARGAR){ KARGAR.rrk = (KARGAR.rrk || 0) + 1; kargarRrk(KARGAR.rrk); }
    did = R.tik % 3 === 0 ? await gamFehrest() : false;   /* دو دریافت هم‌زمان از مجلس (دسته‌های جدا) */
    if (!did) did = await gamFehrest();
    if (!did){
      const n = await gamNamaye(12);
      const mande = (db().prepare("SELECT COUNT(*) c FROM saf WHERE vaziat='dar_saf' AND talash < 4").get() || {}).c || 0;
      if (!n && !mande && (mget('rrk:tamam') === '1' || !(MANABE.rrk && MANABE.rrk.amade))){ R.gam = 'تمام — در انتظار به‌روزرسانی'; R.on = false; mset('auto', '0'); log('کار تمام شد'); return; }
    }
  } catch(e){ R.khata = e.message || String(e); log('خطا: ' + R.khata); }
  finally { R.busy = false; }
  if (R.on) R.timer = setTimeout(halghe, tgk() ? 600 : R.fasele);
}
function shoroo(a, halat){
  const d = db(); if (!d) return 'پایگاه باز نشد: ' + DB_ERR;
  const manabe = Array.isArray(a.manabe) && a.manabe.length ? a.manabe : ['majlis'];
  const naAmade = manabe.filter(m => !MANABE[m] || !MANABE[m].amade);
  const daste = Array.isArray(a.daste) && a.daste.length ? a.daste : Object.keys(DASTE);
  const lars = [...new Set(daste.flatMap(k => DASTE[k] || (/^lar\d+$/.test(k) ? [k] : [])))];
  if (!lars.length) return 'دسته‌ای شناخته نشد؛ دسته‌های مجاز: ' + Object.keys(DASTE).join(' · ');
  mset('lar_ha', JSON.stringify(lars)); mset('halat', halat);
  for (const lar of lars){ mset('fehrest:' + lar + ':tamam', '0'); mset('fehrest:' + lar + ':tekrari', '0'); mset('fehrest:' + lar + ':bad', '0'); if (halat === 'beroz') mset('fehrest:' + lar + ':page', 1); else if (!mget('fehrest:' + lar + ':page')) mset('fehrest:' + lar + ':page', 1); }
  if (halat !== 'beroz') d.prepare("UPDATE saf SET vaziat='dar_saf', talash=0 WHERE vaziat='khata'").run();
  mset('auto', '1'); R.on = true; R.khata = ''; R.gam = 'آغاز'; if (R.timer) clearTimeout(R.timer); R.timer = setTimeout(halghe, 200);
  log((halat === 'beroz' ? 'به‌روزرسانی' : 'گردآوری') + ' آغاز شد: ' + lars.join('،') + (naAmade.length ? ' · منابع آماده‌نشده: ' + naAmade.join('،') : ''));
  return (halat === 'beroz' ? 'به‌روزرسانی آغاز شد' : 'گردآوری آغاز شد') + ' — منبع: مرکز پژوهش‌های مجلس · دسته‌ها: ' + lars.map(l => (Object.entries(DASTE).find(([k, v]) => v[0] === l) || [l])[0]).join(' · ') +
    (naAmade.length ? '\n⚠ این منابع هنوز آماده نیستند و دست نمی‌خورند: ' + naAmade.map(m => m + (MANABE[m] ? ' (' + MANABE[m].chera + ')' : '')).join('، ') : '') + '\nهر درخواست با ' + fa(R.fasele / 1000) + ' ثانیه فاصله؛ کار در پس‌زمینه می‌ماند و پس از بازراه‌اندازی ادامه می‌یابد.';
}
function ist(){ R.on = false; mset('auto', '0'); if (R.timer) clearTimeout(R.timer); R.gam = 'ایستاده'; log('ایست'); return 'کتابخانه ایستاد (کار تا همین‌جا ماندگار است)'; }

/* ---------------------- آمار و وضعیت ---------------------- */
/* ۱۴۰۵/۰۷/۰۲ — «صفرِ صفر» به دستور کارفرما («همه چی این قسمت پاک کن ... کامل از اول»): پایگاه کتابخانه (با همهٔ متن‌ها، تکه‌ها،
   بردارها و صف) کامل به سطل زباله منتقل می‌شود و پایگاهی تازه و خالی ساخته می‌شود؛ گردآوری از اول آغاز می‌شود. */
async function sefr(){
  ist();
  for (let i = 0; i < 60 && R.busy; i++) await new Promise(r => setTimeout(r, 500));
  G2.timers.forEach(t => clearTimeout(t)); if (ML.timer) clearTimeout(ML.timer); if (MC.timer) clearTimeout(MC.timer);
  await new Promise(r => setTimeout(r, 3000));
  try { if (DB){ DB.exec('PRAGMA wal_checkpoint(TRUNCATE)'); DB.close(); } } catch(e){}
  DB = null;
  const zaman = new Date(Date.now() + 3.5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ').replace(':', '');
  const satl = path.join(S.ROOT, 'سطل زباله', 'خانه کلود', 'سرور', 'کتابخانهٔ حقوقی — پیش از صفر کردن ' + zaman);
  fs.mkdirSync(satl, { recursive: true });
  const bordeh = [];
  for (const pas of ['', '-wal', '-shm']){ const f = DBP() + pas; if (fs.existsSync(f)){ fs.renameSync(f, path.join(satl, path.basename(f))); bordeh.push(path.basename(f)); } }
  HAST.at = 0; ONVANHA.at = 0; R.shomar = { fehrest: 0, gerefte: 0, khata: 0, namaye: 0 }; R.log = []; R.akharin = ''; R.khata = '';
  db();
  mset('olaviat_v2', '1');
  for (let k = 0; k < G2_RESHTE; k++) G2.timers[k] = setTimeout(() => halgheGere(k), 5000 + k * 1000);
  ML.timer = setTimeout(halgheMahalli, 8000); MC.timer = setTimeout(halghePardazande, 9000);
  log('صفر شد: پایگاه پیشین به سطل زباله رفت (' + bordeh.join('، ') + ')');
  const aghaz = shoroo({}, 'kamel');
  return 'کتابخانهٔ حقوقی صفرِ صفر شد. پایگاه پیشین (' + bordeh.join('، ') + ') در «' + satl + '» است.\n' + aghaz;
}
/* ۱۴۰۵/۰۷/۰۳ بررسی عمیق: شمارش «بردار دار» و جمع حجم هر بار کل پایگاه ۲٫۵ گیگی را می‌خواند (۵ ثانیه قفل سرور در هر درخواست وضعیت). اکنون: بی‌بردارها از شاخص جزئی، بقیه از شاخص، و نتیجه ۱۵ ثانیه نگه داشته می‌شود */
const AMAR = { t: 0, v: null };
function amar(){
  if (AMAR.v && Date.now() - AMAR.t < 15000) return AMAR.v;
  const d = db(); if (!d) return { mavad: 0, tekke: 0, saf: 0, khata: 0, manabe: 0, namaye: 0, hajm: 0 };
  const q = s => { try { return d.prepare(s).get(); } catch(e){ return {}; } };
  const tk = q('SELECT COUNT(*) c FROM tekke').c || 0;
  AMAR.t = Date.now();
  return AMAR.v = { mavad: q('SELECT COUNT(*) c FROM qanun').c || 0, hajm: q('SELECT COALESCE(SUM(hajm),0) c FROM qanun').c || 0, tekke: tk, namaye: tk - (q('SELECT COUNT(*) c FROM tekke WHERE bordar IS NULL').c || 0),
    saf: q("SELECT COUNT(*) c FROM saf WHERE vaziat='dar_saf'").c || 0, khata: q("SELECT COUNT(*) c FROM saf WHERE vaziat='khata'").c || 0, manabe: q('SELECT COUNT(DISTINCT manba) c FROM qanun').c || 0, akhar: (q('SELECT MAX(ts) t FROM qanun') || {}).t || '' };
}
/* ۱۴۰۵/۰۷/۰۳: وقتی کار در نمونهٔ دیگر سرور است، وضعیت زندهٔ همان نمونه نشان داده می‌شود (نه نمونهٔ بیکار) */
function zendeDigar(){ try { if (!malekK()) return null; const z = JSON.parse(mget('ketab_zende') || 'null'); return z && Date.now() - z.t < 90000 ? z : null; } catch(e){ return null; } }
function state(){ const a = amar(); const z = zendeDigar(); if (z) return Object.assign({ running: true, gam: z.gam, khata: z.khata, at: z.at, akharin: z.akharin, log: z.log || [], shomar: z.shomar || R.shomar, pid: z.pid, dasteHa: Object.keys(NAM_DASTE).map(l => ({ lar: l, nam: NAM_DASTE[l] })) }, a); return Object.assign({ running: R.on, gam: R.gam, khata: R.khata, at: R.akharinAt, akharin: R.akharin, log: R.log.slice(-8), shomar: R.shomar, dasteHa: Object.keys(NAM_DASTE).map(l => ({ lar: l, nam: NAM_DASTE[l] })) }, a); }
function statusLine(){
  const a = amar(); const z = zendeDigar();
  return 'کتابخانهٔ حقوقی: ' + (z ? '🟢 در کار (فرایند ' + z.pid + ') — ' + z.gam : R.on ? '🟢 در کار — ' + R.gam : '⚪ ' + R.gam) + ' · قوانین/مقررات: ' + fa(a.mavad) + ' (' + fa(Math.round(a.hajm / 1024)) + ' کیلونویسه) · تکه (ماده): ' + fa(a.tekke) + ' · نمایهٔ معنایی: ' + fa(a.namaye) + ' · در صف: ' + fa(a.saf) + ' · خطا: ' + fa(a.khata) + ' · تکراری کنار رفته: ' + fa(tekrariKol()) + (G2.ip ? ' · گره دوم (' + G2.ip + '): ' + (G2.ok ? (G2.dar ? '🟢 در حال ساخت نمایه، ' + fa(G2.n) + ' تکه در این نوبت' : '🟢 آماده') : '⚪ در دسترس نیست') + (G2.khata ? ' — ' + G2.khata : '') : '') + (R.khata ? ' · آخرین خطا: ' + R.khata : '') + (R.akharin ? '\nآخرین: ' + R.akharin : '') +
    '\nمنابع: ' + Object.values(MANABE).map(m => (m.amade ? '✅ ' : '⏳ ') + m.onvan + ' (' + m.host + ')').join(' · ') + qvdKhat();
}
function gozaresh(){
  const d = db(); if (!d) return 'پایگاه باز نشد';
  const L = [statusLine(), ''];
  try {
    L.push('به تفکیک مرجع تصویب:');
    for (const r of d.prepare('SELECT marja, COUNT(*) c, SUM(hajm) h FROM qanun GROUP BY marja ORDER BY c DESC LIMIT 20').all()) L.push('  ' + (r.marja || '—') + ': ' + fa(r.c) + ' مورد، ' + fa(Math.round((r.h || 0) / 1024)) + ' کیلونویسه');
    L.push('صف به تفکیک دسته:');
    for (const r of d.prepare('SELECT lar, vaziat, COUNT(*) c FROM saf GROUP BY lar, vaziat ORDER BY lar').all()) L.push('  ' + r.lar + ' · ' + r.vaziat + ': ' + fa(r.c));
    L.push('آخرین ۱۰ مورد گرفته‌شده:');
    for (const r of d.prepare('SELECT onvan, tarikh, marja FROM qanun ORDER BY id DESC LIMIT 10').all()) L.push('  ' + r.onvan + ' — ' + r.tarikh + ' — ' + r.marja);
    L.push('گزارش کار اخیر:'); for (const l of R.log.slice(-12)) L.push('  ' + l);
  } catch(e){ L.push('خطا: ' + e.message); }
  return L.join('\n');
}

/* ---------------------- گزارش خوانا برای اپلیکیشن (۱۴۰۵/۰۷/۰۲) ---------------------- */
const ASLI = [
  ['قانون اساسی', ['قانون اساسی ایران جمهوری اسلامی ایران%']],
  ['قانون مدنی', ['قانون مدنی']],
  ['قانون تجارت', ['قانون تجارت']],
  ['آیین دادرسی مدنی', ['قانون آئین دادرسی دادگاههای عمومی و انقلاب%مدنی%', 'قانون آیین دادرسی دادگاههای عمومی و انقلاب%مدنی%']],
  ['آیین دادرسی کیفری', ['قانون آیین دادرسی کیفری', 'قانون آئین دادرسی کیفری'], '1392'],
  ['مجازات اسلامی', ['قانون مجازات اسلامی'], '1392'],
  ['صدور چک', ['قانون صدور چک', 'قانون اصلاح قانون صدور چک']],
  ['ثبت اسناد و املاک', ['قانون ثبت اسناد و املاک']],
  ['اجرای احکام مدنی', ['قانون اجرای احکام مدنی']],
  ['نحوهٔ اجرای محکومیت‌های مالی', ['قانون نحوه اجرای محکومیتهای مالی', 'قانون نحوه اجرای محکومیت های مالی']],
  ['قانون کار', ['قانون کار'], '1369'],
  ['تأمین اجتماعی', ['قانون تأمین اجتماعی', 'قانون تامین اجتماعی']],
  ['مالیات‌های مستقیم', ['قانون مالیاتهای مستقیم', 'قانون مالیات های مستقیم']],
  ['مالیات بر ارزش افزوده', ['قانون مالیات بر ارزش افزوده'], '1400'],
  ['پولی و بانکی کشور', ['قانون پولی و بانکی کشور']],
  ['عملیات بانکی بدون ربا', ['قانون عملیات بانکی بدون ربا%']],
  ['روابط موجر و مستأجر', ['قانون روابط موجر و مستأجر%', 'قانون روابط موجر و مستاجر%']],
  ['حمایت خانواده', ['قانون حمایت خانواده'], '1391'],
  ['مسئولیت مدنی', ['قانون مسئولیت مدنی', 'قانون مسؤولیت مدنی']],
  ['داوری تجاری بین‌المللی', ['قانون داوری تجاری بین المللی']],
  ['تشکیل دادگاه‌های عمومی و انقلاب', ['قانون تشکیل دادگاههای عمومی و انقلاب']],
  ['بیمه', ['قانون بیمه']],
  ['شهرداری', ['قانون شهرداری']],
];
const GZ = { t: 0, v: null };
function gozareshJson(){ if (GZ.v && Date.now() - GZ.t < 30000) return GZ.v; const v = gozareshJson0(); if (v && v.ok){ GZ.v = v; GZ.t = Date.now(); } return v; }   /* ۱۴۰۵/۰۷/۰۳: گزارش سنگین ۳۰ ثانیه نگه داشته می‌شود */
function gozareshJson0(){
  const d = db(); if (!d) return { ok: false, text: 'پایگاه باز نشد' };
  const a = amar(); const q = (sql, ...x) => { try { return d.prepare(sql).all(...x); } catch(e){ return []; } };
  const gerefte = {}, saf = {}, khata = {};
  for (const r of q("SELECT lar, COUNT(*) n, SUM(hajm) h, SUM(mavad) m, MIN(tarikh) az, MAX(CASE WHEN tarikh <= ? THEN tarikh END) ta FROM qanun GROUP BY lar", emrooz())) gerefte[r.lar] = r;
  for (const r of q("SELECT lar, vaziat, COUNT(*) n FROM saf WHERE vaziat IN ('dar_saf','khata') GROUP BY lar, vaziat")) (r.vaziat === 'khata' ? khata : saf)[r.lar] = r.n;
  const daste = Object.keys(NAM_DASTE).map(l => { const g = gerefte[l] || {}; const fehrestTamam = mget('fehrest:' + l + ':tamam') === '1';
    return { lar: l, manba: MANBA_DASTE(l), nam: NAM_DASTE[l], gerefte: g.n || 0, saf: saf[l] || 0, khata: khata[l] || 0, hajm: g.h || 0, mavad: g.m || 0, az: g.az || '', ta: g.ta || '', fehrestTamam, olaviat: olaviatLar(l) }; })
    .sort((x, y) => y.olaviat - x.olaviat);
  const asli = ASLI.map(([nam, pats, jari]) => {
    let rows = []; for (const p of pats) rows = rows.concat(q("SELECT shenase, onvan, tarikh, mavad, hajm FROM qanun WHERE id IN (SELECT id FROM qanun WHERE onvan LIKE ?)", p));
    const map = new Map(); rows.forEach(r => map.set(r.shenase, r)); rows = [...map.values()].sort((x, y) => (y.tarikh > x.tarikh ? 1 : -1));
    const asl = rows.filter(r => !/^قانون اصلاح/.test(r.onvan)); const best = asl.find(r => r.mavad > 0) || asl[0] || rows[0];
    const sal = best ? best.tarikh.slice(0, 4) : '';
    const vaziat = !best ? 'nist' : (jari && sal < jari) ? 'kohne' : 'darad';
    return { nam, vaziat, jari: jari || '', tarikh: best ? best.tarikh : '', mavad: best ? best.mavad : 0, shenase: best ? best.shenase : '', noskhe: rows.length };
  });
  const dahe = q("SELECT substr(tarikh,1,3) d, COUNT(*) n FROM qanun WHERE tarikh GLOB '1[23][0-9][0-9]/*' AND tarikh <= ? GROUP BY d ORDER BY d", emrooz()).map(r => ({ dahe: r.d + '0', n: r.n }));
  const akharin = q("SELECT onvan, tarikh, lar, ts FROM qanun ORDER BY id DESC LIMIT 8");
  const ayande = q("SELECT COUNT(*) n FROM qanun WHERE tarikh > ?", emrooz())[0];
  const perManba = {}; for (const r of q("SELECT manba, COUNT(*) n, SUM(mavad) m, SUM(hajm) h FROM qanun GROUP BY manba")) perManba[r.manba] = r;
  const safManba = {}; for (const r of q("SELECT manba, COUNT(*) n FROM saf WHERE vaziat='dar_saf' GROUP BY manba")) safManba[r.manba] = r.n;
  const tekkeManba = {}; for (const r of q("SELECT n.manba, COUNT(*) t FROM qanun n JOIN tekke t ON t.qid=n.id GROUP BY n.manba")) tekkeManba[r.manba] = { manba: r.manba, t: r.t, b: r.t }; for (const r of q("SELECT n.manba, COUNT(*) c FROM tekke t JOIN qanun n ON n.id=t.qid WHERE t.bordar IS NULL GROUP BY n.manba")) if (tekkeManba[r.manba]) tekkeManba[r.manba].b -= r.c;
  const tekrariManba = {}; for (const r of q('SELECT manba, COUNT(*) n FROM satl_qanun WHERE bazgasht IS NULL GROUP BY manba')) tekrariManba[r.manba] = r.n;
  const derakht = Object.entries(MANABE).map(([k, m]) => { const g = perManba[k] || {}, tk = tekkeManba[k] || {}; return { manba: k, onvan: m.onvan, host: m.host, amade: !!m.amade, chera: m.chera || '', gerefte: g.n || 0, mavad: g.m || 0, hajm: g.h || 0, saf: k === 'rrk' ? rrkMande() : (safManba[k] || 0), tekke: tk.t || 0, namaye: tk.b || 0, tekrari: tekrariManba[k] || 0, daste: daste.filter(z => z.manba === k) }; });
  return { ok: true, amar: a, daste, derakht, asli, dahe, akharin, ayande: ayande ? ayande.n : 0, emrooz: emrooz(), dar: R.on, gam: R.gam, khata: R.khata, G2: { ip: G2.ip, ok: G2.ok, dar: G2.dar }, mahalli: { dar: ML.dar, n: ML.n, khata: ML.khata }, pardazande: { dar: MC.dar, n: MC.n, khata: MC.khata }, tamamghodrat: tgk() };
}
/* امروز به تاریخ شمسی «YYYY/MM/DD» (برای کنار گذاشتن تاریخ‌های نادرست آینده در سامانهٔ مجلس) */
function emrooz(){ try { const f = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }).formatToParts(new Date()); const g = t => (f.find(x => x.type === t) || {}).value || ''; return g('year').replace(/\D/g, '') + '/' + g('month') + '/' + g('day'); } catch(e){ return '1499/12/29'; } }

/* ---------------------- جست‌وجو (واژه‌ای + معنایی) ---------------------- */
function norm(s){ return String(s || '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ً-ٰٟ]/g, '').replace(/[۰-۹]/g, c => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(c)]).replace(/[‌‎‏]/g, ' ').toLowerCase(); }
const IST_FTS = new Set(['در','از','به','با','که','را','این','آن','چه','چیست','کدام','است','شده','می','شود','بر','تا','یا','هر','برای','طبق','مطابق','چگونه','چند','آیا','نقل','کن','متن','ماده','قانون','اصل','و','های','ها','بگو','دربارهٔ','درباره','تعریف','چطور','باید','کرده','نموده','گوید']);
function ftsQuery(q){
  const w = norm(q).split(/[^\p{L}\p{N}]+/u).filter(x => x.length > 1 && !IST_FTS.has(x)).slice(0, 12);
  return w.map(x => '"' + x.replace(/"/g, '') + '"').join(' OR ');
}
/* ---------------------- یافتن مستقیم ماده ---------------------- */
function saf(s){ return norm(s).replace(/آئین/g, 'آیین').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
const NAM_KOOTAH = [
  [/آیین دادرسی مدنی/, 'آیین دادرسی دادگاههای عمومی و انقلاب در امور مدنی'],
  [/آیین دادرسی کیفری/, 'آیین دادرسی کیفری'],
  [/قانون اساسی(?! .*(اجرا|نحوه))/, 'قانون اساسی ایران جمهوری اسلامی ایران کل قانون اساسی'],
];
const IST = new Set(['قانون', 'ماده', 'اصل', 'در', 'از', 'به', 'و', 'با', 'که', 'را', 'این', 'آن', 'چه', 'های', 'ها', 'یا', 'مصوب', 'اصلاحی', 'شده']);
function madeDagigh(d, q){
  const qs = saf(q);
  const mm = /(ماد[هّ]?|اصل)\s*(\d+)/.exec(qs); if (!mm) return [];
  const hadaf = (/^اصل/.test(mm[1]) ? 'اصل ' : 'ماده ') + (+mm[2]);
  let qn = ' ' + qs + ' '; const alias = new Set();
  for (const [re, nam] of NAM_KOOTAH) if (re.test(qs)){ alias.add(saf(nam)); if (!qn.includes(saf(nam))) qn += ' ' + saf(nam) + ' '; }
  const qw = new Set(qn.split(' ').filter(Boolean));
  let rows = [];
  try { rows = d.prepare('SELECT t.id, n.onvan, n.hajm, n.tarikh FROM tekke t JOIN qanun n ON n.id=t.qid WHERE t.madde=? LIMIT 20000').all(hadaf); } catch(e){ return []; }
  const b = [];
  for (const r of rows){
    const on = saf(r.onvan); if (!on) continue;
    let e;
    if (alias.has(on) || alias.has(on.replace(/^قانون /, ''))) e = 2000 + on.length;                          /* نام رایج کوتاه ← قانون جاری (مثلاً «آیین دادرسی مدنی» ← قانون ۱۳۷۹) */
    else if (qn.includes(' ' + on + ' ')) e = 1000 + on.length;     /* نام کامل قانون در پرسش هست */
    else { const w = on.split(' ').filter(x => x.length > 1 && !IST.has(x)); const hit = w.filter(x => qw.has(x)).length; if (!hit) continue; e = hit * 10 - (w.length - hit) * 3; }
    b.push({ id: r.id, e, hajm: r.hajm || 0, tarikh: r.tarikh || '' });
  }
  if (!b.length) return [];
  b.sort((x, y) => (y.e - x.e) || (y.tarikh > x.tarikh ? 1 : y.tarikh < x.tarikh ? -1 : 0) || (y.hajm - x.hajm));
  if (b[0].e < 10) return [];
  return b.filter(x => x.e === b[0].e).slice(0, 2).map((x, i) => ({ id: x.id, b: 1 - i * 0.1 }));
}
/* نام قانونی که در پرسش آمده (کامل یا نام رایج کوتاه) ← جست‌وجوی واژه‌ای درون همان قانون هم امتیاز می‌گیرد */
const ONVANHA = { at: 0, list: [] };
function qanunhayePorsesh(d, q){
  if (Date.now() - ONVANHA.at > 600000){ ONVANHA.list = d.prepare('SELECT id, onvan, tarikh FROM qanun').all().map(r => ({ id: r.id, on: saf(r.onvan), tarikh: r.tarikh || '' })).filter(r => r.on.split(' ').length >= 2); ONVANHA.at = Date.now(); }
  const qs0 = saf(q), qs = ' ' + qs0 + ' ';
  const alias = NAM_KOOTAH.filter(([re]) => re.test(qs0)).map(([, n]) => saf(n));
  let best = [], bl = 0;
  for (const r of ONVANHA.list){
    const on2 = r.on.replace(/^قانون /, ''); let e = 0;
    if (alias.includes(r.on) || alias.includes(on2)) e = 2000 + r.on.length; else if (qs.includes(' ' + r.on + ' ')) e = 1000 + r.on.length;
    if (!e) continue; if (e > bl){ bl = e; best = [r]; } else if (e === bl) best.push(r);
  }
  return best.sort((a, b) => (b.tarikh > a.tarikh ? 1 : b.tarikh < a.tarikh ? -1 : 0)).slice(0, 3).map(r => r.id);
}
/* آیا قانونی با همین عنوان (یکسان‌شده) در کتابخانه هست؟ — برای پایگاه دانش تا متن قانون را از ویکی‌نبشته دوباره نخواند */
const HAST = { at: 0, set: new Set() };
function hast(onvan){ const d = db(); if (!d) return false; if (Date.now() - HAST.at > 600000){ HAST.set = new Set(d.prepare('SELECT onvan FROM qanun').all().map(r => saf(r.onvan))); HAST.at = Date.now(); } return HAST.set.has(saf(onvan)); }
async function jostojoo(q, had){
  const d = db(); if (!d) return { khata: DB_ERR || 'پایگاه باز نشد', natayej: [] };
  had = Math.max(1, Math.min(+had || 8, 30));
  const score = new Map();
  const fq = ftsQuery(q);
  if (fq){ try { d.prepare('SELECT rowid AS id, bm25(tekke_fts, 1.0, 3.0) AS b FROM tekke_fts WHERE tekke_fts MATCH ? ORDER BY b LIMIT 60').all(fq).forEach((r, i) => score.set(r.id, (score.get(r.id) || 0) + 1 / (60 + i))); } catch(e){} }
  /* پرسش تعریفی («X چیست»، «تعریف X»): ماده‌هایی که با «X عبارت …» یا «X کسی است …» آغاز می‌شوند مستقیم جست‌وجو می‌شوند */
  if (fq && /تعریف|چیست|یعنی|کیست/.test(q)){ try { const kw = fq.split(' OR ').map(x => x.replace(/"/g, '')).filter(x => x.length > 2).slice(0, 4);
    const ph = kw.flatMap(w => ['"' + w + ' عبارت"', '"' + w + ' کسی است"', '"' + w + ' عقدی است"', '"' + w + ' آن است"']).join(' OR ');
    const qids = qanunhayePorsesh(d, q);
    d.prepare('SELECT tekke_fts.rowid AS id FROM tekke_fts JOIN tekke t ON t.id=tekke_fts.rowid WHERE tekke_fts MATCH ?' + (qids.length ? ' AND t.qid IN (' + qids.map(() => '?').join(',') + ')' : '') + ' ORDER BY bm25(tekke_fts) LIMIT 10').all(ph, ...qids).forEach((r, i) => score.set(r.id, (score.get(r.id) || 0) + 0.04 + 1 / (60 + i))); } catch(e){} }
  /* ماده‌ای که «موضوعش» واژهٔ پرسش است («ماده 1 - تاجر کسی است…»، «ماده 1259 - اقرار عبارت است…») برای پرسش‌های تعریفی جلوتر می‌آید */
  if (fq){ try { const kw = fq.split(' OR ').map(x => x.replace(/"/g, '')).filter(x => x.length > 2); const g = d.prepare('SELECT matn FROM tekke WHERE id=?');
    for (const id of [...score.keys()]){ const r = g.get(id); if (!r) continue; const bad = norm(r.matn).replace(/^[^\-–—ـ:]{0,30}[\-–—ـ:]\s*/, '').slice(0, 40); if (kw.some(w => bad.startsWith(w + ' ') || bad.startsWith(w + 'ی '))) score.set(id, score.get(id) + (/تعریف|چیست|یعنی|کیست/.test(q) ? 0.03 : 0.01)); } } catch(e){} }
  if (fq){ try { const qids = qanunhayePorsesh(d, q); if (qids.length) d.prepare('SELECT tekke_fts.rowid AS id, bm25(tekke_fts, 1.0, 3.0) AS b FROM tekke_fts JOIN tekke t ON t.id=tekke_fts.rowid WHERE tekke_fts MATCH ? AND t.qid IN (' + qids.map(() => '?').join(',') + ') ORDER BY b LIMIT 20').all(fq, ...qids).forEach((r, i) => score.set(r.id, (score.get(r.id) || 0) + 0.02 + 1 / (60 + i))); } catch(e){} }
  /* ۱۴۰۵/۰۷/۰۱: اگر پرسش «ماده/اصل N قانون X» است، همان مادهٔ همان قانون مستقیم یافته و بالای فهرست گذاشته می‌شود
     (نام قانون از عنوان‌ها سنجیده می‌شود، نه از واژه‌های پرسش؛ نام‌های رایج کوتاه به عنوان رسمی برگردانده می‌شوند) */
  for (const x of madeDagigh(d, q)) score.set(x.id, (score.get(x.id) || 0) + x.b);
  let manaei = false;
  try {
    const DN = require('./danesh.js');
    const hast = d.prepare('SELECT 1 FROM tekke WHERE bordar IS NOT NULL LIMIT 1').get();
    let g2 = hast && await g2Amade();
    if (hast && !g2 && S.metaGet && S.metaGet('gere2_ip')){ G2.at = 0; g2 = await g2Amade(); }   /* تقسیم کارفرما: بردار پرسش با گره دوم؛ کیس یک فقط اگر گره دوم واقعاً در دسترس نباشد */
    if (hast && (g2 || (DN.startEmb && DN.bordarha && await DN.startEmb()))){
      let qv; try { qv = g2 ? (await g2Bordarha([String(q).slice(0, 2000)]))[0] : null; } catch(e){ try { qv = g2 ? (await g2Bordarha([String(q).slice(0, 2000)]))[0] : null; } catch(e2){ qv = null; } }
      if (!qv) { if (!(DN.startEmb && DN.bordarha && await DN.startEmb())) throw new Error('بردار پرسش ساخته نشد'); [qv] = await DN.bordarha([String(q).slice(0, 2000)]); }
      if (!VK.n || Date.now() - VK.t > 1200000) vkSakht();   /* ۱۴۰۵/۰۷/۰۳: بردارهای فشرده در حافظه؛ ساخت در پس‌زمینه */
      let top = [];
      if (VK.n && VK.dim === qv.length){
        const { n, dim, q: QV, sc, ids } = VK; const cand = []; let minS = -Infinity;
        for (let j = 0; j < n; j++){ const o = j * dim; let s = 0; for (let i = 0; i < dim; i++) s += QV[o + i] * qv[i]; s *= sc[j]; if (cand.length < 200){ cand.push({ id: ids[j], s }); if (cand.length === 200){ cand.sort((a, b) => a.s - b.s); minS = cand[0].s; } } else if (s > minS){ cand[0] = { id: ids[j], s }; cand.sort((a, b) => a.s - b.s); minS = cand[0].s; } }
        const gb = d.prepare('SELECT bordar FROM tekke WHERE id=?');
        for (const c of cand){ const r = gb.get(c.id); if (!r || !r.bordar) continue; const u = new Uint8Array(r.bordar); const v = new Float32Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.length)); let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * qv[i]; top.push({ id: c.id, s }); }
        top.sort((a, b) => b.s - a.s); top = top.slice(0, 60);
      } else if (VK.dar) { throw new Error('نمایهٔ معنایی در حال بار شدن در حافظه است؛ این بار فقط جست‌وجوی واژه‌ای'); }
      else for (const r of d.prepare('SELECT id, bordar FROM tekke WHERE bordar IS NOT NULL').iterate()){
        const u = new Uint8Array(r.bordar); const c = new ArrayBuffer(u.length); new Uint8Array(c).set(u); const v = new Float32Array(c);
        let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * qv[i];
        if (top.length < 60 || s > top[top.length - 1].s){ top.push({ id: r.id, s }); top.sort((a, b) => b.s - a.s); if (top.length > 60) top.pop(); }
      }
      top.forEach((r, i) => score.set(r.id, (score.get(r.id) || 0) + 1 / (60 + i)));
      manaei = true;
    }
  } catch(e){ R.khata = 'جست‌وجوی معنایی: ' + (e.message || e); }
  let ids = [...score.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  /* ۱۴۰۵/۰۷/۰۳ بررسی عمیق: با بیش از ۲۰ هزار رأی دادگاه، رأی‌ها متن قانون را از بالای فهرست کنار می‌زدند؛ اگر پرسش دربارهٔ رأی نیست، حداکثر یک‌سوم نتایج رأی است و بقیهٔ رأی‌ها پس از قوانین می‌آیند */
  if (!/رأی|رای|دادنامه|رویه|نمونه/.test(q)){ try { const gm = d.prepare('SELECT n.manba FROM tekke t JOIN qanun n ON n.id=t.qid WHERE t.id=?'); const saghf = Math.max(1, Math.floor(had / 3)); const a1 = [], a2 = []; let nr = 0; for (const id of ids){ const r = gm.get(id); if (r && r.manba === 'ara' && ++nr > saghf) a2.push(id); else a1.push(id); } ids = a1.concat(a2); } catch(e){} }
  ids = ids.slice(0, had);
  const getT = d.prepare('SELECT t.id, t.madde, t.matn, t.shomare, n.onvan, n.url, n.tarikh, n.marja, n.manba, n.shenase FROM tekke t JOIN qanun n ON n.id=t.qid WHERE t.id=?');
  const natayej = ids.map(id => getT.get(id)).filter(Boolean).map(r => ({ onvan: r.onvan, madde: r.madde, url: r.url, tarikh: r.tarikh, marja: r.marja, manba: MANABE[r.manba] ? MANABE[r.manba].onvan : r.manba, emtiaz: MANABE[r.manba] ? MANABE[r.manba].emtiaz : 0, hoshdar: MANABE[r.manba] ? MANABE[r.manba].hoshdar : '', matn: r.matn }));
  return { q, manaei, natayej };
}
function matnNatayej(r){
  if (r.khata) return 'خطا: ' + r.khata;
  if (!r.natayej.length) return 'در کتابخانهٔ حقوقی نیست: ' + r.q + (r.manaei ? '' : ' (فقط جست‌وجوی واژه‌ای؛ نمایهٔ معنایی هنوز ساخته نشده)') + '. اگر کتابخانه هنوز کامل گردآوری نشده، این نبودن به معنای نبودنِ قانون نیست.';
  return r.natayej.map((x, i) => (i + 1) + ') ' + x.onvan + (x.madde ? ' — ' + x.madde : '') + '\n   تاریخ تصویب: ' + (x.tarikh || '؟') + ' · مرجع: ' + (x.marja || '؟') + ' · منبع: ' + x.manba + '\n   ' + x.url + '\n' + x.matn).join('\n\n');
}
function matnQanun(a){
  const d = db(); if (!d) return S.fail('پایگاه باز نشد');
  const q = String(a.shenase || a.url || a.onvan || '').trim(); if (!q) return S.fail('shenase یا url یا onvan لازم است');
  const r = d.prepare('SELECT * FROM qanun WHERE shenase=? OR url=? OR onvan LIKE ? ORDER BY id LIMIT 1').get(q, q, '%' + q + '%');
  if (!r) return S.ok('در کتابخانه نیست: ' + q);
  const off = Math.max(0, +a.offset || 0), lim = Math.max(1000, Math.min(+a.limit || 30000, 60000));
  return S.ok(r.onvan + '\nتاریخ تصویب: ' + r.tarikh + ' · مرجع: ' + r.marja + ' · شناسه: ' + r.shenase + ' · ' + r.url + '\nاثر انگشت متن: ' + r.sha256.slice(0, 16) + ' · ' + fa(r.hajm) + ' نویسه · ' + fa(r.mavad) + ' ماده · دریافت: ' + r.ts + '\n———\n' + r.matn.slice(off, off + lim) + (r.matn.length > off + lim ? '\n… (ادامه با offset=' + (off + lim) + ')' : ''));
}
function fehrest(a){
  const d = db(); if (!d) return S.fail('پایگاه باز نشد');
  const lim = Math.max(1, Math.min(+a.limit || 50, 300)), off = Math.max(0, +a.offset || 0);
  const kw = String(a.q || '').trim();
  const rows = kw ? d.prepare('SELECT shenase, onvan, tarikh, marja, mavad FROM qanun WHERE onvan LIKE ? ORDER BY tarikh DESC LIMIT ? OFFSET ?').all('%' + kw + '%', lim, off) : d.prepare('SELECT shenase, onvan, tarikh, marja, mavad FROM qanun ORDER BY tarikh DESC LIMIT ? OFFSET ?').all(lim, off);
  const kol = kw ? d.prepare('SELECT COUNT(*) c FROM qanun WHERE onvan LIKE ?').get('%' + kw + '%').c : d.prepare('SELECT COUNT(*) c FROM qanun').get().c;
  return S.ok(fa(kol) + ' مورد' + (kw ? ' برای «' + kw + '»' : '') + ' (نمایش ' + fa(rows.length) + ' از ردیف ' + fa(off) + '):\n' + rows.map(r => r.shenase + ' · ' + r.onvan + ' — ' + r.tarikh + ' — ' + r.marja + ' — ' + fa(r.mavad) + ' ماده').join('\n'));
}

function init(shared, helpers){
  S = shared; H = helpers;
  try { db(); } catch(e){}
  try { if (mget('olaviat_v2') !== '1'){ const d0 = db(); const up = d0.prepare("UPDATE saf SET olaviat=? WHERE lar=? AND vaziat='dar_saf'"); for (const [l, o] of Object.entries(OLAVIAT)) up.run(o, l); mset('olaviat_v2', '1'); } } catch(e){}
  try { if (mget('adk_v1') !== '1'){ hadafJadval(); const d0 = db(); d0.prepare("UPDATE hadaf_url SET asli=0 WHERE url LIKE 'https://rrk.ir/#code=%' AND url IN (SELECT url FROM qanun WHERE hajm < 1500)").run(); d0.prepare("UPDATE hadaf SET vaziat='nayafte', urls='[]' WHERE vaziat='yafte' AND onvan NOT IN (SELECT onvan FROM hadaf_url WHERE asli=1)").run(); mset('adk_v1', '1'); } } catch(e){}
  try { hadafJadval(); HD.timer = setInterval(() => { if (!qoflK()) return; try { mset('ketab_zende', JSON.stringify({ pid: process.pid, t: Date.now(), gam: R.gam, khata: R.khata, at: R.akharinAt, akharin: R.akharin, log: R.log.slice(-8), shomar: R.shomar })); } catch(e){} if (mget('auto') === '1' && !R.on){ R.on = true; R.gam = 'ادامه در این نمونه'; if (R.timer) clearTimeout(R.timer); R.timer = setTimeout(halghe, 200); } yekta(); hamgamDanesh(); }, 20000); setTimeout(yekta, 15000); setTimeout(() => { try { const n = require('./danesh.js').yektaDanesh(); if (n) log('پایگاه دانش: ' + n + ' منبع تکراری به سطل رفت'); } catch(e){} }, 90000); } catch(e){}   /* یکتایی، سپس قوانین هدف ← پایگاه دانش */
  try { if (mget('tarikh_ara_dotic_v1') !== '1'){ db().prepare("UPDATE saf SET vaziat='dar_saf', ts=? WHERE vaziat='gerefte' AND manba IN ('ara','dotic') AND url IN (SELECT url FROM qanun WHERE manba IN ('ara','dotic') AND (tarikh IS NULL OR tarikh=''))").run(ts()); mset('tarikh_ara_dotic_v1', '1'); } } catch(e){}   /* چند رأی/مطلب نخست بی‌تاریخ گرفته شدند؛ یک بار دوباره گرفته می‌شوند */
  for (let k = 0; k < G2_RESHTE; k++) G2.timers[k] = setTimeout(() => halgheGere(k), 20000 + k * 1500);
  ML.timer = setTimeout(halgheMahalli, 25000);
  try { const d0 = db(); const insR = d0.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)'); SSAA_RISHE.forEach(u => insR.run(u, 'ssaa', 'ssaa', olaviatLar('ssaa'), 'dar_saf', ts())); } catch(e){}
  try { if (mget('ssaa_nfkc_v1') !== '1'){ const d0 = db(); d0.exec('CREATE TABLE IF NOT EXISTS ssaa_pedar(url TEXT PRIMARY KEY, onvan TEXT)'); const up = d0.prepare('UPDATE ssaa_pedar SET onvan=? WHERE url=?'); d0.prepare('SELECT url, onvan FROM ssaa_pedar').all().forEach(r => { const n = String(r.onvan || '').normalize('NFKC'); if (n !== r.onvan) up.run(n, r.url); }); d0.prepare("UPDATE saf SET vaziat='dar_saf', ts=? WHERE manba='ssaa' AND vaziat IN ('gerefte','kenar')").run(ts()); mset('ssaa_nfkc_v1', '1'); } } catch(e){}   /* ۱۴۰۵/۰۷/۰۳ ریشه‌های سازمان ثبت */
  setTimeout(() => { try { db().exec('CREATE INDEX IF NOT EXISTS qanun_manba ON qanun(manba, hajm, mavad); CREATE INDEX IF NOT EXISTS qanun_lar ON qanun(lar, hajm, mavad, tarikh); CREATE INDEX IF NOT EXISTS qanun_ts ON qanun(ts);'); } catch(e){ log('شاخص‌ها: ' + e.message); } }, 45000);   /* ۱۴۰۵/۰۷/۰۳ شمارش‌های وضعیت بی خواندن کل جدول */
  setTimeout(() => { try { if (malekK() || HD.dar) return; const d0 = db(); hadafJadval(); const L = d0.prepare('SELECT DISTINCT c.jostojoo j FROM cbi_onvan c LEFT JOIN hadaf h ON h.onvan=c.jostojoo WHERE h.onvan IS NULL').all().map(r => r.j).filter(Boolean); if (L.length){ hdLog('بانک مرکزی: ادامهٔ جست‌وجوی ' + fa(L.length) + ' عنوان پس از بازراه‌اندازی'); hadafRun(L, 'cbi').catch(e => hdLog('بانک مرکزی: ' + e.message)); } } catch(e){} }, 60000);   /* ۱۴۰۵/۰۷/۰۲ */
  MC.timer = setTimeout(halghePardazande, 30000);
  try { fs.mkdirSync(qvdPoshe(), { recursive: true }); QVD.timer = setInterval(qvdGam, 3000); } catch(e){ log('پوشهٔ دریافت مرورگر: ' + e.message); }
  if (mget('auto') === '1') setTimeout(() => { try { R.on = true; R.gam = 'ادامه پس از بازراه‌اندازی'; halghe(); log('کار از پیش روشن بود — ادامه یافت'); } catch(e){ log('آغاز: ' + e.message); } }, 12000);
}
/* ---------------------- قوانین هدف (زبانهٔ «قوانین ایران») — ۱۴۰۵/۰۷/۰۲ به دستور کارفرما ----------------------
   «قوانین جمهوری اسلامی ایران … همه‌شون باید اول از همه برن توی پایگاه دانش بعد معنایی روشون با تمام قدرت کار کنه»
   ۱) هر عنوان در سامانهٔ مجلس جست‌وجو می‌شود (عبارت دقیق، همهٔ صفحه‌های نتیجه)؛ متن اصلی با اولویت ۱۰۰ و اصلاحیه‌هایش با ۹۷ به صف می‌رود.
   ۲) نمایهٔ معنایی (گره دوم، کارت و پردازنده) اول تکه‌های همین قانون‌ها را می‌سازد.
   ۳) متن هر قانون گرفته‌شده به پایگاه دانش می‌رود و بردارهایش پس از ساخته شدن همان‌جا رونوشت می‌شود (بی محاسبهٔ دوباره). */
const HD = { dar: false, gam: '', log: [], timer: null };
const khab = ms => new Promise(r => setTimeout(r, ms));
const nrmT = s => String(s || '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[\u064b-\u0655\u0670]/g, '').replace(/[\u200c\u200e\u200f]/g, ' ').replace(/[()«»"'،.:؛\-–—]/g, ' ').replace(/[۰-۹]/g, c => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(c)]).replace(/\s+/g, ' ').trim();
const IST_T = new Set(['قانون', 'و', 'در', 'به', 'از', 'با', 'کشور', 'ایران', 'جمهوری', 'اسلامی']);
const ZIR = /(^| )(اصلاح|اصلاحیه|الحاق|تمدید|تفسیر|اجرایی|اجرائی|موافقتنامه|رای|رأی|ابطال|نظریه|دائمی|تنقیح|فهرست|تعرفه)( |$)/;
function hdLog(m){ HD.log.push(new Date().toLocaleTimeString('fa-IR') + ' ' + m); if (HD.log.length > 80) HD.log.shift(); log(m); }
function hadafJadval(){ const d = db(); if (!d) return; d.exec("CREATE TABLE IF NOT EXISTS hadaf(onvan TEXT PRIMARY KEY, vaziat TEXT, urls TEXT, ts TEXT); CREATE TABLE IF NOT EXISTS hadaf_url(url TEXT PRIMARY KEY, onvan TEXT, asli INTEGER, danesh INTEGER DEFAULT 0); CREATE INDEX IF NOT EXISTS tekke_qid ON tekke(qid); CREATE TABLE IF NOT EXISTS cbi_onvan(url TEXT PRIMARY KEY, onvan TEXT, fehrest TEXT, jostojoo TEXT, ts TEXT);"); if (!HD.gr){ HD.gr = 1; try { d.exec("ALTER TABLE hadaf ADD COLUMN goruh TEXT DEFAULT 'iran'"); } catch(e){} } }
async function jostojooMajlis(onvan, azad){   /* azad: عنوان‌هایی که با «قانون/آیین‌نامه/لایحه» آغاز نمی‌شوند هم پذیرفته شوند (مقررات، دستورالعمل، مصوبه — بانک مرکزی) */
  const tAsl = nrmT(String(onvan).replace(/ — .*$/, '')); const w = tAsl.split(' ').filter(x => !IST_T.has(x));
  const hazf = ZIR.test(tAsl) ? null : ZIR; const hame = new Map(); let last = null;
  const bh = s => String(s).replace(/[أإ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ی');
  for (const t of [...new Set([tAsl, nrmT(String(onvan).replace(/ — .*$/, '').replace(/\u200c/g, '')), bh(tAsl)])]){
    const q = 'https://rc.majlis.ir/fa/law/search?only_title=1&keyword=' + encodeURIComponent('"' + t + '"');
    for (let p = 1; p <= 15; p++){
      const r = await get(q + '&page=' + p, 60000); R.akharinAt = Date.now(); await khab(R.fasele);
      if (r.code !== 200) break;
      const items = [...r.body.matchAll(/href="https:\/\/rc\.majlis\.ir\/fa\/law\/show\/(\d+)"[^>]*>\s*<h2 class="title"[^>]*>([\s\S]*?)<\/h2>/g)];
      items.forEach(m => hame.set(m[1], strip(m[2])));
      const n = +(((/رکورد\s*ها:\s*([\d,٬]+)/.exec(r.body) || [])[1] || '0').replace(/[,٬]/g, ''));
      if (!items.length || p * 10 >= n) break;
    }
    const mn = [...hame].map(([id, o]) => ({ id, onvan: o, n: nrmT(o) })).filter(x => (azad || /^(قانون|آیین نامه|لایحه)/.test(x.n)) && w.every(y => bh(x.n).includes(bh(y))));
    const asli = mn.filter(x => !hazf || !hazf.test(x.n)).sort((a, b) => a.n.length - b.n.length);
    last = { asli: asli.length ? asli.filter(x => x.n.length <= asli[0].n.length + 6).slice(0, 4) : [], eslah: mn.filter(x => hazf && hazf.test(x.n) && /^قانون (اصلاح|الحاق|تمدید|تفسیر|دائمی)/.test(x.n)).slice(0, 30) };
    if (last.asli.length) return last;
  }
  return last || { asli: [], eslah: [] };
}
async function hadafRun(list, goruh){
  goruh = goruh || 'iran'; const azad = goruh === 'cbi';
  if (HD.dar) return; HD.dar = true; hadafJadval(); const d = db();
  const insQ = d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)');
  const upQ = d.prepare("UPDATE saf SET olaviat=MAX(olaviat, ?) WHERE url=? AND vaziat='dar_saf'");
  const insU = d.prepare('INSERT INTO hadaf_url(url, onvan, asli) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET asli=MAX(asli, excluded.asli)');
  const setH = d.prepare('INSERT INTO hadaf(onvan, vaziat, urls, ts, goruh) VALUES(?,?,?,?,?) ON CONFLICT(onvan) DO UPDATE SET vaziat=excluded.vaziat, urls=excluded.urls, ts=excluded.ts');
  try {
    for (const onvan of list){
      if (HD.laghv){ HD.laghv = false; hdLog('جست‌وجوی جاری برای فهرست تازه کنار گذاشته شد'); break; }
      const o = d.prepare('SELECT vaziat FROM hadaf WHERE onvan=?').get(onvan); if (o && o.vaziat === 'yafte') continue;
      HD.gam = 'جست‌وجوی «' + onvan + '» در سامانهٔ مجلس';
      let r; try { r = await jostojooMajlis(onvan, azad); } catch(e){ hdLog(onvan + ': ' + e.message); continue; }
      const urls = [];
      r.asli.forEach(x => { const u = MJ.showUrl(x.id); insQ.run(u, 'majlis', 'lar2', 100, 'dar_saf', ts()); upQ.run(100, u); insU.run(u, onvan, 1); urls.push(x.onvan); });
      r.eslah.forEach(x => { const u = MJ.showUrl(x.id); insQ.run(u, 'majlis', 'lar2', 97, 'dar_saf', ts()); upQ.run(97, u); insU.run(u, onvan, 0); });
      if (!r.asli.length && MANABE.rrk && MANABE.rrk.amade){ try { HD.gam = 'جست‌وجوی «' + onvan + '» در روزنامهٔ رسمی'; const y = await rrkHadaf(onvan, azad); if (y){ insU.run(y.key, onvan, 1); urls.push(y.onvan + ' (روزنامهٔ رسمی)'); } } catch(e){ hdLog('روزنامهٔ رسمی: ' + e.message); } }
      setH.run(onvan, urls.length ? 'yafte' : 'nayafte', JSON.stringify(urls), ts(), goruh);
      hdLog((azad ? 'بانک مرکزی «' : 'قانون هدف «') + onvan + '»: ' + (urls.length ? urls.length + ' متن اصلی (' + urls.join('؛ ').slice(0, 160) + ') + ' + r.eslah.length + ' اصلاحیه به صف رفت' : 'در سامانهٔ مجلس یافت نشد'));
    }
  } finally { HD.dar = false; HD.gam = ''; if (HD.pas && HD.pas.length){ const p = HD.pas; HD.pas = []; setTimeout(() => hadafRun(p, 'cbi').catch(e => hdLog('بانک مرکزی: ' + e.message)), 1000); } }
}
/* تکه‌های بی‌بردار: اول تکه‌های قوانین هدف، سپس بقیه */
function bibordar(cond, args, order, had){
  const d = db(); if (!d) return []; let rows = [];
  try { rows = d.prepare('SELECT t.id, t.matn FROM hadaf_url h JOIN qanun q ON q.url=h.url JOIN tekke t ON t.qid=q.id WHERE t.bordar IS NULL' + (cond ? ' AND ' + cond.replace(/\bid\b/g, 't.id') : '') + ' ORDER BY t.id ' + order + ' LIMIT ' + had).all(...args); } catch(e){}
  if (!rows.length){ try { rows = d.prepare("SELECT t.id, t.matn FROM tekke t JOIN qanun q ON q.id=t.qid WHERE t.bordar IS NULL AND q.manba != 'ara'" + (cond ? ' AND ' + cond.replace(/\bid\b/g, 't.id') : '') + ' ORDER BY t.id ' + order + ' LIMIT ' + had).all(...args); } catch(e){} }   /* ۱۴۰۵/۰۷/۰۳: قوانین و مقررات پیش از آرای دادگاه‌ها */
  if (!rows.length) rows = d.prepare('SELECT id, matn FROM tekke WHERE bordar IS NULL' + (cond ? ' AND ' + cond : '') + ' ORDER BY id ' + order + ' LIMIT ' + had).all(...args);
  return rows;
}
/* پایگاه دانش: متن قانون‌های هدفِ گرفته‌شده و سپس بردارهایشان */
function hamgamDanesh(){
  return;   /* ۱۴۰۵/۰۷/۰۲ دستور کارفرما: کتابخانه همان پایگاه دانش است؛ رونوشت جدا ساخته نمی‌شود */
  try {
    const D = require('./danesh.js'); if (!D.azKetabkhane) return; const d = db(); if (!d) return; hadafJadval();
    const rows = d.prepare('SELECT h.url, q.id qid, q.onvan, q.tarikh, q.marja, q.sha256, q.hajm FROM hadaf_url h JOIN qanun q ON q.url=h.url WHERE h.danesh=0 AND q.sha_n IS NOT NULL AND h.onvan NOT IN (SELECT onvan FROM hadaf WHERE goruh=\'cbi\') LIMIT 5').all();
    for (const r of rows){
      const tk = d.prepare('SELECT shomare, madde, matn, bordar FROM tekke WHERE qid=? ORDER BY shomare').all(r.qid);
      if (D.azKetabkhane({ url: r.url, onvan: r.onvan + (r.tarikh ? ' — مصوب ' + r.tarikh : ''), sha: r.sha256, hajm: r.hajm }, tk)){ d.prepare('UPDATE hadaf_url SET danesh=1 WHERE url=?').run(r.url); hdLog('به پایگاه دانش رفت: ' + r.onvan + ' (' + tk.length + ' تکه)'); }
    }
    const g = d.prepare('SELECT t.bordar FROM qanun q JOIN tekke t ON t.qid=q.id WHERE q.url=? AND t.shomare=? AND t.bordar IS NOT NULL');
    D.bordarAzKetabkhane((url, shomare) => { const x = g.get(url, shomare); return x ? x.bordar : null; });
  } catch(e){ hdLog('پایگاه دانش: ' + e.message); }
}
function hadafJson(goruh){
  const d = db(); if (!d) return { ok: false }; hadafJadval();
  const H = d.prepare("SELECT onvan, vaziat, urls FROM hadaf WHERE COALESCE(goruh,'iran')=?").all(goruh || 'iran');
  const U = d.prepare("SELECT h.onvan, h.asli, h.danesh, s.vaziat sv, q.id qid, (SELECT COUNT(*) FROM tekke t WHERE t.qid=q.id) tk, (SELECT COUNT(*) FROM tekke t WHERE t.qid=q.id AND t.bordar IS NOT NULL) bd FROM hadaf_url h LEFT JOIN saf s ON s.url=h.url LEFT JOIN qanun q ON q.url=h.url").all();
  const by = {}; U.forEach(u => { const b = by[u.onvan] || (by[u.onvan] = { asli: 0, eslah: 0, gerefte: 0, danesh: 0, tekke: 0, bordar: 0 }); u.asli ? b.asli++ : b.eslah++; if (u.qid) b.gerefte++; if (u.danesh) b.danesh++; b.tekke += u.tk || 0; b.bordar += u.bd || 0; });
  return { ok: true, dar: HD.dar, gam: HD.gam, log: HD.log.slice(-20), hadaf: H.map(h => Object.assign({ onvan: h.onvan, vaziat: h.vaziat, asliha: JSON.parse(h.urls || '[]') }, by[h.onvan] || {})) };
}
function hadafMatn(){
  const j = hadafJson(); if (!j.ok) return 'پایگاه باز نشد';
  const k = j.hadaf; const s = (f) => k.reduce((a, b) => a + (b[f] || 0), 0);
  return 'قوانین هدف (زبانهٔ «قوانین ایران»): ' + fa(k.length) + ' عنوان · یافته در سامانهٔ مجلس ' + fa(k.filter(x => x.vaziat === 'yafte').length) + ' · متن گرفته ' + fa(s('gerefte')) + ' از ' + fa(s('asli') + s('eslah')) + ' · نمایهٔ معنایی ' + fa(s('bordar')) + ' از ' + fa(s('tekke')) + ' تکه' + (j.dar ? '\nدر کار: ' + j.gam : '') +
    '\n' + k.map(x => (x.vaziat === 'yafte' ? (x.gerefte && x.bordar >= x.tekke && x.tekke ? '✅ ' : '⏳ ') : x.vaziat === 'nayafte' ? '❔ ' : '… ') + x.onvan + (x.vaziat === 'nayafte' ? ' — در سامانهٔ مجلس با این عنوان یافت نشد' : x.asli ? ' — گرفته ' + fa(x.gerefte || 0) + '/' + fa((x.asli || 0) + (x.eslah || 0)) + ' · نمایه ' + fa(x.bordar || 0) + '/' + fa(x.tekke || 0) : '')).join('\n');
}

/* ۱۴۰۵/۰۷/۰۲ دستور کارفرما: «بزار تاریخچهٔ قوانین بمونه … بگه این آخرین اصلاحیه هست، قبلش این بوده، با تاریخ».
   ۱) هیچ متنی جایگزین و گم نمی‌شود: اگر منبع برای همان نشانی متن تازه‌ای بدهد، متن پیشین در qanun_noskhe می‌ماند.
   ۲) زنجیره: هر قانون + اصلاحیه‌ها و الحاقیه‌هایش (از روی عنوان: «قانون اصلاح/الحاق … قانون X») به ترتیب تاریخ. */
function noskheKohne(d, id, hJadid){
  try {
    const r = d.prepare('SELECT * FROM qanun WHERE id=?').get(id); if (!r || r.sha256 === hJadid) return;
    d.exec('CREATE TABLE IF NOT EXISTS qanun_noskhe(id INTEGER PRIMARY KEY, url TEXT, manba TEXT, onvan TEXT, tarikh TEXT, sha256 TEXT, hajm INTEGER, matn TEXT, radif TEXT, ta TEXT); CREATE INDEX IF NOT EXISTS qanun_noskhe_url ON qanun_noskhe(url);');
    if (d.prepare('SELECT 1 FROM qanun_noskhe WHERE url=? AND sha256=?').get(r.url, r.sha256)) return;
    const radif = Object.assign({}, r); delete radif.matn;
    d.prepare('INSERT INTO qanun_noskhe(url, manba, onvan, tarikh, sha256, hajm, matn, radif, ta) VALUES(?,?,?,?,?,?,?,?,?)').run(r.url, r.manba, r.onvan, r.tarikh, r.sha256, r.hajm, r.matn, JSON.stringify(radif), ts());
    log('نسخهٔ پیشین متن نگه داشته شد: ' + r.onvan);
  } catch(e){ log('نسخهٔ پیشین: ' + e.message); }
}
const ESLAH_RE = /^(قانون |لایحه قانونی )?(اصلاحیه|اصلاح|الحاق|تمدید|تفسیر|متمم|نسخ)/;
const NOE_Q = /^(قانون|لایحه قانونی|اصلاحیه|تصویب نامه قانونی|متمم)/;
function payeQanun(onvan){
  let t = nrmT(String(onvan || '').replace(/ — .*$/, '')).replace(/[«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  if (ESLAH_RE.test(t)){ const i = t.lastIndexOf('قانون '); if (i > 0) t = t.slice(i); }
  return t.replace(/ (مصوب|مورخ|به شماره|با آخرین|و اصلاحات|و الحاقات).*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}
function tarikhOrd(t){ const m = String(t || '').replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? m[1] + '/' + m[2].padStart(2, '0') + '/' + m[3].padStart(2, '0') : ''; }
const ZJ = { t: 0, m: null };
function zanjireNaqshe(){
  if (ZJ.m && Date.now() - ZJ.t < 600000) return ZJ.m;
  const d = db(); const m = new Map(); if (!d) return m;
  for (const r of d.prepare("SELECT id, manba, url, onvan, tarikh, marja, mavad FROM qanun WHERE manba != 'ara'").all()){ if (!NOE_Q.test(nrmT(r.onvan))) continue; const b = payeQanun(r.onvan); if (!m.has(b)) m.set(b, []); m.get(b).push(r); }
  ZJ.m = m; ZJ.t = Date.now(); return m;
}
function zanjire(onvan){ return (zanjireNaqshe().get(payeQanun(onvan)) || []).map(r => Object.assign({}, r, { t: tarikhOrd(r.tarikh) })).sort((a, b) => (a.t || '9').localeCompare(b.t || '9') || a.id - b.id); }
function akharinEslah(onvan, tarikh){ try { const z = zanjire(onvan); if (z.length < 2) return null; const a = z[z.length - 1]; const t = tarikhOrd(tarikh); if (!a.t || (t && a.t <= t)) return null; return { onvan: a.onvan, tarikh: a.t, n: z.length }; } catch(e){ return null; } }
function tarikhcheMatn(onvan){
  ZJ.t = 0; const z = zanjire(onvan); const base = payeQanun(onvan);
  if (!z.length) return 'در کتابخانه متنی برای «' + base + '» یافت نشد';
  const nk = {}; try { db().prepare('SELECT url, COUNT(*) c FROM qanun_noskhe GROUP BY url').all().forEach(r => { nk[r.url] = r.c; }); } catch(e){}
  const MN = { majlis: 'مجلس', rrk: 'روزنامهٔ رسمی', dotic: 'پایگاه ملی قوانین', cbi: 'بانک مرکزی' }; const a = z[z.length - 1];
  return 'تاریخچهٔ «' + base + '» در کتابخانه — ' + fa(z.length) + ' متن، از قدیم به جدید:\n' + z.map((r, i) => fa(i + 1) + ') ' + (r.t || 'بی‌تاریخ') + ' — ' + r.onvan + ' — ' + (MN[r.manba] || r.manba) + (r.marja ? ' · ' + r.marja : '') + ' · ' + fa(r.mavad || 0) + ' ماده · شناسه ' + r.id + (nk[r.url] ? ' · ' + fa(nk[r.url]) + ' نسخهٔ پیشینِ متن نگه داشته شده' : '') + (r === a ? '  ← آخرین' : '')).join('\n');
}
/* ۱۴۰۵/۰۷/۰۲ — بانک مرکزی: PDFهایش لایهٔ متن سالم ندارند و کارفرما OCR نخواست («از منابع دیگر قوانینش را پیدا کن»). عنوان‌ها از فهرست‌های سایت (از مرورگر کارفرما، درگاه /rabet/cbi/onvanha) و متن هر یک از مجلس یا روزنامهٔ رسمی؛ فقط کتابخانه، نه پایگاه دانش */
function cbiTamiz(s){ return String(s || '').replace(/\s+/g, ' ').replace(/[(\[][^)\]]*(جلسه|مورخ|مصوب|اصلاح|ابلاغ)[^)\]]*[)\]]/g, ' ').replace(/^[\s،؛;,.:\-–—]+|[\s،؛;,.:\-–—]+$/g, '').replace(/\s+/g, ' ').trim(); }
function hadafCbi(items){
  const d = db(); if (!d) return { ok: false, text: 'پایگاه باز نشد' }; hadafJadval();
  const ins = d.prepare('INSERT INTO cbi_onvan(url, onvan, fehrest, jostojoo, ts) VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET onvan=excluded.onvan, fehrest=excluded.fehrest, jostojoo=excluded.jostojoo');
  let n = 0; const L = [];
  for (const x of (Array.isArray(items) ? items : [])){ const o = String(x && x.onvan || '').replace(/\s+/g, ' ').trim(); const u = String(x && x.url || '').trim(); if (!o || !/^https:\/\/(www\.)?cbi\.ir\//.test(u)) continue; const t = cbiTamiz(o); if (t.length < 6) continue; ins.run(u, o, String(x.fehrest || ''), t, ts()); n++; L.push(t); }
  const jadid = [...new Set(L)].filter(t => { const r = d.prepare('SELECT vaziat FROM hadaf WHERE onvan=?').get(t); return !r || r.vaziat !== 'yafte'; });
  if (jadid.length){ if (HD.dar){ HD.pas = [...new Set((HD.pas || []).concat(jadid))]; hdLog('بانک مرکزی: ' + fa(jadid.length) + ' عنوان در نوبت جست‌وجو'); } else hadafRun(jadid, 'cbi').catch(e => hdLog('بانک مرکزی: ' + e.message)); }
  return { ok: true, n, jadid: jadid.length };
}
function cbiDobare(){   /* عنوان‌ها دوباره با cbiTamiz پاک می‌شوند و یافت‌نشده‌ها دوباره جست‌وجو می‌شوند */
  const d = db(); if (!d) return { ok: false }; hadafJadval();
  const rs = d.prepare('SELECT url, onvan, fehrest FROM cbi_onvan').all();
  if (HD.dar){ HD.laghv = true; HD.pas = []; }
  return hadafCbi(rs);
}
/* ۱۴۰۵/۰۷/۰۳ کارفرما: «بقیه قوانینی که پیدا نشدن پیدا کن و وصل کن» — عنوان‌های یافت‌نشده (قوانین هدف و بانک مرکزی) با عنوان‌های خود کتابخانه (همهٔ منابع) سنجیده می‌شوند: نوشتار یکسان‌شده (بی فاصله، نیم‌فاصله و نشانه؛ ی/ک/همزه یکسان) برابر یا دربرگیرنده؛ آرای دادگاه‌ها، طرح و لایحه و مذاکرات کنار؛ اصلاحیه به‌جای قانون اصلی وصل نمی‌شود */
function vaslMahalli(){
  const d = db(); if (!d) return 'پایگاه باز نشد'; hadafJadval();
  const N = s => nrmMatn(String(s || '').replace(/\([^)]*\)/g, ' ').replace(/ — .*$/, ''));
  const KENAR = /^(رای|رأی|طرح|اظهارنظر|اظهار نظر|مشروح|گزارش|لایحه(?! قانونی))/;
  for (const h0 of d.prepare("SELECT onvan FROM hadaf WHERE urls LIKE '%(کتابخانه)%'").all()){   /* وصل نادرست به سرصفحهٔ بی‌متن (مثلاً آیین دادرسی کیفری در روزنامهٔ رسمی) کنار می‌رود؛ چیزی پاک نمی‌شود */
    const bad = d.prepare('SELECT h.url FROM hadaf_url h JOIN qanun q ON q.url=h.url WHERE h.onvan=? AND q.mavad = 0 AND q.hajm < 1500').all(h0.onvan);
    bad.forEach(b => d.prepare('UPDATE hadaf_url SET onvan=? WHERE url=?').run(h0.onvan + ' — وصل نادرست (سرصفحهٔ بی‌متن)', b.url));
    if (bad.length && !d.prepare('SELECT 1 FROM hadaf_url WHERE onvan=?').get(h0.onvan)) d.prepare("UPDATE hadaf SET vaziat='nayafte', urls='[]' WHERE onvan=?").run(h0.onvan);
  }
  const kol = d.prepare("SELECT url, onvan, tarikh, manba, mavad, hajm FROM qanun WHERE manba != 'ara'").all().filter(r => (r.mavad > 0 || r.hajm >= 1500) && !KENAR.test(nrmT(r.onvan))).map(r => Object.assign(r, { n: N(r.onvan), e: ESLAH_RE.test(nrmT(r.onvan)) })).filter(r => r.n.length >= 8);
  const H = d.prepare("SELECT onvan FROM hadaf WHERE vaziat='nayafte'").all();
  const insU = d.prepare('INSERT INTO hadaf_url(url, onvan, asli) VALUES(?,?,?) ON CONFLICT(url) DO NOTHING');
  const setH = d.prepare("UPDATE hadaf SET vaziat='yafte', urls=?, ts=? WHERE onvan=?");
  let y = 0; const out = [];
  for (const h of H){
    const t = N(h.onvan); if (t.length < 8) continue; const e = ESLAH_RE.test(nrmT(h.onvan));
    const K = kol.filter(r => e || !r.e);
    let mn = K.filter(r => r.n === t);
    if (!mn.length) mn = K.filter(r => r.n.includes(t) && t.length / r.n.length >= 0.6);
    if (!mn.length) mn = K.filter(r => t.includes(r.n) && r.n.length / t.length >= 0.75);
    if (!mn.length) continue;
    mn.sort((a, b) => a.n.length - b.n.length || String(b.tarikh || '').localeCompare(String(a.tarikh || '')));
    const best = mn.filter(r => r.n.length <= mn[0].n.length + 2).slice(0, 3);
    best.forEach(r => insU.run(r.url, h.onvan, 1));
    setH.run(JSON.stringify(best.map(r => r.onvan + ' (کتابخانه)')), ts(), h.onvan); y++; out.push('✅ ' + h.onvan + ' ← ' + best.map(r => r.onvan + (r.tarikh ? ' (' + r.tarikh + ')' : '')).join('؛ '));
  }
  hdLog('وصل از خود کتابخانه: ' + y + ' از ' + H.length);
  return 'وصل از خود کتابخانه: ' + fa(y) + ' از ' + fa(H.length) + ' عنوان یافت‌نشده\n' + out.join('\n');
}
function cbiMatn(){
  const d = db(); if (!d) return 'پایگاه باز نشد'; hadafJadval();
  const rs = d.prepare('SELECT c.fehrest, c.onvan, h.vaziat, h.urls FROM cbi_onvan c LEFT JOIN hadaf h ON h.onvan=c.jostojoo ORDER BY c.fehrest, c.rowid').all();
  if (!rs.length) return 'بانک مرکزی: هنوز عنوانی از فهرست‌های سایت نرسیده است';
  const g = {}; rs.forEach(r => (g[r.fehrest || '—'] = g[r.fehrest || '—'] || []).push(r));
  const y = rs.filter(r => r.vaziat === 'yafte').length, ny = rs.filter(r => r.vaziat === 'nayafte').length;
  return 'بانک مرکزی — عنوان از فهرست‌های سایت، متن از مجلس و روزنامهٔ رسمی (بی OCR، فقط کتابخانه): ' + fa(rs.length) + ' عنوان · یافته ' + fa(y) + ' · یافت‌نشده ' + fa(ny) + ' · در نوبت ' + fa(rs.length - y - ny) + (HD.dar ? '\nدر کار: ' + HD.gam : '') +
    '\n' + Object.entries(g).map(([f, a]) => '▪ ' + f + ' (' + fa(a.length) + ')\n' + a.map(r => (r.vaziat === 'yafte' ? '✅ ' : r.vaziat === 'nayafte' ? '❔ ' : '… ') + r.onvan + (r.vaziat === 'yafte' ? ' ← ' + JSON.parse(r.urls || '[]').join('؛ ') : r.vaziat === 'nayafte' ? ' — در مجلس و روزنامهٔ رسمی یافت نشد' : '')).join('\n')).join('\n');
}
/* ---------------------- یکتایی — ۱۴۰۵/۰۷/۰۲ دستور کارفرما: «فقط قانون تکراری وارد پایگاه دانش یا هر جایی نشود» ----------------------
   هر متن اثر انگشت «عادی‌شده» می‌گیرد (بی‌فاصله و نیم‌فاصله، ی و ک یکسان، بی‌اعراب). متنِ تکراری از هر منبع، یا قانونِ هم‌نام و هم‌تاریخ مجلس،
   به جدول «سطل تکراری‌ها» (satl_qanun) می‌رود — با همهٔ متن و تکه‌هایش، بی از بین رفتن — و از کتابخانه، نمایهٔ معنایی و پایگاه دانش بیرون می‌ماند. */
/* ---------------------- روزنامهٔ رسمی (rrk.ir) — ۱۴۰۵/۰۷/۰۲ ----------------------
   فهرست «قوانین و مقررات» روزنامهٔ رسمی جدول Oracle APEX است و پیوند هر متن با «کد کنترلی» همان نشست ساخته می‌شود؛
   پس نشست باز می‌شود، هر بار یک صفحهٔ ۲۰‌تایی از خود جدول (همان درخواست صفحه‌بندی مرورگر) گرفته و متن‌ها یکی‌یکی خوانده می‌شوند.
   کلید ماندگار هر متن: https://rrk.ir/#code=N · شمارهٔ صفحهٔ جاری در meta «rrk:page» · همهٔ متن‌ها از فیلتر یکتایی می‌گذرند. */
const RRK = { s: null, jar: {}, pending: [], kol: 0, khata: 0 };
function rrkReq(method, url, body, S){ const J = (S || RRK).jar; return new Promise(res0 => { const res = v => { try { hoshdarMizban(url, String(v.code).startsWith('err') ? 'net' : v.code); } catch(e){} res0(v); };
  const tls = require('tls'); let CA = [...tls.rootCertificates]; try { CA = CA.concat(tls.getCACertificates('system')); } catch(e){} try { CA = CA.concat(tls.getCACertificates('extra')); } catch(e){}   /* ۱۴۰۵/۰۷/۰۵ کیس دو: گواهی‌های میانی rrk.ir (ca-mizban.pem) */
  const u = new URL(url); const b = body ? Buffer.from(body, 'utf8') : null;
  const r = require('https').request({ method, hostname: u.hostname, path: u.pathname + u.search, ca: CA, timeout: 60000, headers: Object.assign({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128', 'accept-language': 'fa', cookie: Object.entries(J).map(([k, v]) => k + '=' + v).join('; ') }, b ? { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'content-length': b.length, 'x-requested-with': 'XMLHttpRequest' } : {}) }, s => {
    (s.headers['set-cookie'] || []).forEach(c => { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) J[kv.slice(0, i).trim()] = kv.slice(i + 1); });
    const c = []; s.on('data', x => c.push(x)); s.on('end', () => res({ code: s.statusCode, loc: s.headers.location, body: Buffer.concat(c).toString('utf8') })); });
  r.on('timeout', () => { r.destroy(); res({ code: 'timeout', body: '' }); }); r.on('error', e => res({ code: 'err ' + e.message, body: '' })); if (b) r.write(b); r.end(); }); }
const rrkUnesc = s => String(s || '').replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;?/g, ' ').replace(/&amp;/g, '&');
const rrkVal = (h, id) => ((new RegExp('value="([^"]*)"[^>]*id="' + id + '"').exec(h) || new RegExp('id="' + id + '"[^>]*value="([^"]*)"').exec(h) || [])[1] || '');
async function rrkNeshast(S){
  S = S || RRK; S.jar = {}; let r = await rrkReq('GET', 'https://rrk.ir/ords/r/rrs/rrs-front/ghavanin-moghararat', null, S); let hop = 0;
  while (r.loc && hop++ < 5) r = await rrkReq('GET', new URL(r.loc, 'https://rrk.ir').toString(), null, S);
  if (r.code !== 200) throw new Error('صفحهٔ قوانین روزنامهٔ رسمی: ' + r.code);
  const h = r.body; const ws = (/id="(R\d+)_worksheet_id"/.exec(h) || [])[1] || '';
  S.s = { inst: rrkVal(h, 'pInstance'), salt: rrkVal(h, 'pSalt'), prot: rrkUnesc(rrkVal(h, 'pPageItemsProtected')), ajax: ((/interactiveReport\(\{[\s\S]*?"ajaxIdentifier":"([^"]+)"/.exec(h) || [])[1] || '').split('\\u002F').join('/'),
    ws: rrkVal(h, ws + '_worksheet_id'), rep: rrkVal(h, ws + '_report_id'), t: Date.now() };
  if (!S.s.inst || !S.s.ajax || !S.s.ws) { S.s = null; throw new Error('ساختار صفحهٔ روزنامهٔ رسمی شناخته نشد'); }
}
function rrkSatrha(html){
  const out = []; for (const tr of String(html).split(/<tr[\s>]/).slice(1)){
    const m = /href="([^"]*p122_code(?:&#x3D;|=)(\d+)[^"]*)"/.exec(tr); if (!m) continue;
    const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => strip(rrkUnesc(x[1])));
    const onvan = rrkUnesc((/<span title="([^"]*)"/.exec(tr) || [])[1] || td[0] || '').replace(/\s+/g, ' ').trim();
    out.push({ code: m[2], link: rrkUnesc(m[1]), onvan, marja: td[1] || '', tarikh: (td[2] || '').replace(/[^\d\/]/g, ''), shomareR: td[3] || '', tarikhR: (td[4] || '').replace(/[^\d\/]/g, ''), vizhe: td[5] || '' });
  } return out;
}
async function rrkSafhe(p, onvan, S){
  S = S || RRK; if (!S.s || Date.now() - S.s.t > 20 * 60000) await rrkNeshast(S);
  const S0 = S.s; const items = ['P67_TREE_VALUE', 'P67_TITLE', 'P67_HCLAWAPPROVERCODE', 'P67_LAWCONTENT', 'P67_NO', 'P67_FROM_DATE', 'P67_TO_DATE'].map(n => ({ n, v: n === 'P67_TITLE' ? (onvan || '') : '' }));
  const f = { p_flow_id: '200', p_flow_step_id: '67', p_instance: S0.inst, p_debug: '', p_request: 'PLUGIN=' + S0.ajax, p_widget_name: 'worksheet', p_widget_mod: 'PULL', p_widget_action: 'PAGE', p_widget_action_mod: 'pgR_min_row=' + ((p - 1) * 20 + 1) + 'max_rows=20rows_fetched=20', x01: S0.ws, x02: S0.rep, p_json: JSON.stringify({ pageItems: { itemsToSubmit: items, protected: S0.prot, rowVersion: '' }, salt: S0.salt }) };
  const a = await rrkReq('POST', 'https://rrk.ir/ords/wwv_flow.ajax', Object.entries(f).map(([k, x]) => encodeURIComponent(k) + '=' + encodeURIComponent(x)).join('&'), S);
  if (a.code !== 200) { S.s = null; throw new Error('صفحه‌بندی روزنامهٔ رسمی: ' + a.code); }
  const kol = +(((/از\s*([\d,٬]+)/.exec(a.body) || [])[1] || '0').replace(/[,٬]/g, '')); if (kol && !onvan) { RRK.kol = kol; mset('rrk:kol', kol); }
  return rrkSatrha(a.body);
}
function rrkMande(){ try { const kol = +(mget('rrk:kol') || 0); const n = db().prepare("SELECT COUNT(*) c FROM saf WHERE manba='rrk' AND vaziat<>'dar_saf'").get().c; return Math.max(0, kol - n); } catch(e){ return 0; } }
async function rrkBegir(r, S){   /* یک متن روزنامهٔ رسمی: true = گرفته یا کنار رفت، null = نشست باطل */
  const d = db(); const key = 'https://rrk.ir/#code=' + r.code;
  d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)').run(key, 'rrk', 'rrk', olaviatLar('rrk'), 'dar_saf', ts());
    const m = await rrkReq('GET', 'https://rrk.ir' + r.link, null, S); R.akharinAt = Date.now();
    if (m.code !== 200 || /نقض حفاظت/.test(m.body)){ log('روزنامهٔ رسمی: نشست تازه لازم شد (' + m.code + ')'); return null; }
    const esc0 = rrkVal(m.body, 'P122_LAWCONTENT'); const badane = matnAzHtml(rrkUnesc(esc0).replace(/<img[^>]*>/gi, ''));
    if (badane.length < 20){ d.prepare("UPDATE saf SET vaziat='kenar', khata=?, ts=? WHERE url=?").run('بی‌متن', ts(), key); }
    else {
      const matn = r.onvan + (r.marja ? '\nمرجع تصویب: ' + r.marja : '') + (r.tarikh ? '\nتاریخ تصویب: ' + r.tarikh : '') + (r.shomareR ? '\nروزنامهٔ رسمی شمارهٔ ' + r.shomareR + (r.tarikhR ? ' مورخ ' + r.tarikhR : '') : '') + '\n\n' + badane;
      const h = sha(matn); const tk = tekkeha(matn);
      d.exec('BEGIN');
      try {
        const old = d.prepare('SELECT id FROM qanun WHERE url=?').get(key);
        if (old){ d.prepare('DELETE FROM tekke_fts WHERE rowid IN (SELECT id FROM tekke WHERE qid=?)').run(old.id); d.prepare('DELETE FROM tekke WHERE qid=?').run(old.id); noskheKohne(d, old.id, h); d.prepare('DELETE FROM qanun WHERE id=?').run(old.id); }
        const qid = d.prepare('INSERT INTO qanun(manba, shenase, url, onvan, marja, lar, tarikh, ablagh, shomare, meta, matn, sha256, hajm, mavad, ts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run('rrk', r.code, key, r.onvan, r.marja || 'روزنامهٔ رسمی', 'rrk', r.tarikh, r.tarikhR, r.shomareR, JSON.stringify({ vizhe: r.vizhe, tarikhR: r.tarikhR }), matn, h, matn.length, tk.filter(x => x.madde).length, ts()).lastInsertRowid;
        const it = d.prepare('INSERT INTO tekke(qid, shomare, madde, matn) VALUES(?,?,?,?)'); const ft = d.prepare('INSERT INTO tekke_fts(rowid, matn, onvan) VALUES(?,?,?)');
        tk.forEach((x, k) => { const tid = it.run(qid, k + 1, x.madde, x.matn).lastInsertRowid; ft.run(tid, x.matn, r.onvan + (x.madde ? ' ' + x.madde : '')); });
        d.prepare("UPDATE saf SET vaziat='gerefte', khata=NULL, ts=? WHERE url=?").run(ts(), key);
        d.exec('COMMIT');
      } catch(e){ d.exec('ROLLBACK'); throw e; }
      R.shomar.gerefte++; R.akharin = 'روزنامهٔ رسمی: ' + r.onvan;
    }
    return true;
}
/* قانون هدفی که در سامانهٔ مجلس نیست: جست‌وجوی عنوان در فهرست روزنامهٔ رسمی (حروف عربی ي/ك همان‌گونه که در پایگاه آن است) */
async function rrkHadaf(onvan, azad){
  const t = nrmT(String(onvan).replace(/ — .*$/, '')); const w = t.split(' ').filter(x => !IST_T.has(x)); if (!w.length) return null;
  const bh2 = s => String(s).replace(/[أإ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ی');
  const q = w.slice(-2).join(' ').replace(/ی/g, 'ي').replace(/ک/g, 'ك'); const hame = new Map();
  for (let p = 1; p <= 3; p++){ const rows = await rrkSafhe(p, q); await khab(R.fasele); rows.forEach(x => hame.set(x.code, x)); if (rows.length < 20) break; }
  await rrkSafhe(+(mget('rrk:page') || 1));   /* پالایهٔ عنوان در نشست پاک شود */
  const mn = [...hame.values()].map(x => Object.assign({}, x, { n: bh2(nrmT(x.onvan)) })).filter(x => (azad || /^(قانون|آیین نامه|لایحه)/.test(x.n)) && w.every(y => x.n.includes(bh2(y))) && !ZIR.test(x.n)).sort((a, b) => a.n.length - b.n.length);
  if (!mn.length) return null;
  const ok = await rrkBegir(mn[0]); if (!ok) return null;
  const key = 'https://rrk.ir/#code=' + mn[0].code; const q0 = db().prepare('SELECT hajm FROM qanun WHERE url=?').get(key);
  if (!q0 || q0.hajm < 1500){ hdLog('روزنامهٔ رسمی برای «' + onvan + '» فقط سرصفحه دارد (' + (q0 ? q0.hajm : 0) + ' نویسه)، نه متن کامل'); return null; }
  return { key, onvan: mn[0].onvan };
}
async function gamRrk(){
  if (!MANABE.rrk || !MANABE.rrk.amade || mget('rrk:tamam') === '1') return false;
  const d = db(); if (!d) return false;
  try {
    if (!RRK.pending.length){
      const p = +(mget('rrk:page') || 1); R.gam = 'فهرست روزنامهٔ رسمی صفحهٔ ' + p;
      const rows = await rrkSafhe(p); R.akharinAt = Date.now();
      if (!rows.length){ if (RRK.kol && (p - 1) * 20 >= RRK.kol){ mset('rrk:tamam', '1'); log('فهرست روزنامهٔ رسمی تمام شد'); } else { RRK.s = null; } return true; }
      const hast = d.prepare("SELECT vaziat FROM saf WHERE url=?"); const ins = d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)');
      for (const r of rows){ const key = 'https://rrk.ir/#code=' + r.code; const h = hast.get(key); if (h && h.vaziat !== 'dar_saf') continue; ins.run(key, 'rrk', 'rrk', olaviatLar('rrk'), 'dar_saf', ts()); RRK.pending.push(r); }
      RRK.page = p; if (!RRK.pending.length) mset('rrk:page', p + 1);
      return true;
    }
    const r = RRK.pending.shift(); const key = 'https://rrk.ir/#code=' + r.code; R.gam = 'دریافت روزنامهٔ رسمی ' + r.code;
    const ok = await rrkBegir(r); if (ok === null){ RRK.s = null; RRK.pending = []; RRK.khata++; return true; }
    if (!RRK.pending.length) mset('rrk:page', (RRK.page || +(mget('rrk:page') || 1)) + 1);
    return true;
  } catch(e){ RRK.s = null; RRK.khata++; log('روزنامهٔ رسمی: ' + e.message); return false; }
}

const YK = { amade: false, n: 0 };
const nrmMatn = s => String(s || '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ی').replace(/[\u064b-\u0655\u0670\u0640]/g, '').replace(/[۰-۹]/g, c => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(c)]).replace(/[٠-٩]/g, c => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(c)]).replace(/[\s\u200c\u200e\u200f.,،؛:;!?؟«»"'()\[\]{}\-–—_\/\\*]+/g, '');
function yektaJadval(){
  const d = db(); if (!d) return false; if (YK.amade) return true;
  const cols = d.prepare('PRAGMA table_info(qanun)').all().map(c => c.name);
  if (!cols.includes('sha_n')) d.exec('ALTER TABLE qanun ADD COLUMN sha_n TEXT');
  if (!cols.includes('kelid')) d.exec('ALTER TABLE qanun ADD COLUMN kelid TEXT');
  d.exec('CREATE INDEX IF NOT EXISTS qanun_sha_n ON qanun(sha_n); CREATE INDEX IF NOT EXISTS qanun_kelid ON qanun(kelid); CREATE TABLE IF NOT EXISTS satl_qanun(id INTEGER, manba TEXT, url TEXT, onvan TEXT, tekrari_az TEXT, dalil TEXT, radif TEXT, tekkeha TEXT, ts TEXT);');
  YK.amade = true; return true;
}
function yekta(){
  try {
    const d = db(); if (!d || !yektaJadval()) return; hadafJadval();
    /* نسخهٔ ۲ (۱۴۰۵/۰۷/۰۲): قاعدهٔ «هم‌نام و هم‌تاریخ» چند نظریهٔ متفاوت با عنوان یکسان را هم کنار زده بود — آن‌ها برگردانده می‌شوند؛
       عادی‌سازی متن کامل‌تر شد (رقم، نشانه‌ها، همزه) و همه با قاعدهٔ تازه دوباره سنجیده می‌شوند */
    if (mget('yekta_v2') !== '1'){ const nb = bazgardan(); d.exec('UPDATE qanun SET sha_n=NULL, kelid=NULL'); mset('yekta_v2', '1'); log('یکتایی نسخهٔ ۲: ' + nb + ' متنِ به‌اشتباه کنار رفته برگشت؛ سنجش دوباره آغاز شد'); }
    const rows = d.prepare('SELECT id, manba, url, onvan, tarikh, matn FROM qanun WHERE sha_n IS NULL ORDER BY id LIMIT 800').all();
    const yabHame = d.prepare('SELECT id, url, sha_n, length(matn) ln FROM qanun WHERE id<>? AND sha_n IS NOT NULL AND (sha_n=? OR (? IS NOT NULL AND kelid=?)) ORDER BY id LIMIT 20');
    /* تکراری: متن عادی‌شدهٔ یکسان؛ یا هم‌نام و هم‌تاریخ با اندازهٔ تقریباً برابر (دست‌کم ۹۷٪) */
    const yab = { get: (id, sn, kl, kl2, ln) => yabHame.all(id, sn, kl, kl2).find(x => x.sha_n === sn || (ln && x.ln && Math.min(ln, x.ln) / Math.max(ln, x.ln) >= 0.97)) || null };
    const set = d.prepare('UPDATE qanun SET sha_n=?, kelid=? WHERE id=?');
    for (const r of rows){
      const sn = sha(nrmMatn(r.matn)); const kl = (r.manba === 'majlis' && r.tarikh) ? nrmT(r.onvan) + '|' + r.tarikh : null;
      const dup = yab.get(r.id, sn, kl, kl, (r.matn || '').length);
      if (!dup){ set.run(sn, kl, r.id); continue; }
      const dalil = dup.sha_n === sn ? 'متن یکسان' : 'هم‌نام و هم‌تاریخ';
      let h = null;
      d.exec('BEGIN');
      try {
        const radif = d.prepare('SELECT * FROM qanun WHERE id=?').get(r.id); const tk = d.prepare('SELECT shomare, madde, matn FROM tekke WHERE qid=? ORDER BY shomare').all(r.id);
        d.prepare('INSERT INTO satl_qanun(id, manba, url, onvan, tekrari_az, dalil, radif, tekkeha, ts) VALUES(?,?,?,?,?,?,?,?,?)').run(r.id, r.manba, r.url, r.onvan, dup.url, dalil, JSON.stringify(radif), JSON.stringify(tk), ts());
        d.prepare('DELETE FROM tekke_fts WHERE rowid IN (SELECT id FROM tekke WHERE qid=?)').run(r.id); d.prepare('DELETE FROM tekke WHERE qid=?').run(r.id); d.prepare('DELETE FROM qanun WHERE id=?').run(r.id);
        d.prepare("UPDATE saf SET vaziat='tekrari', khata=?, ts=? WHERE url=?").run('تکراریِ ' + dup.url, ts(), r.url);
        h = d.prepare('SELECT onvan, asli, danesh FROM hadaf_url WHERE url=?').get(r.url);
        if (h){ d.prepare('INSERT INTO hadaf_url(url, onvan, asli) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET asli=MAX(asli, excluded.asli)').run(dup.url, h.onvan, h.asli); d.prepare('DELETE FROM hadaf_url WHERE url=?').run(r.url); }
        d.exec('COMMIT');
      } catch(e){ d.exec('ROLLBACK'); throw e; }
      YK.n++; log('تکراری کنار رفت (' + dalil + '): ' + r.onvan + ' ← همان ' + dup.url);
      if (h && h.danesh){ try { require('./danesh.js').bebarSatl(r.url, 'تکراریِ ' + dup.url); } catch(e){} }
    }
  } catch(e){ log('یکتایی: ' + e.message); }
}
/* برگرداندن متن‌هایی که با قاعدهٔ «هم‌نام و هم‌تاریخ» کنار رفته بودند ولی اندازه‌شان با متن ماندگار فرق دارد (یعنی سند دیگری‌اند) */
function bazgardan(){
  const d = db(); if (!d) return 0; let n = 0;
  const cs = d.prepare('PRAGMA table_info(satl_qanun)').all().map(c => c.name); if (!cs.includes('bazgasht')) d.exec('ALTER TABLE satl_qanun ADD COLUMN bazgasht TEXT');
  const rows = d.prepare("SELECT rowid rid, id, url, radif, tekkeha, tekrari_az FROM satl_qanun WHERE dalil='هم‌نام و هم‌تاریخ' AND bazgasht IS NULL").all();
  for (const s of rows){
    let q, tk; try { q = JSON.parse(s.radif); tk = JSON.parse(s.tekkeha || '[]'); } catch(e){ continue; }
    const k = d.prepare('SELECT length(matn) ln FROM qanun WHERE url=?').get(s.tekrari_az); const a1 = (q.matn || '').length, a2 = k ? k.ln : 0;
    if (a2 && Math.min(a1, a2) / Math.max(a1, a2) >= 0.97) continue;
    if (d.prepare('SELECT 1 FROM qanun WHERE url=? OR id=?').get(q.url, q.id)){ d.prepare('UPDATE satl_qanun SET bazgasht=? WHERE rowid=?').run(ts(), s.rid); continue; }
    d.exec('BEGIN');
    try {
      const keys = Object.keys(q).filter(x => x !== 'sha_n' && x !== 'kelid');
      d.prepare('INSERT INTO qanun(' + keys.join(', ') + ') VALUES(' + keys.map(() => '?').join(', ') + ')').run(...keys.map(x => q[x]));
      const it = d.prepare('INSERT INTO tekke(qid, shomare, madde, matn) VALUES(?,?,?,?)'); const ft = d.prepare('INSERT INTO tekke_fts(rowid, matn, onvan) VALUES(?,?,?)');
      tk.forEach(x => { const tid = it.run(q.id, x.shomare, x.madde, x.matn).lastInsertRowid; ft.run(tid, x.matn, q.onvan + (x.madde ? ' ' + x.madde : '')); });
      d.prepare("UPDATE saf SET vaziat='gerefte', khata=NULL, ts=? WHERE url=?").run(ts(), q.url);
      d.prepare('UPDATE satl_qanun SET bazgasht=? WHERE rowid=?').run(ts(), s.rid);
      d.exec('COMMIT'); n++;
    } catch(e){ d.exec('ROLLBACK'); log('برگرداندن ' + q.url + ': ' + e.message); }
  }
  return n;
}
function tekrariKol(){ try { return db().prepare('SELECT COUNT(*) c FROM satl_qanun WHERE bazgasht IS NULL').get().c; } catch(e){ try { return db().prepare('SELECT COUNT(*) c FROM satl_qanun').get().c; } catch(e2){ return 0; } } }

function stopAll(){ if (HD.timer) clearInterval(HD.timer); R.on = false; if (R.timer) clearTimeout(R.timer); G2.timers.forEach(t => clearTimeout(t)); if (ML.timer) clearTimeout(ML.timer); if (MC.timer) clearTimeout(MC.timer); mcStop(); }

const TOOLS = [{
  name: 'ketabkhane', title: 'کتابخانهٔ حقوقی',
  description: 'کتابخانهٔ حقوقی معتبر: متن رسمی قوانین و مقررات ایران، کلمه‌به‌کلمه از منبع رسمی (اکنون: مرکز پژوهش‌های مجلس rc.majlis.ir)، با شناسه، تاریخ و مرجع تصویب، نشانی و اثر انگشت؛ تکه‌بندی به تفکیک ماده؛ هرگز ویکی‌پدیا. amal=vaziat · amal=shoroo (manabe = فهرست منابع [majlis…]، daste = فهرست دسته‌ها یا کدهای lar) · amal=beroz (فقط تازه‌ها) · amal=ist · amal=gozaresh · amal=jostojoo با q و had (واژه‌ای + معنایی) · amal=matn با shenase یا url یا onvan (متن کامل، offset/limit) · amal=fehrest با q/limit/offset · amal=namaye (ساخت نمایهٔ معنایی با BGE-M3). هیچ‌چیز خودبه‌خود آغاز نمی‌شود؛ فقط به دستور کارفرما.',
  inputSchema: { type: 'object', properties: { amal: { type: 'string' }, taeed: { type: 'string' }, onvanha: { type: 'array', items: { type: 'string' } }, manabe: { type: 'array', items: { type: 'string' } }, daste: { type: 'array', items: { type: 'string' } }, q: { type: 'string' }, had: { type: 'number' }, shenase: { type: 'string' }, url: { type: 'string' }, onvan: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['amal'], additionalProperties: false },
  async run(a){
    a = a || {}; const amal = String(a.amal || 'vaziat');
    if (amal === 'vaziat') return S.ok(statusLine());
    if (amal === 'shoroo') return S.ok(shoroo(a, 'kamel'));
    if (amal === 'beroz') return S.ok(shoroo(a, 'beroz'));
    if (amal === 'ist') return S.ok(ist());
    if (amal === 'gozaresh') return S.ok(gozaresh());
    if (amal === 'jostojoo'){ if (!a.q) return S.fail('q لازم است'); return S.ok(matnNatayej(await jostojoo(a.q, a.had))); }
    if (amal === 'matn') return matnQanun(a);
    if (amal === 'fehrest') return fehrest(a);
    if (amal === 'hadaf_url'){   /* ۱۴۰۵/۰۷/۰۲: قانون هدف با شناسهٔ سامانهٔ مجلس (onvan + shenase = شناسه‌ها با ویرگول) */
      const on = String(a.onvan || '').trim(); const ids = String(a.shenase || '').split(/[,\s،]+/).filter(x => /^\d+$/.test(x));
      if (!on || !ids.length) return S.fail('onvan و shenase (شناسه‌های سامانهٔ مجلس، جدا با ویرگول) لازم است');
      hadafJadval(); const d = db();
      ids.forEach(id => { const u = MJ.showUrl(id); d.prepare('INSERT OR IGNORE INTO saf(url, manba, lar, olaviat, vaziat, ts) VALUES(?,?,?,?,?,?)').run(u, 'majlis', 'lar2', 100, 'dar_saf', ts()); d.prepare("UPDATE saf SET olaviat=MAX(olaviat, 100) WHERE url=? AND vaziat='dar_saf'").run(u); d.prepare('INSERT INTO hadaf_url(url, onvan, asli) VALUES(?,?,1) ON CONFLICT(url) DO UPDATE SET asli=1, onvan=excluded.onvan').run(u, on); });
      d.prepare('INSERT INTO hadaf(onvan, vaziat, urls, ts) VALUES(?,?,?,?) ON CONFLICT(onvan) DO UPDATE SET vaziat=excluded.vaziat, urls=excluded.urls, ts=excluded.ts').run(on, 'yafte', JSON.stringify(ids.map(i => 'شناسهٔ ' + i)), ts());
      hdLog('قانون هدف «' + on + '» با شناسهٔ ' + ids.join('، ') + ' به صف رفت');
      return S.ok('«' + on + '» با ' + fa(ids.length) + ' شناسه با بالاترین اولویت به صف رفت؛ پس از گرفتن، نمایه و به پایگاه دانش فرستاده می‌شود.');
    }
    if (amal === 'cbi') return S.ok(cbiMatn());
    if (amal === 'qavanin_niaz') return S.ok(qavaninNiaz());
    if (amal === 'qavanin_klip') return S.ok(qvKlip(a.q === 'khamush'));
    if (amal === 'vasl') return S.ok(vaslMahalli());
    if (amal === 'tarikhche'){ if (!a.onvan && !a.q) return S.fail('onvan (نام قانون) لازم است'); return S.ok(tarikhcheMatn(a.onvan || a.q)); }
    if (amal === 'cbi_dobare'){ const x = cbiDobare(); return S.ok('بانک مرکزی: ' + fa(x.n || 0) + ' عنوان پاک‌سازی شد؛ ' + fa(x.jadid || 0) + ' عنوان (یافت‌نشده یا در نوبت) دوباره جست‌وجو می‌شود'); }
    if (amal === 'hadaf'){ if (typeof a.onvanha === 'string'){ try { a.onvanha = JSON.parse(a.onvanha); } catch(e){ a.onvanha = a.onvanha.split(/\n|،|;/); } } const L = (Array.isArray(a.onvanha) ? a.onvanha : []).map(x => String(x).trim()).filter(Boolean); if (!L.length) return S.ok(hadafMatn()); if (HD.dar) return S.ok('جست‌وجوی قوانین هدف در کار است\n' + hadafMatn()); hadafRun(L).catch(e => hdLog('قوانین هدف: ' + e.message)); return S.ok((R.on ? '' : '⚠ گردآوری خاموش است؛ برای گرفتن متن‌ها shoroo لازم است.\n') + fa(L.length) + ' عنوان در سامانهٔ مجلس جست‌وجو می‌شود و با بالاترین اولویت گرفته و نمایه می‌شود. پیشرفت: amal=hadaf بی onvanha'); }
    if (amal === 'sefr'){ if (String(a.taeed || '') !== 'صفر شود') return S.fail('برای صفر کردن کامل، taeed=«صفر شود» لازم است'); return S.ok(await sefr()); }
    if (amal === 'tekke_dobare'){ const n = tekkeDobare(); return S.ok('تکه‌بندی دوباره: ' + fa(n) + ' تکه از ' + fa(amar().mavad) + ' قانون (نمایهٔ معنایی باید دوباره ساخته شود)'); }
    if (amal === 'namaye'){ let n = 0, t = 0; const t0 = Date.now(); while (Date.now() - t0 < 40000){ n = await gamNamaye(16); if (!n) break; t += n; } return S.ok('نمایهٔ معنایی: ' + fa(t) + ' تکه در این نوبت' + (n ? ' (ادامه دارد؛ دوباره بزنید یا shoroo)' : ' — کامل') + '\n' + statusLine()); }
    return S.fail('amal ناشناخته: ' + amal + ' (vaziat, shoroo, beroz, ist, gozaresh, jostojoo, matn, fehrest, namaye)');
  }
}];

module.exports = { NASKHE, rrkTest: { rrkSatrha, rrkUnesc, rrkVal, matnAzHtml }, init, state, gozareshJson, hadafJson, hadafCbi, cbiMatn, qavaninFehrest, qavaninKar, qavaninMatn, akharinEslah, tarikhcheMatn, hast, statusLine, jostojoo, matnNatayej, stopAll, TOOLS, MANABE, DASTE, _test: { gamDaryaftAra, gamDaryaftDotic, tekkehaRay, tekkeha, sarha, madeDagigh, MJ, matnAzHtml, strip, sarMadde, vazheBeAdad } };
