/* واسطهٔ کتابخانهٔ حقوقی روی کیس یک — ۱۴۰۵/۰۷/۰۵
   دستور کارفرما: «کیس شماره یک کارت گرافیک و پردازنده و رم‌ها برای فقط گفتگو، بقیه هر چی هست میره رو کیس دوم».
   خود کتابخانه (گردآوری، پایگاه، نمایهٔ معنایی، جست‌وجو) روی گره دوم است: /opt/mizban-gere2/ketab (کد اصلی: «خانه کلود\گره دوم\ketab»).
   این واسطه همان رابط پیشین را به سرور، میزبان، اپلیکیشن و ابزار ketabkhane می‌دهد و همه را از درگاه 8802 گره دوم می‌پرسد؛
   وضعیت‌ها هر ۵ ثانیه و گزارش‌ها هر دقیقه نگه داشته می‌شوند تا هیچ پاسخی منتظر شبکه نماند.
   بسته‌های دانلودشدهٔ Chrome کارفرما (سامانهٔ ملی) از «خانه کلود\دریافت مرورگر» به گره دوم فرستاده و سپس به سطل زباله برده می‌شوند (هرگز پاک نمی‌شوند). */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let S = null, H = null;
const NASKHE = '2.0.0-vaseth';
const PORT = 8802;
const C = { hal: null, halT: 0, gozaresh: null, gozareshT: 0, hadaf: null, hadafT: 0, eslah: new Map(), khata: '', timers: [], ferestade: 0, ferestKhata: '' };
const HOME = () => path.join(S.ROOT, 'خانه کلود');
function ip(){ try { return (S && S.metaGet && S.metaGet('gere2_ip')) || '192.168.1.12'; } catch(e){ return '192.168.1.12'; } }
function kelid(){ try { return fs.readFileSync(path.join(HOME(), 'گره دوم', 'kelid'), 'utf8').trim(); } catch(e){ return ''; } }
function log(m){ try { S.log('کتابخانه (واسطه): ' + m); } catch(e){} }
function darang(e){ return 'کتابخانه روی کیس دو (گره دوم ' + ip() + ') در دسترس نیست' + (e ? ': ' + e : ''); }
function porsesh(method, p, body, ms){
  return new Promise(res => {
    const d = body !== undefined ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({ host: ip(), port: PORT, path: p, method, agent: false, headers: Object.assign({ 'x-kelid': kelid() }, d ? { 'content-type': 'application/json', 'content-length': d.length } : {}) }, s => {
      const ch = []; s.on('data', c => ch.push(c));
      s.on('end', () => { try { const j = JSON.parse(Buffer.concat(ch).toString('utf8')); C.khata = ''; res(j); } catch(e){ res({ ok: false, khata: darang('پاسخ نادرست'), text: darang('پاسخ نادرست') }); } });
    });
    r.setTimeout(ms || 30000, () => r.destroy(new Error('مهلت ' + Math.round((ms || 30000) / 1000) + ' ثانیه')));
    r.on('error', e => { C.khata = e.message; res({ ok: false, khata: darang(e.message), text: darang(e.message) }); });
    r.end(d || undefined);
  });
}
async function tazeh(){ const h = await porsesh('GET', '/hal', undefined, 15000); if (h && h.ok && h.state){ C.hal = h; C.halT = Date.now(); } }
async function tazehGozaresh(){ const g = await porsesh('GET', '/gozaresh', undefined, 90000); if (g && !g.khata && g.ok !== false){ C.gozaresh = g; C.gozareshT = Date.now(); } }
async function tazehHadaf(){ const g = await porsesh('GET', '/hadaf', undefined, 90000); if (g && !g.khata && g.ok !== false){ C.hadaf = g; C.hadafT = Date.now(); } }

