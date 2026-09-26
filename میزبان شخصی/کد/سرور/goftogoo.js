/* =====================================================================
   فهم منظور و نگهبان گفتگوی «میزبان شخصی» — ۱۴۰۵/۰۷/۰۵
   دستور کار: «درمان گفتگوی میزبان شخصی» (محمدعلی کریمی‌پور، ۱۴۰۵/۰۷/۰۴)
   ---------------------------------------------------------------------
   · مسیریاب قاعده‌ای (بی‌هزینه) + مسیریاب مدلی با JSON schema برای پیام‌های نامطمئن.
   · بازنویسی پرسش با واژه‌نامهٔ محاوره ← حقوقی و زمینهٔ پیام‌های پیشین.
   · کوتاه‌کردن تاریخچه، دستورالعمل کوتاه ویژهٔ هر قصد، تنظیم نمونه‌گیری.
   · نگهبان: ضدتکرار (shingle سه‌واژه‌ای)، تشخیص «در منابع نیست»ِ نابه‌جا، ثبت ارزیابی.
   این پرونده هیچ وابستگی به مدل یا شبکه ندارد (فراخوان مدل تزریق می‌شود) تا آزمون واحد بی مدل اجرا شود.
   ===================================================================== */
'use strict';
const fs = require('fs'), path = require('path');

const QASD = {
  goftogoo: 'گفتگو', porsesh_hoghooghi: 'پرسش_حقوقی', matn_madde: 'متن_ماده', matn_qanun: 'متن_قانون',
  fehrest: 'فهرست_کتابخانه', asnad: 'اسناد_پرونده', vaziat: 'وضعیت_سیستم', edame: 'ادامهٔ_پیام_قبل', namafhoom: 'نامفهوم'
};
const QASDHA = Object.keys(QASD);

