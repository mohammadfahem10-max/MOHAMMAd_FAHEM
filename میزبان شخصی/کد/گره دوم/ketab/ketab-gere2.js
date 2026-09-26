/* میزبان کتابخانهٔ حقوقی روی گره دوم (کیس دو، لینوکس) — ۱۴۰۵/۰۷/۰۵
   دستور کارفرما: «کیس شماره یک کارت گرافیک و پردازنده و رم‌ها برای فقط گفتگو، بقیه هر چی هست میره رو کیس دوم».
   همان ketabkhane.js سرور (گردآوری، پایگاه، نمایهٔ معنایی، جست‌وجو) با پوستهٔ S/H همین‌جا اجرا می‌شود؛ پایگاه در همین پوشه.
   واسطهٔ کیس یک (سرور\ketabkhane.js) از راه درگاه 8802 با کلید مشترک گره دوم می‌پرسد. هیچ فایلی پاک نمی‌شود (سطل زباله زیر «ریشه»). */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const HERE = __dirname;
const ROOT = path.join(HERE, 'ریشه');
const KELID = (() => { try { return fs.readFileSync('/opt/mizban-gere2/kelid', 'utf8').trim(); } catch(e){ return ''; } })();
const LOGF = path.join(HERE, 'ketab.log');
function log(m){ try { fs.appendFileSync(LOGF, new Date().toISOString() + ' ' + m + '\n'); } catch(e){} }
const META = { gere2_ip: '127.0.0.1', tamamghodrat: '0', mizban_dar_kar: '0' };
const S = {
  HERE, ROOT, HOME: path.join(ROOT, 'خانه کلود'), log,
  ok: t => ({ text: String(t), isError: false }),
  fail: (m, e) => ({ text: String(m) + (e ? ' — ' + (e.message || e) : ''), isError: true }),
  metaGet: k => (META[k] !== undefined ? META[k] : ''),
  metaSet: (k, v) => { META[k] = String(v); }
};
function httpGet(port, p){ return new Promise(res => { const r = http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, s => { let b = ''; s.on('data', c => b += c); s.on('end', () => res({ status: s.statusCode, body: b })); }); r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); }); }); }
const H = { httpGet, pickExe: () => null, ensureRuntimeDlls(){}, killPid(){} };
for (const d of [path.join(ROOT, 'سطل زباله'), path.join(S.HOME, 'دریافت مرورگر')]) fs.mkdirSync(d, { recursive: true });
process.on('uncaughtException', e => log('خطای پیش‌بینی‌نشده: ' + (e && e.stack || e)));
process.on('unhandledRejection', e => log('وعدهٔ ردشده: ' + (e && e.stack || e)));

const KB = require('./ketabkhane.js');
KB.init(S, H);
const TOOL = KB.TOOLS.find(t => t.name === 'ketabkhane');
log('کتابخانه بار شد (نسخهٔ ' + (KB.NASKHE || '') + ')');

const J = (res, o, c) => { const b = Buffer.from(JSON.stringify(o === undefined ? null : o)); res.writeHead(c || 200, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length }); res.end(b); };
async function badane(req, max){ const ch = []; let n = 0; for await (const c of req){ n += c.length; if (n > max) throw new Error('بزرگ‌تر از سقف'); ch.push(c); } return Buffer.concat(ch); }

http.createServer(async (req, res) => {
  try {
    if (!KELID || req.headers['x-kelid'] !== KELID) return J(res, { ok: false, text: 'کلید نادرست' }, 403);
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/hal') return J(res, { ok: true, state: KB.state(), statusLine: KB.statusLine(), pid: process.pid, t: Date.now() });
    if (p === '/gozaresh') return J(res, KB.gozareshJson());
    if (p === '/hadaf') return J(res, KB.hadafJson());
    if (p === '/niaz'){ const f = path.join(S.HOME, 'دریافت مرورگر', 'mizban-niaz.json'); if (!fs.existsSync(f)) return J(res, { ok: false, text: 'فهرست نیاز ساخته نشده' }, 404); const b = fs.readFileSync(f); res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length }); return res.end(b); }
    if (req.method !== 'POST') return J(res, { ok: false, text: 'نیست' }, 404);
    const b = JSON.parse((await badane(req, 300e6)).toString('utf8') || '{}');
    if (p === '/jostojoo'){
      const r = await KB.jostojoo(b.q, b.had, b.opt || {});   /* ۱۴۰۵/۰۷/۰۵: بازنویسی پرسش، بودجهٔ زمان و … از کیس یک */
      if (r && Array.isArray(r.natayej)) r.natayej.forEach(x => { try { const a = KB.akharinEslah(x.onvan, x.tarikh); if (a) x.eslah = a; } catch(e){} });
      return J(res, r);
    }
    if (p === '/amal') return J(res, await TOOL.run(b));
    if (p === '/matn') return J(res, KB.matnQanunJson(b));       /* ۱۴۰۵/۰۷/۰۵: متن قانون بخش‌به‌بخش برای گفتگو */
    if (p === '/fehrest') return J(res, KB.fehrestJson(b));      /* ۱۴۰۵/۰۷/۰۵: فهرست صفحه‌به‌صفحه با دسته */
    if (p === '/hast') return J(res, { ok: true, hast: !!KB.hast(b.onvan) });
    if (p === '/tarikhche') return J(res, { ok: true, text: KB.tarikhcheMatn(b.onvan) });
    if (p === '/cbi') return J(res, KB.hadafCbi(b.onvanha || []));
    if (p === '/qavanin/kar') return J(res, KB.qavaninKar(b.n, b.lp));
    if (p === '/qavanin/fehrest') return J(res, KB.qavaninFehrest(b));
    if (p === '/qavanin/matn') return J(res, KB.qavaninMatn(b));
    if (p === '/basteh'){
      /* بستهٔ دانلودشدهٔ Chrome کارفرما (سامانهٔ ملی) — در پوشهٔ دریافت همین‌جا گذاشته می‌شود و پایش خود کتابخانه واردش می‌کند */
      const nam = String(b.nam || '');
      if (!/^mizban-qv-[\w.\-]+\.json(\.gz)?$/.test(nam)) return J(res, { ok: false, text: 'نام نادرست' }, 400);
      const dir = path.join(S.HOME, 'دریافت مرورگر');
      let f = path.join(dir, nam); if (fs.existsSync(f)) f = path.join(dir, nam.replace(/(\.json(\.gz)?)$/, '-' + Date.now() + '$1'));
      fs.writeFileSync(f + '.tmp', Buffer.from(String(b.dade || ''), 'base64')); fs.renameSync(f + '.tmp', f);
      return J(res, { ok: true, nam: path.basename(f) });
    }
    J(res, { ok: false, text: 'نیست' }, 404);
  } catch(e){ try { J(res, { ok: false, text: e.message || String(e) }, 500); } catch(e2){} }
}).listen(8802, '0.0.0.0', () => log('میزبان کتابخانه روی درگاه 8802 آغاز شد (فرایند ' + process.pid + ')'));