function state(){
  if (C.hal && Date.now() - C.halT < 120000) return C.hal.state;
  return { running: false, gam: darang(C.khata), khata: 0, tekke: C.hal ? C.hal.state.tekke : 0, namaye: C.hal ? C.hal.state.namaye : 0, mavad: C.hal ? C.hal.state.mavad : 0, saf: C.hal ? C.hal.state.saf : 0, log: [], shomar: {}, dasteHa: [] };
}
function statusLine(){
  const jaye = '\n(کتابخانه روی کیس دو — گره دوم ' + ip() + '؛ کیس یک فقط گفتگو، به دستور کارفرما)';
  if (C.hal && Date.now() - C.halT < 120000) return C.hal.statusLine + jaye + (C.ferestKhata ? '\nفرستادن بسته‌های سامانهٔ ملی: ' + C.ferestKhata : '');
  return 'کتابخانهٔ حقوقی: ' + darang(C.khata) + (C.hal ? ' · آخرین وضعیت (' + new Date(C.halT).toLocaleTimeString('fa-IR') + '): ' + C.hal.statusLine : '') + jaye;
}
function gozareshJson(){ if (!C.gozareshT || Date.now() - C.gozareshT > 30000) tazehGozaresh(); return C.gozaresh || { ok: false, text: darang(C.khata || 'گزارش هنوز نرسیده') }; }
function hadafJson(){ if (!C.hadafT || Date.now() - C.hadafT > 30000) tazehHadaf(); return C.hadaf || { ok: false, text: darang(C.khata || 'فهرست هنوز نرسیده') }; }
async function jostojoo(q, had){
  const r = await porsesh('POST', '/jostojoo', { q, had }, 180000);
  if (!r || !Array.isArray(r.natayej)) return { q, khata: (r && (r.khata || r.text)) || darang(), natayej: [] };
  r.natayej.forEach(x => { if (x.eslah) C.eslah.set(x.onvan + '|' + (x.tarikh || ''), x.eslah); });
  if (C.eslah.size > 5000) C.eslah.clear();
  return r;
}
function akharinEslah(onvan, tarikh){ return C.eslah.get(onvan + '|' + (tarikh || '')) || null; }
function matnNatayej(r){
  if (r.khata) return 'خطا: ' + r.khata;
  if (!r.natayej.length) return 'در کتابخانهٔ حقوقی نیست: ' + r.q + (r.manaei ? '' : ' (فقط جست‌وجوی واژه‌ای؛ نمایهٔ معنایی هنوز ساخته نشده)') + '. اگر کتابخانه هنوز کامل گردآوری نشده، این نبودن به معنای نبودنِ قانون نیست.';
  return r.natayej.map((x, i) => (i + 1) + ') ' + x.onvan + (x.madde ? ' — ' + x.madde : '') + '\n   تاریخ تصویب: ' + (x.tarikh || '؟') + ' · مرجع: ' + (x.marja || '؟') + ' · منبع: ' + x.manba + '\n   ' + x.url + '\n' + x.matn).join('\n\n');
}
/* پایگاه دانش پیشین (ویکی‌نبشته) هرگز نباید کتابخانه را پر کند؛ پاسخ «هست» یعنی از ویکی‌نبشته خوانده نشود */
function hast(){ return true; }
function tarikhcheMatn(onvan){ return 'تاریخچهٔ «' + onvan + '» روی کیس دو است؛ ابزار ketabkhane با amal=tarikhche'; }
async function hadafCbi(onvanha){ return porsesh('POST', '/cbi', { onvanha }, 60000); }
async function qavaninKar(n, lp){ return porsesh('POST', '/qavanin/kar', { n, lp }, 30000); }
async function qavaninFehrest(b){ return porsesh('POST', '/qavanin/fehrest', b, 120000); }
async function qavaninMatn(b){ return porsesh('POST', '/qavanin/matn', b, 120000); }

/* بسته‌های دانلودشدهٔ Chrome کارفرما ← گره دوم */
const QVD = { dar: false };
function qvdPoshe(){ return path.join(HOME(), 'دریافت مرورگر'); }
function beSatl(p, f){ const satl = path.join(S.ROOT, 'سطل زباله', 'خانه کلود', 'دریافت مرورگر — بسته‌های فرستاده‌شده به کیس دو'); fs.mkdirSync(satl, { recursive: true }); let q = path.join(satl, f), k = 1; while (fs.existsSync(q)) q = path.join(satl, f.replace(/(\.json(\.gz)?)$/, ' (' + (k++) + ')$1')); fs.renameSync(p, q); }
async function qvdFerest(){
  if (QVD.dar) return; let fa;
  try { fa = fs.readdirSync(qvdPoshe()).filter(f => /^mizban-qv-.*\.json(\.gz)?$/.test(f)).sort(); } catch(e){ return; }
  if (!fa.length) return; QVD.dar = true;
  try {
    for (const f of fa.slice(0, 6)){
      const p = path.join(qvdPoshe(), f);
      try { if (Date.now() - fs.statSync(p).mtimeMs < 2000) continue; } catch(e){ continue; }
      const r = await porsesh('POST', '/basteh', { nam: f, dade: fs.readFileSync(p).toString('base64') }, 120000);
      if (r && r.ok){ beSatl(p, f); C.ferestade++; C.ferestKhata = ''; } else { C.ferestKhata = (r && (r.text || r.khata)) || 'بی‌پاسخ'; break; }
    }
  } catch(e){ C.ferestKhata = e.message || String(e); } finally { QVD.dar = false; }
}