/* ---------------------- یکسان‌سازی متن ---------------------- */
const RAGHAM_FA = '۰۱۲۳۴۵۶۷۸۹', RAGHAM_AR = '٠١٢٣٤٥٦٧٨٩';
function norm(s){
  return String(s || '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإ]/g, 'ا').replace(/ؤ/g, 'و')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[۰-۹]/g, c => String(RAGHAM_FA.indexOf(c))).replace(/[٠-٩]/g, c => String(RAGHAM_AR.indexOf(c)))
    .replace(/[‌‍‎‏﻿]/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}
function kalamat(s){ const n = norm(s); return n ? n.split(' ') : []; }
function faRagham(s){ return String(s).replace(/\d/g, d => RAGHAM_FA[d]); }

/* ---------------------- واژه‌نامهٔ محاوره ← حقوقی ---------------------- */
const PASVAND = '(?:ه|ی|م|ت|ش|مو|تو|شو|ها|های|ام|ای|اش|مون|تون|شون|یم|ید|ند|ن)?';
const GORUH_ZAIF = /عمومی/;   /* مدخل‌های عمومی (پول، خونه، بچه، مهلت…) به‌تنهایی نشانهٔ پرسش حقوقی نیستند */
function saktRegex(form){
  const w = kalamat(form); if (!w.length) return null;
  const parts = w.map((x, i) => {
    const e = x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (w.length > 1 ? x.length >= 2 : x.length >= 3) ? e + PASVAND : e;
  });
  return new RegExp('(?:^| )' + parts.join(' ') + '(?= |$)', 'u');
}
function amadeKardanVazhename(json){
  const madkhal = (json && Array.isArray(json.madkhal) ? json.madkhal : []).map(m => ({
    goruh: String(m.goruh || ''), zaif: GORUH_ZAIF.test(String(m.goruh || '')),
    mohavere: (m.mohavere || []).map(String).filter(Boolean),
    hoghooghi: (m.hoghooghi || []).map(String).filter(Boolean),
    qanunha: (m.qanunha || []).map(String).filter(Boolean),
  })).filter(m => m.mohavere.length);
  const olgoo = [];
  madkhal.forEach((m, i) => m.mohavere.forEach(f => { const re = saktRegex(f); if (re) olgoo.push({ re, f: norm(f), i, n: kalamat(f).length }); }));
  olgoo.sort((a, b) => b.f.length - a.f.length);   /* بلندترین عبارت اول */
  return { madkhal, olgoo, n: madkhal.length };
}
const VN = { file: '', mtime: 0, v: null };
function barVazhename(file){
  file = file || VN.file;
  try {
    const st = fs.statSync(file);
    if (VN.v && VN.file === file && VN.mtime === st.mtimeMs) return VN.v;
    const v = amadeKardanVazhename(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')));
    Object.assign(VN, { file, mtime: st.mtimeMs, v });
    return v;
  } catch(e){ return VN.v || amadeKardanVazhename(null); }
}
/* قانون‌های محتمل به ترتیب شمار مدخل‌هایی که به آن‌ها اشاره دارند (سپس ترتیب پیدایش) */
function rotbeQanun(hits){
  const n = new Map(); let k = 0;
  for (const h of hits) for (const q of h.qanunha){ const x = n.get(q) || { c: 0, i: k++ }; x.c++; n.set(q, x); }
  return [...n.entries()].sort((a, b) => (b[1].c - a[1].c) || (a[1].i - b[1].i)).map(e => e[0]);
}
/* پیام را با واژه‌نامه می‌سنجد: کدام عبارت محاوره‌ای آمده و چه اصطلاح حقوقی و قانونی به پرسش افزوده می‌شود */
function tatbigh(q, vn){
  vn = vn || barVazhename();
  const t = norm(q); const hits = []; const seen = new Set(); const pooshide = [];
  for (const o of vn.olgoo){
    if (seen.has(o.i)) continue;
    const m = o.re.exec(t); if (!m) continue;
    const s = m.index + (m[0].startsWith(' ') ? 1 : 0), e = m.index + m[0].length;
    if (pooshide.some(([a, b]) => s >= a && e <= b)) continue;   /* درون عبارت بلندتری که پیش‌تر یافته شده */
    seen.add(o.i); pooshide.push([s, e]);
    const md = vn.madkhal[o.i];
    hits.push({ form: t.slice(s, e), hoghooghi: md.hoghooghi, qanunha: md.qanunha, zaif: md.zaif });
  }
  const yekta = a => [...new Set(a)];
  const qavi = hits.filter(h => !h.zaif);
  return {
    hits, qavi: qavi.length,
    hoghooghi: yekta(hits.flatMap(h => h.hoghooghi)),
    qanunha: rotbeQanun(qavi.length ? qavi : hits),
    pooshide: pooshide.map(([a, b]) => t.slice(a, b)),
  };
}

/* ---------------------- واژه‌های بی‌ارزش (محاوره و رسمی) ---------------------- */
const IST = new Set(('اگه اگر یکی یه یک چیکار چکار چی چیه چیست چه باید بکنم کنم بکنیم کنیم میشه می شه میشود چطوری چطور چگونه من منو مرا ما تو شما اون او این اینو اونو که را رو و یا با به از در برای برام برامون تا هم هنوز الان حالا خب خوب لطفا میخوام میخواهم میخوام دارم داره داریم دارین هست است هستش نیست بود بوده شده شد شدم میکنه میکنن کرده کرد کردم کنه کنید بکن بگو بگید بنویس بیار بیاور بده بدید توضیح ساده کامل متن ماده قانون اصل دیگه دیگر ولی اما چون وقتی اگرچه آیا ایا یعنی بعد قبل پس سر روی زیر پیش کی کجا کدوم کدام چند چقدر چرا همه همون همین باشه باشد بشه بشود میتونم میتونه میتوانم نمیدونم بدونم بفهمم ازش بهش باهاش براش طرف طرفم بابت مورد درباره دربارهٔ راجع خیلی زیاد کم چیزی کاری یک دو سه').split(' '));

/* ---------------------- نشانه‌های قصد ---------------------- */
const RE = {
  madde: /(?:^| )(ماده|مواد|اصل|تبصره)\s*(\d+)/,
  vaziatMozoo: /(^| )(سرور|سرورها|سیستم|سامانه|گره دوم|کیس|کیس یک|کیس دو|کتابخانه|کتابخونه|پردازنده|رم|کارت گرافیک|میزبان)( |$)|^مدل( |$)|(^| )مدل (گفتگو|زبانی|میزبان)( |$)|(^| )و مدل( |$)/,
  vaziatFel: /(^| )(سلامت|سلامتی|وضعیت|وضعیتش|وضع|بسنج|بسنجید|سنجش|چک کن|مشکل|مشکلی|روشن|روشنه|خاموش|خاموشه|کار میکنه|کار می کند|کار میکند|چطوره|آماده|آمادست|خرابه|خراب|بالاست|پایینه)( |$)/,
  fehrestA: /(^| )(همه|کل|کلیه|تمام|تمامی|فهرست|لیست|چه|کدام|کدوم|چند|چندتا|چه نوع)( |$)/,
  fehrestB: /(قوانین|قانونها|قانون ها|قوانینی|قانونی|قانون|ماده ها|مادههای|ماده های|مواد|متون|متن ها|متنها|مقررات|مصوبات|دسته|دسته ها)/,
  fehrestC: /(کتابخانه|کتابخونه|منابع|منبع|موجود|داریم|دارین|داری|هست|هستن|وجود داره|وجود دارد|تقسیم|دسته|ایران|کشور)/,
  fehrestDaste: /(تقسیم|دسته|دسته بندی|طبقه بندی|انواع)/,
  fehrestHame: /(^| )(همه|کل|کلیه|تمام|تمامی)( |$)/,
  fehrestShomar: /(چند تا|چندتا|چند|تعداد|شمار)/,
  fehrestSafhe: /(فهرست|لیست|صفحه|بیار|بیاور|نشون بده|نشان بده|بنویس)/,
  matn: /(^| )(متن|متنش|متنشو|متنشرو|متنش رو|کل متن|متن کامل|همه مواد|تمام مواد|کل مواد|مواد)( |$)/,
  asnad: /(اسناد پرونده|اسناد خوانده|تو اسناد|در اسناد|از اسناد|توی اسناد|سندهای ما|مدارک پرونده|پرونده ما|پرونده های ما|تو پرونده|در پرونده|توی پرونده|از پرونده|فایلها|فایل ها|تو فایل|در فایل)/,
  salam: /^(سلام|درود|سلام علیکم|علیک سلام|های|هلو|صبح بخیر|صبح به خیر|ظهر بخیر|عصر بخیر|شب بخیر|شب به خیر|وقت بخیر|وقت به خیر|خوبی|خوبین|خوبید|چطوری|چطورین|حالت چطوره|حالتون چطوره|چه خبر|خسته نباشی|خسته نباشید|مرسی|ممنون|ممنونم|متشکرم|سپاس|دمت گرم|دستت درد نکنه|عالی بود|خیلی خوب بود|خداحافظ|خدانگهدار|بای|باشه|اوکی|ok|آره|اره|نه|بله|خیر|حتما|آفرین|عالیه|خوبه)( (سلام|خوبی|مرسی|ممنون|عالی بود|خیلی|جان|عزیز|دوست من|میزبان|چطوری|ممنونم|بود|هست|نه|آره|حتما))*$/,
  hes: /(خسته|خستم|خسته ام|حالم|ناراحت|خوشحال|حوصله|بی حوصله|دلم|غمگین|استرس|نگران|عصبانی|سرحال|مریضم|خوابم میاد)/,
  meta: /(یه سوال دارم|یک سوال دارم|یه سؤال دارم|یک سؤال دارم|سوال دارم|سؤال دارم|کمکم کن|کمکم میکنی|میتونی کمکم کنی|تو کی هستی|کی هستی|اسمت چیه|چیکار میتونی بکنی|چه کارهایی بلدی|چی بلدی|میشه باهات حرف بزنم|حرف بزنیم|گپ بزنیم)/,
  eshare: /(^| )(اونو|اون|اونا|همون|همین|اینو|این که|اینکه|که گفتی|گفتی|نوشتی|قبلی|قبلیه|قبلیو|بالا|بالایی|ادامه|ادامش|ادامشو|بیشتر|ساده تر|سادهتر|کامل تر|کاملتر|دوباره|منظورم|بررسی کن|بررسیش کن|مثال|مثلا|خلاصش|خلاصه اش|توضیح بده|توضیح بدید|یعنی چی|چی شد|خب|خوب حالا|پس)( |$)/,
  agarChi: /^(اگه|اگر|حالا اگه|حالا اگر|و اگه|و اگر|خب اگه|خب اگر)( .+)? (چی|چه|چی میشه|چه میشه|چیکار کنم|چکار کنم)$/,
  hoghooghiVazhe: /(قانون|قوانین|تبصره|حقوقی|کیفری|دادگاه|دادسرا|شکایت|شاکی|وکیل|وکالت|مجازات|جرم|دعوا|دادخواست|قاضی|محکوم|متهم|قرارداد|سند|ارث|طلاق|مهریه|چک|سفته|اجرائیه|اجراییه|ابلاغیه|رأی|رای دادگاه|حکم)/,
};

/* نام قانون از متن: از واژهٔ «قانون» تا نخستین واژهٔ پایانی */
const PAYAN_NAM = new Set('متن متنش متنشو را رو برام برای بنویس بیار بیاور بده چی چیه میگه میگوید میگن کامل کل و که در از تا به ماده مواد اصل تبصره توضیح ساده هست است هستن درباره دربارهٔ کنید کن بگو بگید تو داریم دارین داره چند چه کدام کدوم می نمی گوید میگوید گفته آمده مقرر دارد شده میشه باید'.split(' '));
function namQanun(q){
  const w = kalamat(q); const i = w.findIndex(x => x === 'قانون' || x === 'لایحه'); if (i < 0) return '';
  const out = [w[i]];
  for (let k = i + 1; k < w.length && out.length < 10; k++){ if (PAYAN_NAM.has(w[k]) || /^\d+$/.test(w[k]) && out.length > 1 && !/^1[234]\d\d$/.test(w[k])) break; out.push(w[k]); }
  if (out.length < 2) return '';
  if (/^(ها|های|هاي|ی|ای|رو|را)$/.test(out[1]) || IST.has(out[1])) return '';
  return out.join(' ');
}
/* مادهٔ یادشده در یک متن (مثلاً پاسخ پیشین دستیار): «ماده ۳ قانون صدور چک» */
function maddeAzMatn(text){
  /* نام قانون از جملهٔ خودش بیرون نمی‌رود: متن خام پیش از یکسان‌سازی در نشانه‌های نگارشی بریده می‌شود */
  const bakhsh = String(text || '').split(/[،,.؛;:\n()«»!؟?\[\]]+/); let aval = null;
  for (const b of bakhsh){
    const t = norm(b); const re = /(?:^| )(ماده|اصل)\s*(\d+)/g; let m;
    while ((m = re.exec(t))){
      const baad = t.slice(m.index + m[0].length).replace(/^\s*(از|ی)\s+/, ' ');
      const nam = namQanun(baad);
      const r = { noe: m[1], shomare: +m[2], qanun: nam || (m[1] === 'اصل' ? 'قانون اساسی' : '') };
      if (!aval) aval = r;
      if (r.qanun) return r;
    }
  }
  if (aval && !aval.qanun){ const nam = namQanun(String(text || '').split(/[،,.؛;:\n]/).find(x => /قانون/.test(x)) || ''); if (nam) aval.qanun = nam; }
  return aval;
}
/* نام دسته‌های کتابخانه (همان NAM_DASTE گره دوم) برای «دستهٔ X را صفحه‌به‌صفحه بیاور» */
const DASTEHA = [
  ['lar2', /(قوانین مجلس|مصوبات مجلس|قوانین مصوب مجلس)/], ['lar8', /(هیئت وزیران|هیات وزیران|تصویب نامه|آیین نامه ها)/],
  ['lar6', /(وحدت رویه دیوان عالی|دیوان عالی)/], ['lar7', /(دیوان عدالت اداری)/], ['lar1', /(قانون اساسی و سیاست|سیاست های کلی|سیاستهای کلی)/],
  ['lar3', /(شورای انقلاب)/], ['lar4', /(مجمع تشخیص)/], ['lar9', /(قوه قضاییه|قوه قضائیه)/], ['lar18', /(شورای نگهبان)/],
  ['lar20', /(شورای پول)/], ['ara_ray', /(آرای دادگاه|آرا دادگاه|رای های دادگاه|رأی های دادگاه|آرای قضایی)/], ['rrk', /(روزنامه رسمی)/],
  ['ssaa', /(ثبتی|سازمان ثبت|بخشنامه های ثبت)/], ['qavanin', /(سامانه ملی قوانین|قوانین و مقررات سامانه)/], ['dotic', /(dotic|پایگاه ملی اطلاع رسانی)/],
];
function dasteAzMatn(t){ const n = norm(t); for (const [lar, re] of DASTEHA) if (re.test(n)) return lar; return ''; }
/* برچسب‌های ادامهٔ صفحه‌بندی در پاسخ دستیار: 〔فهرست lar2 از 50〕 و 〔متن 1234 از 30〕 */
function barchasbSafhe(text){
  const s = String(text || '');
  let m = /〔فهرست ([\w]+) از (\d+)〕/.exec(s); if (m) return { noe: 'fehrest', lar: m[1] === 'hame' ? '' : m[1], offset: +m[2] };
  m = /〔متن (.+?) از (\d+)〕/.exec(s); if (m) return { noe: 'matn', shenase: m[1], offset: +m[2] };
  return null;
}

/* ---------------------- مسیریاب قاعده‌ای ---------------------- */
function akharinKarbar(history, az){
  for (let i = (az === undefined ? history.length - 2 : az); i >= 0; i--) if (history[i] && history[i].role !== 'assistant') return i;
  return -1;
}
function akharinDastyar(history){ for (let i = history.length - 2; i >= 0; i--) if (history[i] && history[i].role === 'assistant') return String(history[i].content || ''); return ''; }

/* قصد یک پیام تنها (بی نگاه به پیام پیشین) */
function qasdTanha(q, vn){
  const t = norm(q), w = t ? t.split(' ') : [];
  const tb = tatbigh(q, vn);
  const r = (qasd, etminan, dalil, x) => Object.assign({ qasd, etminan, dalil, tatbigh: tb }, x || {});
  if (!t || !/\p{L}/u.test(t)) return r('namafhoom', 'bala', 'بی واژه');
  const md = RE.madde.exec(t);
  if (md && md[1] !== 'مواد'){
    const baad = t.slice(md.index + md[0].length);
    const nam = namQanun(baad) || namQanun(t) || (md[1] === 'اصل' ? 'قانون اساسی' : '');
    return r('matn_madde', 'bala', 'ماده/اصل + عدد', { madde: { noe: md[1] === 'اصل' ? 'اصل' : 'ماده', shomare: +md[2], qanun: nam, tozih: /(توضیح|ساده|یعنی|چی میگه|چی میگن|چه میگوید|منظور|شرح)/.test(t) } });
  }
  if (RE.vaziatMozoo.test(t) && RE.vaziatFel.test(t) && !tb.qavi) return r('vaziat', 'bala', 'سرور/مدل + سلامت/وضعیت');
  const lar = dasteAzMatn(t);
  if (lar && RE.fehrestSafhe.test(t) && /(دسته|قوانین|مصوبات|آرا|آرای|رای|رأی|فهرست|لیست|مقررات)/.test(t) && !md) return r('fehrest', 'bala', 'نام دسته', { fehrest: { noe: 'daste_safhe', lar, offset: 0 } });
  if (RE.fehrestA.test(t) && RE.fehrestB.test(t) && RE.fehrestC.test(t) && !tb.qavi){
    const noe = RE.fehrestDaste.test(t) ? 'daste' : RE.fehrestHame.test(t) ? 'hame' : RE.fehrestShomar.test(t) ? 'shomar' : 'fehrest';
    return r('fehrest', 'bala', 'فهرست‌خواهی', { fehrest: { noe, lar: '', offset: 0 } });
  }
  const nam = namQanun(t);
  if (RE.matn.test(t) && nam && !RE.fehrestHame.test(t.replace(/(^| )(کل متن|کل مواد|تمام مواد|همه مواد)( |$)/, ' '))) return r('matn_qanun', 'bala', 'متن + نام قانون', { matn: { nam, offset: 0 } });
  if (RE.asnad.test(t)) return r('asnad', 'bala', 'اسناد پرونده');
  if ((RE.salam.test(t) || RE.meta.test(t) || (RE.hes.test(t) && !RE.hoghooghiVazhe.test(t))) && !tb.qavi) return r('goftogoo', 'bala', 'احوال‌پرسی/گفتگوی روزمره');
  if (tb.qavi || RE.hoghooghiVazhe.test(t)) return r('porsesh_hoghooghi', tb.qavi ? 'bala' : 'miane', tb.qavi ? 'واژه‌نامه: ' + tb.hits.filter(h => !h.zaif).map(h => h.form).join('، ') : 'واژهٔ حقوقی');
  if (w.length <= 4) return r('goftogoo', 'miane', 'پیام کوتاه بی نشانهٔ حقوقی');
  if (tb.hits.length >= 2) return r('porsesh_hoghooghi', 'payin', 'چند واژهٔ عمومی از واژه‌نامه');
  return r('goftogoo', 'payin', 'نشانه‌ای نیافت');
}
/* پیام فقط ارجاع به پیش است؟ («اونو کامل بنویس»، «بیشتر توضیح بده»، «اگه طرف فرار کرده باشه چی») */
function erjaii(q, tb){
  const t = norm(q), w = t.split(' ').filter(Boolean);
  const mozooKhod = tb.qavi > 0 || !!namQanun(t) || RE.madde.test(t);
  if (mozooKhod) return false;
  if (RE.agarChi.test(t)) return true;
  if (RE.eshare.test(t) && w.length <= 12) return true;
  return false;
}

/* مسیریاب کامل: قاعده + زمینهٔ پیام‌های پیشین. خروجی: { qasd, etminan, dalil, payeh?, madde?, matn?, fehrest?, tatbigh } */
function masiryab(q, history, vn){
  history = Array.isArray(history) ? history : [];
  const r = qasdTanha(q, vn);
  if (r.etminan === 'bala' && r.qasd !== 'goftogoo') return r;
  const tb = r.tatbigh;
  if (!erjaii(q, tb)) return r;
  /* ارجاع به پیش: موضوع از پیام پیشین کاربر برداشته می‌شود */
  const t = norm(q);
  const dastyar = akharinDastyar(history);
  const safhe = barchasbSafhe(dastyar);
  if (safhe && /(ادامه|بعدی|صفحه بعد|بیشتر|باقیش|بقیه)/.test(t)){
    if (safhe.noe === 'fehrest') return Object.assign({}, r, { qasd: 'fehrest', etminan: 'bala', dalil: 'ادامهٔ فهرست', payeh: 'edame', fehrest: { noe: 'daste_safhe', lar: safhe.lar, offset: safhe.offset } });
    if (safhe.noe === 'matn') return Object.assign({}, r, { qasd: 'matn_qanun', etminan: 'bala', dalil: 'ادامهٔ متن قانون', payeh: 'edame', matn: { shenase: safhe.shenase, offset: safhe.offset } });
  }
  let pishin = null, iPish = akharinKarbar(history);
  const aghab = /(قبلی|قبلیه|قبلیو|همون موضوع|همان موضوع|اولی|اولیه|قبل تر|قبلتر)/.test(t);   /* ارجاع صریح به پیش‌تر: پیام‌های احوال‌پرسی و سپاس میان راه نادیده گرفته می‌شوند */
  for (let k = 0; k < 4 && iPish >= 0; k++){
    const p = qasdTanha(history[iPish].content, vn);
    const faghatGoftogoo = p.qasd === 'goftogoo' && (erjaii(history[iPish].content, p.tatbigh) || aghab);
    if (!faghatGoftogoo){ pishin = { i: iPish, r: p }; break; }
    iPish = akharinKarbar(history, iPish - 1);
  }
  if (!pishin) return Object.assign({}, r, { qasd: 'goftogoo', etminan: 'bala', dalil: 'ارجاع بی پیام پیشین', payeh: 'edame' });
  const pr = pishin.r;
  if (/(متن|کامل بنویس|کامل بیار|عین)/.test(t) && /(ماده|اون|همون|همین|اینو|اونو)/.test(t)){
    const ref = maddeAzMatn(dastyar) || pr.madde;
    if (ref && ref.qanun) return Object.assign({}, r, { qasd: 'matn_madde', etminan: 'bala', dalil: 'متن مادهٔ یادشده در پاسخ پیشین', payeh: 'edame', madde: Object.assign({}, ref, { tozih: /(توضیح|ساده)/.test(t) }) });
  }
  if (pr.qasd === 'matn_madde' && /(توضیح|ساده|یعنی|منظور|شرح|مثال)/.test(t)){
    const ref = maddeAzMatn(dastyar) || pr.madde;
    if (ref && ref.qanun) return Object.assign({}, r, { qasd: 'matn_madde', etminan: 'bala', dalil: 'توضیح مادهٔ پیشین', payeh: 'edame', madde: Object.assign({}, ref, { tozih: true }) });
  }
  if (pr.qasd === 'porsesh_hoghooghi' || pr.qasd === 'matn_madde' || pr.qasd === 'matn_qanun' || pr.qasd === 'asnad')
    return Object.assign({}, r, { qasd: pr.qasd === 'asnad' ? 'asnad' : 'porsesh_hoghooghi', etminan: 'bala', dalil: 'ادامهٔ پرسش پیشین', payeh: 'edame', pishin: String(history[pishin.i].content || ''), tatbighPishin: pr.tatbigh });
  return Object.assign({}, r, { qasd: 'goftogoo', etminan: 'bala', dalil: 'ادامهٔ گفتگو', payeh: 'edame' });
}

/* ---------------------- بازنویسی پرسش ---------------------- */
function baznevisi(q, masir, history){
  const tb = masir.tatbigh || tatbigh(q);
  const t = norm(q);
  const pooshide = new Set((tb.pooshide || []).flatMap(p => p.split(' ')));
  const mohtava = t.split(' ').filter(x => x.length >= 3 && !IST.has(x) && !pooshide.has(x) && !/^\d+$/.test(x));
  let hoghooghi = tb.hoghooghi.slice(), qanunha = tb.qanunha.slice(), pishinVazhe = [];
  if (masir.payeh === 'edame' && masir.pishin){
    const tp = masir.tatbighPishin || tatbigh(masir.pishin);
    hoghooghi = [...new Set(tp.hoghooghi.concat(hoghooghi))];
    qanunha = [...new Set(tp.qanunha.concat(qanunha))];
    const pp = new Set((tp.pooshide || []).flatMap(p => p.split(' ')));
    pishinVazhe = norm(masir.pishin).split(' ').filter(x => x.length >= 3 && !IST.has(x) && !pp.has(x) && !/^\d+$/.test(x)).slice(0, 4);
  }
  const nam = namQanun(t); if (nam && !qanunha.includes(nam)) qanunha.unshift(nam);
  const kelidvazheha = [...new Set(hoghooghi.concat(pishinVazhe, mohtava))].slice(0, 12);
  const porsesh = [masir.payeh === 'edame' && masir.pishin ? String(masir.pishin).trim() : '', String(q).trim(), hoghooghi.length ? '(' + hoghooghi.slice(0, 8).join('، ') + ')' : '', qanunha.length ? '— ' + qanunha.slice(0, 3).join('، ') : ''].filter(Boolean).join(' ');
  return { porsesh: porsesh.slice(0, 600), kelidvazheha, ebarat: hoghooghi.slice(0, 10), vazheha: [...new Set(pishinVazhe.concat(mohtava))].slice(0, 8), qanunha: qanunha.slice(0, 4) };
}

/* ---------------------- مسیریاب مدلی (برای پیام‌های نامطمئن) ---------------------- */
const MASIR_SCHEMA = {
  type: 'object',
  properties: {
    qasd: { type: 'string', enum: QASDHA },
    porsesh_mostaghel: { type: 'string', maxLength: 200 },
    kelidvazheha: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 6 },
    qanunha: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 3 },
  },
  required: ['qasd', 'porsesh_mostaghel', 'kelidvazheha', 'qanunha'],
  additionalProperties: false,
};
const NEMOONE_MASIR = [
  ['سلام', { qasd: 'goftogoo', porsesh_mostaghel: 'احوال‌پرسی', kelidvazheha: [], qanunha: [] }],
  ['امروز حالم خوب نیست', { qasd: 'goftogoo', porsesh_mostaghel: 'بیان حال', kelidvazheha: [], qanunha: [] }],
  ['یه سوال دارم', { qasd: 'goftogoo', porsesh_mostaghel: 'کاربر می‌خواهد پرسشی بپرسد', kelidvazheha: [], qanunha: [] }],
  ['مرسی عالی بود', { qasd: 'goftogoo', porsesh_mostaghel: 'سپاس', kelidvazheha: [], qanunha: [] }],
  ['اگه یکی چکم برگشت بخوره چیکار باید بکنم', { qasd: 'porsesh_hoghooghi', porsesh_mostaghel: 'اقدام قانونی دارندهٔ چک برگشتی', kelidvazheha: ['چک برگشتی', 'گواهی عدم پرداخت'], qanunha: ['قانون صدور چک'] }],
  ['صاحبخونه وسایلمو ریخته بیرون', { qasd: 'porsesh_hoghooghi', porsesh_mostaghel: 'تخلیهٔ غیرقانونی مستأجر به دست موجر', kelidvazheha: ['موجر', 'تخلیه', 'تصرف عدوانی'], qanunha: ['قانون روابط موجر و مستأجر'] }],
  ['بانک بیشتر از قرارداد سود ازم گرفته', { qasd: 'porsesh_hoghooghi', porsesh_mostaghel: 'دریافت سود مازاد بر قرارداد تسهیلات بانکی', kelidvazheha: ['سود تسهیلات', 'وجه التزام'], qanunha: ['قانون عملیات بانکی بدون ربا'] }],
  ['مهریه رو چطوری میشه گرفت', { qasd: 'porsesh_hoghooghi', porsesh_mostaghel: 'روش مطالبهٔ مهریه', kelidvazheha: ['مهریه', 'مطالبهٔ مهریه'], qanunha: ['قانون حمایت خانواده', 'قانون مدنی'] }],
  ['شریکم پول شرکتو برداشته', { qasd: 'porsesh_hoghooghi', porsesh_mostaghel: 'برداشت غیرمجاز شریک از اموال شرکت', kelidvazheha: ['خیانت در امانت', 'شریک'], qanunha: ['قانون تجارت', 'قانون مجازات اسلامی'] }],
  ['ماده ۱۰ قانون مدنی', { qasd: 'matn_madde', porsesh_mostaghel: 'ماده ۱۰ قانون مدنی', kelidvazheha: [], qanunha: ['قانون مدنی'] }],
  ['اصل ۴۰ قانون اساسی چی میگه', { qasd: 'matn_madde', porsesh_mostaghel: 'اصل ۴۰ قانون اساسی', kelidvazheha: [], qanunha: ['قانون اساسی'] }],
  ['کل متن قانون صدور چک', { qasd: 'matn_qanun', porsesh_mostaghel: 'متن کامل قانون صدور چک', kelidvazheha: [], qanunha: ['قانون صدور چک'] }],
  ['در منابع چه قوانینی هست', { qasd: 'fehrest', porsesh_mostaghel: 'فهرست دسته‌های کتابخانه', kelidvazheha: [], qanunha: [] }],
  ['چند تا قانون تو کتابخونه داریم', { qasd: 'fehrest', porsesh_mostaghel: 'شمار متن‌های کتابخانه', kelidvazheha: [], qanunha: [] }],
  ['متن تمام قوانین موجود را بیاور', { qasd: 'fehrest', porsesh_mostaghel: 'فهرست دسته‌ها و شمار هر دسته', kelidvazheha: [], qanunha: [] }],
  ['سلامت سرور و مدل را بسنج', { qasd: 'vaziat', porsesh_mostaghel: 'وضعیت سرور و مدل', kelidvazheha: [], qanunha: [] }],
  ['در اسناد پرونده شمارهٔ قرارداد چیه', { qasd: 'asnad', porsesh_mostaghel: 'شمارهٔ قرارداد در اسناد پرونده', kelidvazheha: ['شماره قرارداد'], qanunha: [] }],
  ['بیشتر توضیح بده', { qasd: 'edame', porsesh_mostaghel: 'توضیح بیشتر دربارهٔ پاسخ پیشین', kelidvazheha: [], qanunha: [] }],
  ['اونو کامل بنویس', { qasd: 'edame', porsesh_mostaghel: 'متن کامل همان موضوع پیشین', kelidvazheha: [], qanunha: [] }],
  ['اگه طرف فرار کرده باشه چی', { qasd: 'edame', porsesh_mostaghel: 'حکم موضوع پیشین وقتی طرف متواری است', kelidvazheha: ['متواری', 'مجهول‌المکان'], qanunha: [] }],
  ['قولنامه نوشتیم ولی طرف پشیمون شده', { qasd: 'porsesh_hoghooghi', porsesh_mostaghel: 'فسخ یا الزام به اجرای مبایعه‌نامه', kelidvazheha: ['مبایعه‌نامه', 'الزام به تنظیم سند رسمی'], qanunha: ['قانون مدنی'] }],
  ['اجرائیه برام اومده چند روز وقت دارم', { qasd: 'porsesh_hoghooghi', porsesh_mostaghel: 'مهلت اجرای اجرائیه پس از ابلاغ', kelidvazheha: ['اجرائیه', 'ابلاغ'], qanunha: ['قانون اجرای احکام مدنی'] }],
  ['asdfgh', { qasd: 'namafhoom', porsesh_mostaghel: '', kelidvazheha: [], qanunha: [] }],
];
function payamMasirModel(q, history){
  const zamine = (history || []).slice(-4, -1).map(m => (m.role === 'assistant' ? 'دستیار: ' : 'کاربر: ') + String(m.content || '').replace(/\s+/g, ' ').slice(0, 200)).join('\n');
  const sys = 'تو فقط قصد پیام کاربر را تشخیص می‌دهی و خروجی‌ات همیشه یک JSON است. قصدها: ' + QASDHA.map(k => k + ' (' + QASD[k] + ')').join('، ') +
    '. porsesh_mostaghel پرسش مستقل و رسمیِ کاربر است (اگر به پیام پیشین ارجاع دارد، موضوع پیشین را در آن بیاور). kelidvazheha اصطلاح‌های حقوقی و qanunha نام قانون‌های محتمل است.\nنمونه‌ها:\n' +
    NEMOONE_MASIR.map(([p, j]) => 'پیام: ' + p + '\n' + JSON.stringify(j)).join('\n');
  return [{ role: 'system', content: sys }, { role: 'user', content: (zamine ? 'زمینه:\n' + zamine + '\n\n' : '') + 'پیام: ' + String(q).slice(0, 500) }];
}
function badaneMasirModel(q, history){
  return { model: 'mizban', stream: false, temperature: 0, max_tokens: 120, cache_prompt: true, messages: payamMasirModel(q, history),
    response_format: { type: 'json_schema', json_schema: { name: 'masir', strict: true, schema: MASIR_SCHEMA } } };
}
function khandanMasirModel(text){
  try {
    const m = /\{[\s\S]*\}/.exec(String(text || '')); if (!m) return null;
    const j = JSON.parse(m[0]); if (!j || !QASDHA.includes(j.qasd)) return null;
    return { qasd: j.qasd, porsesh_mostaghel: String(j.porsesh_mostaghel || '').slice(0, 300), kelidvazheha: (Array.isArray(j.kelidvazheha) ? j.kelidvazheha : []).map(String).slice(0, 6), qanunha: (Array.isArray(j.qanunha) ? j.qanunha : []).map(String).slice(0, 3) };
  } catch(e){ return null; }
}
/* مسیریاب نهایی: قاعده؛ اگر نامطمئن بود و فراخوان مدل در دسترس است، مدل (JSON schema) */
async function masiryabKamel(q, history, opt){
  opt = opt || {};
  const r = masiryab(q, history, opt.vn);
  if (r.etminan !== 'payin' || typeof opt.llm !== 'function') return r;
  let j = null;
  try { j = khandanMasirModel(await opt.llm(badaneMasirModel(q, history))); } catch(e){ j = null; }
  if (!j) return Object.assign({}, r, { dalil: r.dalil + ' (مسیریاب مدلی پاسخ نداد)' });
  const qasd = j.qasd === 'edame' ? (r.qasd === 'goftogoo' ? 'goftogoo' : r.qasd) : j.qasd;
  const x = Object.assign({}, r, { qasd, etminan: 'model', dalil: 'مسیریاب مدلی', model: j });
  if (qasd === 'matn_madde' && !x.madde){ const ref = maddeAzMatn(j.porsesh_mostaghel); if (ref) x.madde = ref; else x.qasd = 'porsesh_hoghooghi'; }
  if (qasd === 'matn_qanun' && !x.matn){ const nam = namQanun(j.porsesh_mostaghel) || j.qanunha[0]; if (nam) x.matn = { nam, offset: 0 }; else x.qasd = 'porsesh_hoghooghi'; }
  if (qasd === 'fehrest' && !x.fehrest) x.fehrest = { noe: 'fehrest', lar: '', offset: 0 };
  return x;
}
function afzoodanModelBeBaznevisi(bz, masir){
  if (!masir || !masir.model) return bz;
  const m = masir.model;
  return Object.assign({}, bz, {
    porsesh: (m.porsesh_mostaghel ? m.porsesh_mostaghel + ' — ' : '') + bz.porsesh,
    ebarat: [...new Set(bz.ebarat.concat(m.kelidvazheha))].slice(0, 12),
    kelidvazheha: [...new Set(m.kelidvazheha.concat(bz.kelidvazheha))].slice(0, 12),
    qanunha: [...new Set(bz.qanunha.concat(m.qanunha))].slice(0, 4),
  });
}

/* ---------------------- ضدتکرار ---------------------- */
function shingle(text, n){
  n = n || 3; const w = kalamat(text); const s = new Set();
  if (w.length < n){ if (w.length) s.add(w.join(' ')); return s; }
  for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(' '));
  return s;
}
function shebahat(a, b){
  const A = shingle(a), B = shingle(b); if (!A.size || !B.size) return 0;
  let ham = 0; for (const x of A) if (B.has(x)) ham++;
  return ham / (A.size + B.size - ham);
}
/* چه بخشی از آغاز پاسخ تازه عیناً در پاسخ پیشین هست (برای بازبینی زودهنگام پیش از نمایش) */
function poosheshAghaz(tazeh, pishin){
  const A = shingle(tazeh), B = shingle(pishin); if (A.size < 4 || !B.size) return 0;
  let ham = 0; for (const x of A) if (B.has(x)) ham++;
  return ham / A.size;
}
const HAD_TEKRAR = 0.85;
function tekrari(tazeh, pishinha){
  let bish = 0; for (const p of (pishinha || [])) if (p) bish = Math.max(bish, shebahat(tazeh, p));
  return { tekrari: bish >= HAD_TEKRAR, shebahat: bish };
}
/* «در منابع نیست»ِ نابه‌جا */
const RE_NIST = /(در|تو) (منابع|منبع|کتابخانه|کتابخونه|اسناد)( بازیابی ?شده| حقوقی| خوانده ?شده| موجود)? (نیست|نیامده|وجود ندارد|وجود نداره|یافت نشد|پیدا نشد)|(منابع|منبع) (بازیابی ?شده )?(پاسخ|چیزی) (ندارد|نداره)/;
function nistNabeja(text){ return RE_NIST.test(norm(text)); }

/* ---------------------- تاریخچهٔ کوتاه‌شده ---------------------- */
function paksaziPayam(s){ const x = String(s || ''); const i = x.indexOf('【'); return (i > 0 ? x.slice(0, i) : x).replace(/\n?〔بازبینی〕[\s\S]*$/, '').trim(); }
function tarikhcheKootah(history, o){
  o = Object.assign({ akhar: 6, kholase: 600, dastyar: 1500, karbar: 2000 }, o || {});
  const h = (Array.isArray(history) ? history : []).filter(m => m && typeof m.content === 'string' || m && Array.isArray(m.content))
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: typeof m.content === 'string' ? m.content : '', images: m.images }));
  const kohne = h.slice(0, Math.max(0, h.length - o.akhar)), taze = h.slice(-o.akhar);
  let kholase = '';
  if (kohne.length){
    const b = kohne.map(m => (m.role === 'user' ? 'کاربر: ' : 'میزبان: ') + paksaziPayam(m.content).replace(/\s+/g, ' ').slice(0, m.role === 'user' ? 120 : 80));
    kholase = b.join(' · '); if (kholase.length > o.kholase) kholase = '…' + kholase.slice(-o.kholase + 1);
  }
  const out = [];
  for (const m of taze){
    const c = m.role === 'assistant' ? paksaziPayam(m.content).slice(0, o.dastyar) : String(m.content).slice(0, o.karbar);
    if (!c) continue;
    if (out.length && out[out.length - 1].role === m.role){ out[out.length - 1].content += '\n\n' + c; continue; }   /* نقش‌ها باید یک‌درمیان باشند (قالب Gemma) */
    out.push({ role: m.role, content: c });
  }
  while (out.length && out[0].role === 'assistant') out.shift();
  return { messages: out, kholase };
}