const TOOLS = [{
  name: 'ketabkhane', title: 'کتابخانهٔ حقوقی',
  description: 'کتابخانهٔ حقوقی معتبر: متن رسمی قوانین و مقررات ایران، کلمه‌به‌کلمه از منبع رسمی (اکنون: مرکز پژوهش‌های مجلس rc.majlis.ir)، با شناسه، تاریخ و مرجع تصویب، نشانی و اثر انگشت؛ تکه‌بندی به تفکیک ماده؛ هرگز ویکی‌پدیا. amal=vaziat · amal=shoroo (manabe = فهرست منابع [majlis…]، daste = فهرست دسته‌ها یا کدهای lar) · amal=beroz (فقط تازه‌ها) · amal=ist · amal=gozaresh · amal=jostojoo با q و had (واژه‌ای + معنایی) · amal=matn با shenase یا url یا onvan (متن کامل، offset/limit) · amal=fehrest با q/limit/offset · amal=namaye (ساخت نمایهٔ معنایی با BGE-M3). هیچ‌چیز خودبه‌خود آغاز نمی‌شود؛ فقط به دستور کارفرما.',
  inputSchema: { type: 'object', properties: { amal: { type: 'string' }, taeed: { type: 'string' }, onvanha: { type: 'array', items: { type: 'string' } }, manabe: { type: 'array', items: { type: 'string' } }, daste: { type: 'array', items: { type: 'string' } }, q: { type: 'string' }, had: { type: 'number' }, shenase: { type: 'string' }, url: { type: 'string' }, onvan: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['amal'], additionalProperties: false },
  async run(a){
    a = a || {}; const amal = String(a.amal || 'vaziat');
    if (amal === 'vaziat'){ await tazeh(); return S.ok(statusLine()); }
    if (amal === 'qavanin_klip') return S.fail('کانال کلیپ‌بورد کنار گذاشته شد؛ بسته‌ها از پوشهٔ دریافت Chrome به کیس دو می‌روند');
    const r = await porsesh('POST', '/amal', a, 600000);
    if (r && typeof r.text === 'string' && r.isError !== undefined){
      if (amal === 'qavanin_niaz' && !r.isError){   /* فهرست نیاز باید در کیس یک باشد تا به زبانهٔ Chrome داده شود */
        try { const n = await new Promise(res => { const q = http.request({ host: ip(), port: PORT, path: '/niaz', method: 'GET', agent: false, headers: { 'x-kelid': kelid() } }, s => { const ch = []; s.on('data', c => ch.push(c)); s.on('end', () => res(s.statusCode === 200 ? Buffer.concat(ch) : null)); }); q.setTimeout(60000, () => q.destroy()); q.on('error', () => res(null)); q.end(); });
          if (n){ fs.mkdirSync(qvdPoshe(), { recursive: true }); fs.writeFileSync(path.join(qvdPoshe(), 'mizban-niaz.json'), n); r.text += '\n(فهرست نیاز در کیس یک هم گذاشته شد: ' + path.join(qvdPoshe(), 'mizban-niaz.json') + ')'; } } catch(e){}
      }
      return { text: r.text, isError: !!r.isError };
    }
    return S.fail((r && (r.khata || r.text)) || darang());
  }
}];

function init(shared, helpers){
  S = shared; H = helpers;
  C.timers.push(setInterval(tazeh, 5000), setInterval(() => { tazehGozaresh(); tazehHadaf(); }, 60000), setInterval(qvdFerest, 3000));
  C.timers.forEach(t => t.unref && t.unref());
  setTimeout(tazeh, 500); setTimeout(() => { tazehGozaresh(); tazehHadaf(); }, 3000);
  log('واسطه آماده است — کتابخانه روی گره دوم ' + ip() + ':' + PORT);
}
function stopAll(){ C.timers.forEach(t => clearInterval(t)); C.timers = []; }

module.exports = { NASKHE, init, state, gozareshJson, hadafJson, hadafCbi, qavaninFehrest, qavaninKar, qavaninMatn, akharinEslah, tarikhcheMatn, hast, statusLine, jostojoo, matnNatayej, stopAll, TOOLS, MANABE: {}, DASTE: {} };