/* ---------------------- دستورالعمل‌ها ---------------------- */
const GHAVANIN_FESHORDE = [
  'قواعد کارفرما (فشردهٔ کاربردی؛ متن کامل در اپلیکیشن است):',
  '۱. صداقت: چیزی را که نمی‌دانی نساز؛ بگو «نمی‌دانم» یا «مطمئن نیستم».',
  '۲. هیچ مادهٔ قانون، شمارهٔ ماده، تاریخ یا رأیی را از حافظهٔ خودت نساز؛ استناد فقط به متنی است که سرور از کتابخانهٔ رسمی آورده.',
  '۳. داده فقط از کتابخانهٔ حقوقی رسمی و داده‌های همین سیستم است؛ اینترنت و ویکی‌پدیا هرگز.',
  '۴. متن کتابخانه را «اسناد پرونده» معرفی نکن؛ اسناد پرونده جدا هستند.',
  '۵. تحلیل و کارشناسی حقوقی نهایی فقط به دستور صریح کارفرماست؛ تا آن زمان راهنمایی مستند و پیش‌نویس.',
  '۶. تو چیزی را تغییر نمی‌دهی و پاک نمی‌کنی؛ فقط می‌خوانی و پاسخ می‌دهی.',
  '۷. پاسخ پیشین خودت را تکرار نکن؛ به پیام تازه پاسخ بده.',
  '۸. اگر پیام واقعاً نامفهوم بود، کوتاه بپرس منظور چیست؛ حدس نزن.',
].join('\n');
function dastoorPaye(o){
  o = o || {};
  return [
    'تو «میزبان شخصی» هستی: دستیار آفلاین آقای محمدعلی کریمی‌پور (شرکت طلوع فردای ایرانیان) روی رایانهٔ خود او.',
    'فارسیِ روشن و طبیعی بنویس. منظور کاربر را از زمینهٔ گفتگو بفهم: گفتار محاوره‌ای، مترادف‌ها و اشاره به پیام‌های پیشین («اونو»، «همون»، «بیشتر بگو») را درست دریاب و مثل یک همکار باهوش پاسخ بده.',
    o.ghavaninKamel ? '———— قوانین اجباری کارفرما برای میزبان ————\n' + o.ghavaninKamel + '\n———— پایان قوانین ————' : GHAVANIN_FESHORDE,
  ].filter(Boolean).join('\n');
}
const DASTOOR_QASD = {
  goftogoo: 'این پیام گفتگوی عادی است. مثل یک همکار صمیمی و محترم پاسخ بده؛ کوتاه و طبیعی. به منابع و کتابخانه اشاره نکن و هرگز نگو «در منابع نیست». اگر کاربر کاری خواست که به جست‌وجوی کتابخانه نیاز دارد، بپرس دقیقاً دربارهٔ چه موضوعی بگردی.',
  porsesh_hoghooghi: 'این پرسش حقوقی است و سرور متن رسمی نزدیک‌ترین مواد را از کتابخانه آورده (پایین پیام). نزدیک‌ترین مواد را با نام قانون و شمارهٔ ماده نام ببر و ساده توضیح بده به وضع کاربر چه ربطی دارند و او چه کاری می‌تواند بکند. اگر هیچ‌کدام دقیقاً همان نبود، بگو کدام نزدیک‌تر است و یک پرسش روشن‌کنندهٔ کوتاه بپرس. فقط به همین متن‌ها استناد کن و ماده‌ای از حافظه نساز.',
  porsesh_hoghooghi_bimanba: 'این پرسش حقوقی است ولی کتابخانه این بار متنی نرساند. راهنمایی کلی و کوتاه بده و آغازش بنویس «(از دانش عمومی مدل، بی استناد به ماده)»؛ هیچ شمارهٔ ماده یا نام دقیق مقرره‌ای از حافظه نیاور. در پایان یک پرسش روشن‌کننده بپرس تا دوباره در کتابخانه بگردم.',
  matn_madde: 'متن رسمی ماده از کتابخانه در پیام آمده و به کاربر نشان داده شده است. آن را کوتاه و ساده توضیح بده؛ متن را دوباره ننویس و ماده‌ای دیگر از حافظه نیاور.',
  fehrest_daste: 'کاربر پرسیده قوانین ایران به چند دسته تقسیم می‌شوند. در چند خط کوتاه دسته‌بندی کلی حقوقی را توضیح بده و آغازش بنویس «(از دانش عمومی مدل)». دسته‌بندی واقعی کتابخانه جدا به کاربر نشان داده شده است؛ آن را تکرار نکن.',
  asnad: 'متن اسناد پرونده که سرور آورده پایین پیام است. فقط از همین اسناد پاسخ بده و مسیر سند را بیاور. اگر پاسخ در آن‌ها نبود، بگو «در اسناد خوانده‌شده نیافتم» و بپرس با چه واژه‌ای دوباره بگردم.',
  namafhoom: 'پیام کاربر روشن نیست. مؤدبانه و خیلی کوتاه بگو منظور را درست نفهمیدی و بخواه دوباره بگوید (مفهوم نبود، تکرار کنید).',
  vaziat: 'گزارش وضعیت سرور بالا به کاربر نشان داده شده است. در دو سه جملهٔ کوتاه بگو آیا مشکلی هست و چه باید کرد؛ عددها را تکرار نکن.',
};
/* بخش ثابت اول می‌آید تا حافظهٔ پیشوند مدل (cache_prompt) میان پیام‌ها بماند؛ خلاصهٔ گفتگو که هر بار فرق دارد، آخر */
function dastoor(qasd, o){ o = o || {}; return dastoorPaye(o) + '\n' + (DASTOOR_QASD[qasd] || DASTOOR_QASD.goftogoo) + (o.kholase ? '\nخلاصهٔ گفتگوی پیشین: ' + o.kholase : ''); }

/* ---------------------- نمونه‌گیری ---------------------- */
function nemoone(qasd, dobare){
  const azad = qasd === 'goftogoo' || qasd === 'namafhoom';
  const o = { repeat_penalty: 1.1, repeat_last_n: 256, presence_penalty: 0.3, dry_multiplier: 0.8, dry_base: 1.75, dry_allowed_length: 2, dry_penalty_last_n: -1 };
  o.temperature = azad ? 0.7 : 0.3;
  if (azad) o.top_p = 0.9;
  if (dobare) o.temperature = Math.min(1.0, o.temperature + 0.3);
  return o;
}

/* ---------------------- ثبت ارزیابی ---------------------- */
function sabtArzyabi(file, rec){
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8'); return true; } catch(e){ return false; }
}

module.exports = {
  QASD, QASDHA, norm, kalamat, faRagham, IST,
  amadeKardanVazhename, barVazhename, tatbigh, VN,
  namQanun, maddeAzMatn, dasteAzMatn, barchasbSafhe,
  qasdTanha, erjaii, masiryab, masiryabKamel, baznevisi, afzoodanModelBeBaznevisi,
  MASIR_SCHEMA, NEMOONE_MASIR, badaneMasirModel, khandanMasirModel,
  shingle, shebahat, poosheshAghaz, tekrari, HAD_TEKRAR, nistNabeja,
  tarikhcheKootah, paksaziPayam, dastoor, dastoorPaye, DASTOOR_QASD, GHAVANIN_FESHORDE, nemoone, sabtArzyabi,
};
