/* =====================================================================
   پایگاه دانش میزبان شخصی — مطالعهٔ بی‌وقفه از منابع معتبر (دستور کارفرما ۱۴۰۵/۰۶/۲۴)
   پروژه: شرکت طلوع فردای ایرانیان — تهیه و تنظیم: محمدعلی کریمی‌پور
   ---------------------------------------------------------------------
   · یک پایگاه واحد: «پایگاه دانش.sqlite» کنار سرور (نسخهٔ دوم ساخته نمی‌شود).
   · هر تکه دانش با منبع، نشانی، تاریخ، اثر انگشت و نمرهٔ اعتبار ذخیره می‌شود.
   · دانش در پایگاه می‌نشیند، نه در وزن‌های مدل ← وزن‌ها هرگز خراب نمی‌شوند.
   · جست‌وجوی دوگانه: واژه‌ای (FTS5) + معنایی (bge-m3 روی llama.cpp، درگاه ۸۷۹۳).
   · مطالعهٔ بی‌وقفه: استثنای صریح کارفرما بر ممنوعیت کار خودکار؛ فقط با roshan آغاز
     می‌شود، با khamoosh می‌ایستد، و اگر روشن مانده باشد با بالا آمدن سرور ادامه می‌یابد.
   · اولویت: موضوع پرونده‌ها (۱۰۰)، سپس دانش عمومی (۴۰)؛ پیوندها با اولویت کمتر به صف می‌آیند.
   · منابع: ویکی‌نبشته (متن قوانین — با هشدار تطبیق با متن رسمی) و ویکی‌پدیای فارسی.
     سایت مرکز پژوهش‌های مجلس دیوار ضدربات دارد و از راه برنامه خوانا نیست.
   · بار پردازنده کم: هر گام با فاصله، مدل معنایی با ۲ رشته و اولویت پایین — خوانش اسناد مقدم است.
   ===================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), https = require('https'), os = require('os'), crypto = require('crypto');
const { spawn } = require('child_process');

const NASKHE = '1.0.0';
const PORT_EMB = 8793;
const EMB = { file: 'bge-m3-Q8_0.gguf', minBytes: 6.0e8, dim: 1024, title: 'BGE-M3 (چندزبانه، Q8_0)' };
const UA = 'naghshe-danesh/1.0 (personal offline research assistant)';
const GAM_MS = 15000;              // فاصلهٔ دو گام مطالعه
/* ۱۴۰۵/۰۷/۰۲ — «حالت تمام‌قدرت آموزش» (دستور کارفرما): گام‌ها تندتر، مدل معنایی روی کارت گرافیک و با اولویت عادی */
const tg = () => { try { return !!(S && S.metaGet && S.metaGet('tamamghodrat') === '1'); } catch(e){ return false; } };
const TEKKE = 900, HAMPOSHANI = 120;
const MANABE = {
  wikisource: { host: 'fa.wikisource.org', onvan: 'ویکی‌نبشته', emtiaz: 85, hoshdar: 'متن قانون از ویکی‌نبشته — ممکن است نسخهٔ پیشین یا اصلاح‌نشده باشد؛ برای استناد با متن رسمی تطبیق شود' },
  wikipedia:  { host: 'fa.wikipedia.org',  onvan: 'ویکی‌پدیای فارسی', emtiaz: 80, hoshdar: 'دانشنامهٔ آزاد — برای استناد رسمی به منبع اصلی مراجعه شود' },
};
/* موضوع‌های آغازین — اولویت ۱۰۰: موضوع پرونده‌ها */
const BOZOR_PARVANDE = [
  ['wikisource', 'قانون مدنی'], ['wikisource', 'قانون تجارت'], ['wikisource', 'قانون صدور چک'],
  ['wikisource', 'قانون ثبت اسناد و املاک'], ['wikisource', 'قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی'],
  ['wikisource', 'قانون مالیات‌های مستقیم'], ['wikisource', 'قانون پولی و بانکی کشور'], ['wikisource', 'قانون عملیات بانکی بدون ربا'],
  ['wikisource', 'قانون اجرای احکام مدنی'], ['wikisource', 'قانون نحوه اجرای محکومیت‌های مالی'],
  ['wikipedia', 'اعتبار اسنادی'], ['wikipedia', 'چک'], ['wikipedia', 'سفته'], ['wikipedia', 'برات'], ['wikipedia', 'ضمانت‌نامه بانکی'],
  ['wikipedia', 'سند رسمی'], ['wikipedia', 'اسناد لازم‌الاجرا'], ['wikipedia', 'دفتر اسناد رسمی'], ['wikipedia', 'وکالت'],
  ['wikipedia', 'اجرای ثبت'], ['wikipedia', 'خسارت تأخیر تأدیه'], ['wikipedia', 'وجه التزام'], ['wikipedia', 'اقرار'],
  ['wikipedia', 'بورس کالای ایران'], ['wikipedia', 'بانک ملت'], ['wikipedia', 'بانک مرکزی جمهوری اسلامی ایران'],
  ['wikipedia', 'شرکت سهامی عام'], ['wikipedia', 'هیئت مدیره'], ['wikipedia', 'مجمع عمومی'], ['wikipedia', 'ورشکستگی'],
  ['wikipedia', 'حسابداری'], ['wikipedia', 'ترازنامه'], ['wikipedia', 'صورت‌های مالی'], ['wikipedia', 'حسابرسی'],
  ['wikipedia', 'مالیات بر ارزش افزوده'], ['wikipedia', 'سازمان امور مالیاتی کشور'], ['wikipedia', 'بیمه'], ['wikipedia', 'اینکوترمز'],
  ['wikipedia', 'قوه قضاییه جمهوری اسلامی ایران'], ['wikipedia', 'سازمان بازرسی کل کشور'], ['wikipedia', 'دادگاه عمومی'], ['wikipedia', 'تجدیدنظرخواهی'],
];
/* اولویت ۴۰: دانش عمومی */
const BOZOR_OMOOMI = [
  'ایران', 'تاریخ ایران', 'جغرافیای ایران', 'اقتصاد ایران', 'زبان فارسی', 'دستور زبان فارسی', 'حقوق', 'اقتصاد', 'مدیریت',
  'ریاضیات', 'آمار', 'فیزیک', 'شیمی', 'زیست‌شناسی', 'پزشکی', 'رایانه', 'برنامه‌نویسی', 'هوش مصنوعی', 'شبکه رایانه‌ای',
  'پردازنده گرافیکی', 'اینترنت', 'فلسفه', 'منطق', 'تاریخ جهان', 'ادبیات فارسی',
];

let S = null, H = null;
let DB = null, DB_ERR = '';
const R = { on: false, timer: null, busy: false, gamha: 0, akharin: '', akharinAt: 0, khata: '', emb: { proc: null, ready: false, starting: null, pid: 0, err: '' } };

function log(m){ try { S.log('دانش: ' + m); } catch(e){} }
function ts(){ return new Date().toISOString(); }
function DBP(){ return path.join(S.HERE, 'پایگاه دانش.sqlite'); }
function MDIR(){ return path.join(S.HERE, 'موتور خوانش', 'مدل‌ها', 'دانش'); }
function LOGD(){ return path.join(S.HERE, 'موتور خوانش', 'گزارش'); }
function embFile(){ const f = path.join(MDIR(), EMB.file); try { return fs.statSync(f).size >= EMB.minBytes ? f : null; } catch(e){ return null; } }

/* یکسان‌سازی نوشتار برای جست‌وجو — محتوای ذخیره‌شده دست نمی‌خورد */
function norm(s){
  return String(s || '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإٱ]/g, 'ا').replace(/ؤ/g, 'و')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[‌‍‎‏]/g, ' ')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/* ---------------------- پایگاه ---------------------- */
function db(){
  if (DB) return DB;
  let sqlite; try { sqlite = require('node:sqlite'); } catch(e){ DB_ERR = 'node:sqlite در دسترس نیست'; return null; }
  try {
    DB = new sqlite.DatabaseSync(DBP());
    DB.exec('PRAGMA busy_timeout=20000;');
    DB.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS mowzoo(manba TEXT NOT NULL, onvan TEXT NOT NULL, olaviat INTEGER NOT NULL, omgh INTEGER NOT NULL DEFAULT 0,
        vaziat TEXT NOT NULL DEFAULT 'dar_saf', pedar TEXT, ts TEXT, PRIMARY KEY(manba, onvan));
      CREATE INDEX IF NOT EXISTS mowzoo_saf ON mowzoo(vaziat, olaviat DESC, omgh, ts);
      CREATE TABLE IF NOT EXISTS manba(url TEXT PRIMARY KEY, manba TEXT, onvan TEXT, emtiaz INTEGER, hoshdar TEXT, sha256 TEXT, tool INTEGER, olaviat INTEGER, ts TEXT);
      CREATE TABLE IF NOT EXISTS tekke(id INTEGER PRIMARY KEY, url TEXT NOT NULL, shomare INTEGER NOT NULL, matn TEXT NOT NULL, bordar BLOB, ts TEXT);
      CREATE INDEX IF NOT EXISTS tekke_url ON tekke(url);
      CREATE INDEX IF NOT EXISTS tekke_bibordar ON tekke(id) WHERE bordar IS NULL;
      CREATE VIRTUAL TABLE IF NOT EXISTS tekke_fts USING fts5(matn, tokenize='unicode61');`);
    return DB;
  } catch(e){ DB_ERR = e.message || String(e); DB = null; return null; }
}
/* ۱۴۰۵/۰۷/۰۲ دستور کارفرما: «کتابخانه … یعنی همون پایگاه دانش» — رونوشت جدای قوانین (همان ۴۸ قانون کتابخانه) به سطل زباله می‌رود؛
   این فایل از این پس فقط قفل و وضعیت مدل معنایی را نگه می‌دارد و میزبان از کتابخانهٔ حقوقی می‌خواند. */
function yekiShodan(){
  const d = db(); if (!d) return 'پایگاه باز نشد: ' + DB_ERR;
  if (mget('yeki_ketabkhane') === '1') return 'پیش‌تر یکی شده بود';
  const n = (d.prepare('SELECT COUNT(*) c FROM manba').get() || {}).c || 0;
  if (!n){ mset('yeki_ketabkhane', '1'); return 'رونوشتی نبود؛ یکی شد'; }
  const satl = path.join(S.HERE, '..', '..', 'سطل زباله', 'خانه کلود', 'سرور'); fs.mkdirSync(satl, { recursive: true });
  const nam = 'پایگاه دانش — رونوشت یکی‌شده با کتابخانه (برداشته ' + new Date().toISOString().slice(0, 10) + ')';
  try { d.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch(e){}
  try { d.close(); } catch(e){} DB = null;
  const jabeja = [];
  try {
    for (const pas of ['', '-wal', '-shm']){ const az = DBP() + pas; if (fs.existsSync(az)){ const be = path.join(satl, nam + '.sqlite' + pas); fs.renameSync(az, be); jabeja.push(be); } }
  } catch(e){ db(); return 'جابه‌جایی نشد (' + (e.code || e.message) + ')؛ چیزی تغییر نکرد' + (jabeja.length ? ' — بخشی جابه‌جا شد: ' + jabeja.join(' · ') : ''); }
  db(); mset('yeki_ketabkhane', '1');
  log('پایگاه دانش با کتابخانه یکی شد؛ رونوشت ' + n + ' منبعی به سطل زباله رفت');
  return 'یکی شد: رونوشت ' + n + ' منبعی به سطل زباله رفت ← ' + jabeja[0];
}
function mget(k){ const d = db(); if (!d) return ''; const r = d.prepare('SELECT v FROM meta WHERE k=?').get(k); return r ? r.v : ''; }
function mset(k, v){ const d = db(); if (d) d.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v)); }
function afzoodanMowzoo(manba, onvan, olaviat, omgh, pedar){
  const d = db(); if (!d || !MANABE[manba]) return false;
  onvan = String(onvan || '').trim(); if (!onvan || onvan.length > 200) return false;
  const r = d.prepare('INSERT INTO mowzoo(manba,onvan,olaviat,omgh,pedar,ts) VALUES(?,?,?,?,?,?) ON CONFLICT(manba,onvan) DO UPDATE SET olaviat=MAX(olaviat,excluded.olaviat) WHERE vaziat=\'dar_saf\'')
    .run(manba, onvan, Math.round(olaviat), omgh || 0, pedar || null, ts());
  return r.changes > 0;
}
function bazr(){
  const d = db(); if (!d) return;
  /* ۱۴۰۵/۰۷/۰۲ دستور کارفرما: ویکی‌پدیا و ویکی‌نبشته هرگز در پایگاه دانش نیستند؛ هیچ موضوع آغازینی از آن‌ها کاشته نمی‌شود */
  return;
  if (mget('bazr') === '1') return;
  for (const [m, t] of BOZOR_PARVANDE) afzoodanMowzoo(m, t, 100, 0, null);
  for (const t of BOZOR_OMOOMI) afzoodanMowzoo('wikipedia', t, 40, 0, null);
  mset('bazr', '1'); mset('naskhe', NASKHE); mset('sakht', ts());
}

/* ---------------------- شبکه ---------------------- */
function getJson(url, ms){
  return new Promise(resolve => {
    let done = false; const fin = v => { if (!done){ done = true; resolve(v); } };
    try {
      const req = https.get(url, { headers: { 'user-agent': UA, accept: 'application/json' }, timeout: ms || 20000 }, res => {
        if (res.statusCode !== 200){ res.resume(); return fin({ _code: res.statusCode }); }
        const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => { try { fin(JSON.parse(Buffer.concat(ch).toString('utf8'))); } catch(e){ fin({ _code: 'json' }); } });
        res.on('error', () => fin({ _code: 'net' }));
      });
      req.on('timeout', () => { req.destroy(); fin({ _code: 'timeout' }); });
      req.on('error', () => fin({ _code: 'net' }));
    } catch(e){ fin({ _code: 'net' }); }
  });
}
function api(manba, params){
  const q = Object.entries(Object.assign({ action: 'query', format: 'json', formatversion: '2' }, params)).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  return getJson('https://' + MANABE[manba].host + '/w/api.php?' + q);
}
async function daryaftSafhe(manba, onvan){
  const j = await api(manba, { titles: onvan, prop: 'extracts|info|links', explaintext: '1', redirects: '1', pllimit: 'max', plnamespace: '0', inprop: 'url' });
  if (!j || j._code) return { khata: 'شبکه (' + (j && j._code) + ')' };
  const p = j.query && j.query.pages && j.query.pages[0];
  if (!p || p.missing || p.invalid) return { nist: true };
  let links = (p.links || []).map(l => l.title);
  let cont = j.continue && j.continue.plcontinue, n = 0;
  while (cont && n < 5){
    const k = await api(manba, { titles: p.title, prop: 'links', redirects: '1', pllimit: 'max', plnamespace: '0', plcontinue: cont });
    if (!k || k._code) break;
    const q = k.query && k.query.pages && k.query.pages[0]; links = links.concat(((q && q.links) || []).map(l => l.title));
    cont = k.continue && k.continue.plcontinue; n++;
  }
  return { onvan: p.title, url: p.fullurl || ('https://' + MANABE[manba].host + '/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_'))), matn: String(p.extract || ''), links, abham: /ابهام‌زدایی|\(ابهام/.test(p.title) };
}
async function jostojooManba(manba, onvan){
  const j = await api(manba, { list: 'search', srsearch: onvan, srlimit: '3', srnamespace: '0' });
  if (!j || j._code || !j.query) return [];
  return (j.query.search || []).map(s => s.title);
}

/* ---------------------- تکه‌سازی ---------------------- */
function tekkeha(matn){
  const bandha = String(matn || '').replace(/\r/g, '').split(/\n{1,}/).map(x => x.trim()).filter(x => x.length > 1);
  const out = []; let cur = '';
  for (const b of bandha){
    if (/^=+.*=+$/.test(b)) continue;
    if ((cur + '\n' + b).length > TEKKE && cur){ out.push(cur); cur = cur.slice(-HAMPOSHANI) + '\n' + b; }
    else cur = cur ? cur + '\n' + b : b;
    while (cur.length > TEKKE * 1.6){ out.push(cur.slice(0, TEKKE)); cur = cur.slice(TEKKE - HAMPOSHANI); }
  }
  if (cur.trim().length > 40) out.push(cur);
  return out;
}

/* ---------------------- مدل معنایی (llama-server --embedding) ---------------------- */
async function startEmb(){
  const E = R.emb;
  if (E.ready) return true;
  if (E.starting) return E.starting;
  E.starting = (async () => {
    const h0 = await H.httpGet(PORT_EMB, '/health'); if (h0 && h0.status === 200){ E.ready = true; return true; }
    /* در حال بار شدن یا در دست نمونهٔ دیگر سرور: نسخهٔ دوم ساخته نمی‌شود */
    if (h0 || malekDigar()){
      for (let i = 0; i < 60; i++){ const h = await H.httpGet(PORT_EMB, '/health'); if (h && h.status === 200){ E.ready = true; return true; } if (!h && !malekDigar()) break; await new Promise(r => setTimeout(r, 1000)); }
      if (malekDigar()) { E.err = 'مدل معنایی در دست نمونهٔ دیگر سرور است'; return false; }
    }
    const f = embFile(); if (!f){ E.err = 'مدل معنایی هنوز نصب نیست (' + EMB.file + ')'; return false; }
    const p = H.pickExe(); if (!p){ E.err = 'llama.cpp نیست'; return false; }
    /* با تنظیم danesh_kart (مثلاً Vulkan1) مدل معنایی روی کارت گرافیک می‌رود تا پردازنده برای خوانش آزاد بماند */
    const kart = (S.metaGet && S.metaGet('danesh_kart')) || '';
    const exe = path.join(path.dirname(path.dirname(p.exe)), kart ? 'vulkan' : 'cpu', path.basename(p.exe));
    const bin = fs.existsSync(exe) ? exe : p.exe;
    try { H.ensureRuntimeDlls(path.dirname(bin)); } catch(e){}
    try { fs.mkdirSync(LOGD(), { recursive: true }); } catch(e){}
    let out = null; try { out = fs.openSync(path.join(LOGD(), 'پایگاه دانش.log'), 'a'); } catch(e){}
    const args = ['-m', f, '--embedding', '--pooling', 'cls', '--host', '127.0.0.1', '--port', String(PORT_EMB), '-c', '4096', '-b', '4096', '-ub', '4096', '--parallel', '1', '-t', tg() ? '6' : '2', '-ngl', kart ? '99' : '0'].concat(kart ? ['--device', kart] : []);
    const proc = spawn(bin, args, { cwd: path.dirname(bin), windowsHide: true, stdio: ['ignore', out !== null ? out : 'ignore', out !== null ? out : 'ignore'] });
    E.proc = proc; E.pid = proc.pid; mset('emb_pid', proc.pid);
    if (!tg()) { try { os.setPriority(proc.pid, os.constants.priority.PRIORITY_LOW); } catch(e){} }
    let exited = false; proc.on('exit', c => { exited = true; if (E.proc === proc){ E.proc = null; E.ready = false; } log('مدل معنایی بسته شد (کد ' + c + ')'); });
    proc.on('error', e => { exited = true; E.err = e.code || e.message; });
    const t0 = Date.now();
    while (Date.now() - t0 < 300000){
      if (exited){ E.err = 'مدل معنایی هنگام بالا آمدن بسته شد (گزارش: پایگاه دانش.log)'; return false; }
      const h = await H.httpGet(PORT_EMB, '/health'); if (h && h.status === 200){ E.ready = true; E.err = ''; log('مدل معنایی آماده در ' + Math.round((Date.now() - t0) / 1000) + ' ثانیه'); return true; }
      await new Promise(r => setTimeout(r, 1000));
    }
    try { proc.kill(); } catch(e){} H.killPid(proc.pid); E.err = 'مدل معنایی در ۵ دقیقه آماده نشد'; return false;
  })();
  try { return await E.starting; } finally { E.starting = null; }
}
function stopEmb(){
  const E = R.emb, p = E.proc; E.proc = null; E.ready = false;
  if (p){ try { p.kill(); } catch(e){} H.killPid(p.pid); }
  if (malekDigar()) return;   // مدلِ نمونهٔ دیگر دست نمی‌خورد
  try { const pid = +mget('emb_pid') || 0; if (pid && (!p || pid !== p.pid)) H.killPid(pid); mset('emb_pid', ''); } catch(e){}
  try { db().prepare("UPDATE meta SET v='' WHERE k='qofl' AND v LIKE ?").run(process.pid + '|%'); } catch(e){}
}
function postJson(port, p, obj, ms){
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(obj));
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', agent: false, headers: { 'content-type': 'application/json', 'content-length': data.length, connection: 'close' } }, res => {
      const ch = []; res.on('data', c => ch.push(c));
      res.on('end', () => { const s = Buffer.concat(ch).toString('utf8'); if (res.statusCode !== 200) return reject(new Error('کد ' + res.statusCode + ': ' + s.slice(0, 200))); try { resolve(JSON.parse(s)); } catch(e){ reject(new Error('پاسخ JSON نبود')); } });
    });
    req.setTimeout(ms || 300000, () => req.destroy(new Error('مهلت مدل معنایی تمام شد')));
    req.on('error', reject); req.end(data);
  });
}
async function bordarha(matnha){
  const j = await postJson(PORT_EMB, '/v1/embeddings', { model: 'danesh', input: matnha });
  const arr = (j.data || []).sort((a, b) => a.index - b.index).map(x => x.embedding);
  if (arr.length !== matnha.length) throw new Error('شمار بردارها ناهمخوان است');
  return arr.map(v => {
    const f = Float32Array.from(v); let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i];
    s = Math.sqrt(s) || 1; for (let i = 0; i < f.length; i++) f[i] /= s;
    return f;
  });
}
function toBlob(f){ return Buffer.from(f.buffer, f.byteOffset, f.byteLength); }
function fromBlob(b){ const u = new Uint8Array(b); const c = new ArrayBuffer(u.length); new Uint8Array(c).set(u); return new Float32Array(c); }
/* پرکردن بردارهای مانده — دسته‌های کوچک */
async function takmilBordar(had){
  const d = db(); if (!d) return 0;
  if (!(await startEmb())) return 0;
  const rows = d.prepare('SELECT id, matn FROM tekke WHERE bordar IS NULL ORDER BY id LIMIT ?').all(had || 16);
  if (!rows.length) return 0;
  const vs = await bordarha(rows.map(r => r.matn));
  const up = d.prepare('UPDATE tekke SET bordar=? WHERE id=?');
  d.exec('BEGIN'); try { rows.forEach((r, i) => up.run(toBlob(vs[i]), r.id)); d.exec('COMMIT'); } catch(e){ d.exec('ROLLBACK'); throw e; }
  return rows.length;
}

/* ---------------------- یک گام مطالعه ---------------------- */
function nobatBadi(){
  const d = db(); if (!d) return null;
  return d.prepare("SELECT manba, onvan, olaviat, omgh FROM mowzoo WHERE vaziat='dar_saf' ORDER BY olaviat DESC, omgh ASC, ts ASC LIMIT 1").get() || null;
}
function vaziatMowzoo(m, onvan, v){ const d = db(); if (d) d.prepare('UPDATE mowzoo SET vaziat=?, ts=? WHERE manba=? AND onvan=?').run(v, ts(), m, onvan); }
async function gam(){
  const d = db(); if (!d) throw new Error(DB_ERR || 'پایگاه باز نشد');
  /* اول بردارهای مانده (اگر مدل معنایی آماده است) */
  if (embFile()){ try { const n = await takmilBordar(16); if (n){ R.akharin = 'بردار ' + n + ' تکه'; R.khata = ''; seri(); if (tg()) R.tond = true; return; } } catch(e){ R.khata = 'بردار: ' + e.message; } }
  const t = nobatBadi(); if (!t){ R.akharin = 'صف موضوع خالی است'; return; }
  if (t.manba === 'wikipedia' || t.manba === 'wikisource'){ vaziatMowzoo(t.manba, t.onvan, 'kenar'); R.akharin = 'ویکی‌پدیا/ویکی‌نبشته کنار گذاشته شده (دستور کارفرما)'; R.tond = true; return; }
  /* ۱۴۰۵/۰۷/۰۲: متن قانونی که نسخهٔ رسمی‌اش در کتابخانهٔ حقوقی (مرکز پژوهش‌های مجلس) هست از ویکی‌نبشته دوباره خوانده نمی‌شود — تکراری و کم‌اعتبارتر */
  if (t.manba === 'wikisource'){ try { const KB = require('./ketabkhane.js'); if (KB.hast && KB.hast(t.onvan)){ vaziatMowzoo(t.manba, t.onvan, 'dar_ketabkhane'); R.akharin = t.onvan + ' ← متن رسمی در کتابخانهٔ حقوقی هست'; R.khata = ''; R.tond = true; return; } } catch(e){} }
  const m = MANABE[t.manba];
  const s = await daryaftSafhe(t.manba, t.onvan);
  if (s.khata){ R.khata = t.onvan + ': ' + s.khata; return; }            // در صف می‌ماند؛ گام بعد دوباره
  if (s.nist){
    const hamanand = await jostojooManba(t.manba, t.onvan);
    for (const h of hamanand) afzoodanMowzoo(t.manba, h, t.olaviat - 1, t.omgh, t.onvan);
    vaziatMowzoo(t.manba, t.onvan, hamanand.length ? 'jaygozin' : 'nayaft');
    R.akharin = t.onvan + ' ← ' + (hamanand.length ? 'جایگزین: ' + hamanand.join('، ') : 'یافت نشد');
    return;
  }
  if (s.onvan !== t.onvan) afzoodanMowzoo(t.manba, s.onvan, t.olaviat, t.omgh, t.onvan) && vaziatMowzoo(t.manba, s.onvan, 'khande');
  const sha = crypto.createHash('sha256').update(s.matn).digest('hex');
  const pishin = d.prepare('SELECT sha256 FROM manba WHERE url=?').get(s.url);
  let n = 0;
  if (!pishin || pishin.sha256 !== sha){
    const parts = s.matn.length >= 80 && !s.abham ? tekkeha(s.matn) : [];
    d.exec('BEGIN');
    try {
      const old = d.prepare('SELECT id FROM tekke WHERE url=?').all(s.url);
      const delF = d.prepare('DELETE FROM tekke_fts WHERE rowid=?'); for (const o of old) delF.run(o.id);
      d.prepare('DELETE FROM tekke WHERE url=?').run(s.url);
      const ins = d.prepare('INSERT INTO tekke(url, shomare, matn, ts) VALUES(?,?,?,?)');
      const insF = d.prepare('INSERT INTO tekke_fts(rowid, matn) VALUES(?,?)');
      parts.forEach((p, i) => { const r = ins.run(s.url, i, p, ts()); insF.run(Number(r.lastInsertRowid), norm(s.onvan + ' — ' + p)); n++; });
      d.prepare('INSERT INTO manba(url,manba,onvan,emtiaz,hoshdar,sha256,tool,olaviat,ts) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET onvan=excluded.onvan, sha256=excluded.sha256, tool=excluded.tool, ts=excluded.ts')
        .run(s.url, t.manba, s.onvan, m.emtiaz, m.hoshdar, sha, s.matn.length, t.olaviat, ts());
      d.exec('COMMIT');
    } catch(e){ d.exec('ROLLBACK'); throw e; }
  }
  vaziatMowzoo(t.manba, t.onvan, 'khande');
  /* پیوندها ← موضوع تازه با اولویت کمتر؛ زیرصفحه‌های همان سند (مثلاً مواد یک قانون) هم‌اولویت */
  let tazeh = 0;
  const saghf = t.olaviat >= 100 ? 3 : 6;
  if (t.omgh < saghf){
    for (const l of s.links.slice(0, 400)){
      if (/^(فهرست|رده:|الگو:|ویکی‌پدیا:|پرونده:)/.test(l)) continue;
      const zir = l.startsWith(s.onvan + '/');
      if (tg() && !zir) continue;   /* ۱۴۰۵/۰۷/۰۲: در حالت تمام‌قدرت صف بزرگ نمی‌شود (فقط زیرصفحه‌های همان سند) تا مرحلهٔ آموزش پایان‌پذیر باشد */
      /* زیرصفحهٔ همان سند هم‌اولویت؛ قانون دیگر (ویکی‌نبشته) کمی پایین‌تر؛ پیوند دانشنامه از موضوع پرونده ۵۰ (کمی بالاتر از عمومی) — تا صف پرونده‌ها با پیوندهای کم‌ربط باد نکند */
      const ol = zir ? t.olaviat : (t.manba === 'wikisource' ? Math.max(1, t.olaviat - 12) : Math.max(1, Math.min(t.olaviat - 30, t.olaviat >= 100 ? 50 : t.olaviat - 30)));
      if (afzoodanMowzoo(t.manba, l, ol, zir ? t.omgh : t.omgh + 1, s.onvan)) tazeh++;
    }
  }
  R.gamha++; mset('gamha', (+mget('gamha') || 0) + 1); seri();
  R.akharin = m.onvan + ' · ' + s.onvan + ' · ' + n + ' تکه · ' + tazeh + ' موضوع تازه';
  R.khata = '';
}
/* قفل: اگر دو نمونهٔ سرور (برنامهٔ Claude و اجرای مستقل) هم‌زمان باز باشند، فقط یکی مطالعه می‌کند */
function qofl(){
  try {
    const d = db(), now = Date.now();
    d.prepare("INSERT OR IGNORE INTO meta(k,v) VALUES('qofl', '')").run();
    return d.prepare("UPDATE meta SET v=? WHERE k='qofl' AND (v='' OR v LIKE ? OR CAST(substr(v, instr(v,'|')+1) AS INTEGER) < ?)").run(process.pid + '|' + now, process.pid + '|%', now - 120000).changes === 1;
  } catch(e){ return false; }
}
/* منحنی رشد پایگاه دانش: هر ۱۰ دقیقه یک نقطه (منابع، تکه‌ها، بردارها) */
function seri(){
  try {
    let a = []; try { a = JSON.parse(mget('seri') || '[]'); } catch(e){}
    const now = Date.now(); if (a.length && now - a[a.length - 1].t < 600000) return;
    const d = db();
    a.push({ t: now, manabe: d.prepare('SELECT COUNT(*) c FROM manba').get().c, tekke: d.prepare('SELECT COUNT(*) c FROM tekke').get().c, bordar: d.prepare('SELECT COUNT(*) c FROM tekke WHERE bordar IS NOT NULL').get().c });
    if (a.length > 200) a = a.slice(-200);
    mset('seri', JSON.stringify(a));
  } catch(e){}
}
function seriGet(){ try { return JSON.parse(mget('seri') || '[]'); } catch(e){ return []; } }
function malekDigar(){ try { const v = String(mget('qofl') || '').split('|'); const pid = +v[0] || 0, t = +v[1] || 0; return pid && pid !== process.pid && Date.now() - t < 120000 ? pid : 0; } catch(e){ return 0; } }
/* ضربان مالک (گام‌های بلند قفل را از دست ندهند) و انتشار وضعیت برای نمونه‌های دیگر و پنل */
setInterval(() => { try { if (R.on && !malekDigar()) { qofl(); mset('vaziat_zende', JSON.stringify({ pid: process.pid, t: Date.now(), busy: R.busy, akharin: R.akharin, akharinAt: R.akharinAt, khata: R.khata, emb: R.emb.ready })); } } catch(e){} }, 15000).unref();
async function halghe(){
  if (!R.on || R.busy) return;
  if (mget('auto') !== '1'){ R.on = false; stopEmb(); log('مطالعه از نمونهٔ دیگر سرور خاموش شد'); return; }
  try { const t = +(S.metaGet('mizban_dar_kar') || 0); if (t && Date.now() - t < 300000){ R.timer = setTimeout(halghe, 5000); return; } } catch(e){}   /* میزبان در حال پاسخ است */
  /* دستور کارفرما ۱۴۰۵/۰۶/۲۶: هنگام «نخست خوانش همهٔ اسناد» همهٔ توان به خوانش — مطالعه موقتاً می‌ایستد و پس از آن خودش ادامه می‌یابد */
  try { const v = String(S.metaGet('saf_malek') || '').split('|'); const tazeh = +v[0] && Date.now() - (+v[1] || 0) < 60000; if (tazeh && (S.metaGet('saf_halat') || '') === 'khanesh'){ if (R.emb.proc) stopEmb(); R.akharin = 'مکث: همهٔ توان رایانه به خوانش اسناد داده شده (پس از پایان خوانش ادامه می‌یابد)'; R.akharinAt = Date.now(); R.timer = setTimeout(halghe, 60000); return; } } catch(e){}
  R.busy = true;
  try { if (qofl()) await gam(); else { const pid = malekDigar(); R.akharin = pid ? 'مطالعه در نمونهٔ دیگر سرور (فرایند ' + pid + ')' : 'در انتظار قفل'; } } catch(e){ R.khata = e.message || String(e); log('گام: ' + R.khata); }
  finally { R.busy = false; R.akharinAt = Date.now(); if (R.on){ const bad = R.tond ? 50 : /\(429\)/.test(R.khata || '') ? 60000 : tg() ? 4000 : GAM_MS; R.tond = false; R.timer = setTimeout(halghe, bad); } }
}

/* ---------------------- جست‌وجو ---------------------- */
function ftsQuery(q){
  const w = norm(q).split(/[^\p{L}\p{N}]+/u).filter(x => x.length > 1).slice(0, 12);
  return w.map(x => '"' + x.replace(/"/g, '') + '"').join(' OR ');
}
async function jostojoo(q, had){
  const d = db(); if (!d) return { khata: DB_ERR || 'پایگاه باز نشد', natayej: [] };
  had = Math.max(1, Math.min(+had || 6, 20));
  const score = new Map();
  const fq = ftsQuery(q);
  if (fq){
    try {
      const rows = d.prepare('SELECT rowid AS id, bm25(tekke_fts) AS b FROM tekke_fts WHERE tekke_fts MATCH ? ORDER BY b LIMIT 40').all(fq);
      rows.forEach((r, i) => score.set(r.id, (score.get(r.id) || 0) + 1 / (60 + i)));
    } catch(e){}
  }
  let manaei = false;
  if (R.emb.ready || (embFile() && await startEmb())){
    try {
      const [qv] = await bordarha([String(q).slice(0, 2000)]);
      const top = [];
      for (const r of d.prepare('SELECT id, bordar FROM tekke WHERE bordar IS NOT NULL').iterate()){
        const v = fromBlob(r.bordar); let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * qv[i];
        if (top.length < 40 || s > top[top.length - 1].s){ top.push({ id: r.id, s }); top.sort((a, b) => b.s - a.s); if (top.length > 40) top.pop(); }
      }
      top.forEach((r, i) => score.set(r.id, (score.get(r.id) || 0) + 1 / (60 + i)));
      manaei = true;
    } catch(e){ R.khata = 'جست‌وجوی معنایی: ' + e.message; }
  }
  const ids = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, had).map(x => x[0]);
  const get = d.prepare('SELECT t.id, t.matn, t.shomare, m.url, m.onvan, m.emtiaz, m.hoshdar, m.manba, m.ts FROM tekke t JOIN manba m ON m.url=t.url WHERE t.id=?');
  const natayej = ids.map(id => get.get(id)).filter(Boolean).map(r => ({ onvan: r.onvan, manba: MANABE[r.manba] ? MANABE[r.manba].onvan : r.manba === 'ketabkhane' ? 'کتابخانهٔ حقوقی (متن رسمی)' : r.manba, url: r.url, emtiaz: r.emtiaz, hoshdar: r.hoshdar, tarikh: r.ts, matn: r.matn }));
  return { q, manaei, natayej };
}
function matnNatayej(r){
  if (r.khata) return 'خطا: ' + r.khata;
  if (!r.natayej.length) return 'در پایگاه دانش چیزی یافت نشد' + (r.manaei ? '' : ' (جست‌وجوی معنایی هنوز آماده نیست؛ فقط واژه‌ای)') + '.';
  return r.natayej.map((x, i) => (i + 1) + ') [' + x.manba + ' · اعتبار ' + x.emtiaz + '] ' + x.onvan + '\n' + x.url + '\n⚠ ' + x.hoshdar + '\n' + x.matn).join('\n\n');
}

/* ---------------------- از کتابخانهٔ حقوقی (۱۴۰۵/۰۷/۰۲ به دستور کارفرما) ----------------------
   قوانین هدف زبانهٔ «قوانین ایران»: متن رسمی از کتابخانهٔ حقوقی (همان دادهٔ خود سیستم) به پایگاه دانش می‌آید؛
   بردارها از نمایهٔ معنایی کتابخانه رونوشت می‌شود و دوباره محاسبه نمی‌شود. */
const HOSHDAR_KETAB = 'متن رسمی از کتابخانهٔ حقوقی (مرکز پژوهش‌های مجلس)؛ نشانی منبع کنار آن است';
function azKetabkhane(m, tk){
  const d = db(); if (!d || !m || !m.url || !Array.isArray(tk) || !tk.length) return false;
  /* یکتایی (دستور کارفرما ۱۴۰۵/۰۷/۰۲): متنی که با همین اثر انگشت از نشانی دیگری در پایگاه دانش هست، دوباره وارد نمی‌شود */
  if (m.sha && d.prepare('SELECT 1 FROM manba WHERE sha256=? AND url<>? LIMIT 1').get(m.sha, m.url)) return true;
  d.exec('BEGIN');
  try {
    const old = d.prepare('SELECT id FROM tekke WHERE url=?').all(m.url);
    const delF = d.prepare('DELETE FROM tekke_fts WHERE rowid=?'); for (const o of old) delF.run(o.id);
    d.prepare('DELETE FROM tekke WHERE url=?').run(m.url);
    const ins = d.prepare('INSERT INTO tekke(url, shomare, matn, bordar, ts) VALUES(?,?,?,?,?)');
    const insF = d.prepare('INSERT INTO tekke_fts(rowid, matn) VALUES(?,?)');
    tk.forEach(x => { const r = ins.run(m.url, x.shomare, x.matn, x.bordar || null, ts()); insF.run(Number(r.lastInsertRowid), norm(m.onvan + (x.madde ? ' — ' + x.madde : '') + ' — ' + x.matn)); });
    d.prepare('INSERT INTO manba(url,manba,onvan,emtiaz,hoshdar,sha256,tool,olaviat,ts) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET manba=excluded.manba, onvan=excluded.onvan, emtiaz=excluded.emtiaz, hoshdar=excluded.hoshdar, sha256=excluded.sha256, tool=excluded.tool, ts=excluded.ts')
      .run(m.url, 'ketabkhane', m.onvan, 100, HOSHDAR_KETAB, m.sha || '', m.hajm || 0, 100, ts());
    d.exec('COMMIT'); return true;
  } catch(e){ d.exec('ROLLBACK'); throw e; }
}
/* بردن یک منبع (و همهٔ تکه‌هایش) به «سطل» درون پایگاه دانش — مثلاً وقتی تکراری از آب درآمد؛ هیچ چیز از بین نمی‌رود */
function bebarSatl(url, dalil){
  const d = db(); if (!d || !url) return false;
  d.exec('CREATE TABLE IF NOT EXISTS satl_manba(url TEXT, dalil TEXT, radif TEXT, tekkeha TEXT, ts TEXT)');
  const radif = d.prepare('SELECT * FROM manba WHERE url=?').get(url); if (!radif) return false;
  const tk = d.prepare('SELECT id, shomare, matn FROM tekke WHERE url=? ORDER BY shomare').all(url);
  d.exec('BEGIN');
  try {
    d.prepare('INSERT INTO satl_manba(url, dalil, radif, tekkeha, ts) VALUES(?,?,?,?,?)').run(url, dalil || '', JSON.stringify(radif), JSON.stringify(tk.map(x => ({ shomare: x.shomare, matn: x.matn }))), ts());
    const delF = d.prepare('DELETE FROM tekke_fts WHERE rowid=?'); for (const x of tk) delF.run(x.id);
    d.prepare('DELETE FROM tekke WHERE url=?').run(url); d.prepare('DELETE FROM manba WHERE url=?').run(url);
    d.exec('COMMIT'); return true;
  } catch(e){ d.exec('ROLLBACK'); throw e; }
}
/* منابع تکراری که پیش از یکتایی آمده بودند (همان اثر انگشت، نشانی دیگر) ← سطل */
function yektaDanesh(){
  const d = db(); if (!d) return 0; let n = 0;
  for (const r of d.prepare("SELECT url, sha256 FROM manba WHERE manba='ketabkhane' AND sha256<>'' AND rowid NOT IN (SELECT MIN(rowid) FROM manba WHERE sha256<>'' GROUP BY sha256)").all()){ if (bebarSatl(r.url, 'تکراری (اثر انگشت یکسان)')) n++; }
  return n;
}
function bordarAzKetabkhane(fn){
  const d = db(); if (!d) return 0; let n = 0;
  const rows = d.prepare("SELECT t.id, t.url, t.shomare FROM tekke t JOIN manba m ON m.url=t.url WHERE m.manba='ketabkhane' AND t.bordar IS NULL LIMIT 2000").all();
  const up = d.prepare('UPDATE tekke SET bordar=? WHERE id=?');
  for (const r of rows){ const b = fn(r.url, r.shomare); if (b){ up.run(b, r.id); n++; } }
  return n;
}

/* ---------------------- آمار و فرمان ---------------------- */
function amar(){
  const d = db(); if (!d) return null;
  const one = (sql, ...a) => { try { const r = d.prepare(sql).get(...a); return r ? Object.values(r)[0] : 0; } catch(e){ return 0; } };
  return {
    manabe: one('SELECT COUNT(*) FROM manba'), tekke: one('SELECT COUNT(*) FROM tekke'), bordar: one('SELECT COUNT(*) FROM tekke WHERE bordar IS NOT NULL'),
    saf: one("SELECT COUNT(*) FROM mowzoo WHERE vaziat='dar_saf'"), safParvande: one("SELECT COUNT(*) FROM mowzoo WHERE vaziat='dar_saf' AND olaviat>=60"),
    khande: one("SELECT COUNT(*) FROM mowzoo WHERE vaziat='khande'"), nayaft: one("SELECT COUNT(*) FROM mowzoo WHERE vaziat='nayaft'"),
    ghavanin: one("SELECT COUNT(*) FROM manba WHERE manba='ketabkhane'"), hajm: (() => { try { return fs.statSync(DBP()).size; } catch(e){ return 0; } })(),
    gamha: +mget('gamha') || 0,
    darKetabkhane: one("SELECT COUNT(*) FROM mowzoo WHERE vaziat='dar_ketabkhane'"),
  };
}
function state(){
  const a = amar() || {};
  const digar = malekDigar();
  if (digar){ try { const z = JSON.parse(mget('vaziat_zende') || 'null'); if (z && z.pid === digar) return Object.assign({ naskhe: NASKHE, on: R.on || mget('auto') === '1', auto: mget('auto') === '1', busy: z.busy, akharin: z.akharin, akharinAt: z.akharinAt, khata: z.khata, nemoone: digar,
    emb: { ready: !!z.emb, nasb: !!embFile(), err: '', model: EMB.title, port: PORT_EMB } }, a); } catch(e){} }
  return Object.assign({ naskhe: NASKHE, on: R.on, auto: mget('auto') === '1', busy: R.busy, akharin: R.akharin, akharinAt: R.akharinAt, khata: R.khata,
    emb: { ready: R.emb.ready, nasb: !!embFile(), err: R.emb.err, model: EMB.title, port: PORT_EMB } }, a);
}
function statusLine(){
  const s = state(); const h = n => (S && S.human) ? S.human(n) : n + ' B';
  if (mget('yeki_ketabkhane') === '1'){ let k = ''; try { k = require('./ketabkhane.js').statusLine(); } catch(e){} return 'پایگاه دانش = کتابخانهٔ حقوقی (به دستور کارفرما ۱۴۰۵/۰۷/۰۲ یکی شد): میزبان پیش از هر پاسخ از همین کتابخانه (واژه‌ای + معنایی) می‌خواند؛ رونوشت جدای پیشین در سطل زباله است.\nمدل معنایی (' + EMB.title + '): ' + (s.emb.ready ? '🟢 روشن (درگاه ' + PORT_EMB + ')' : (s.emb.nasb ? '⚪ نصب‌شده، خاموش' : '⬇ هنوز نصب نیست')) + '\n' + k; }
  return [
    'پایگاه دانش ' + NASKHE + ': ' + (s.on ? '🟢 مطالعه روشن' : '⚪ مطالعه خاموش') + (s.busy ? ' (در گام)' : ''),
    'منابع خوانده‌شده: ' + (s.manabe || 0) + ' (متن قانون: ' + (s.ghavanin || 0) + ') · تکه‌ها: ' + (s.tekke || 0) + ' · با بردار معنایی: ' + (s.bordar || 0) + ' · حجم: ' + h(s.hajm || 0),
    'صف موضوع: ' + (s.saf || 0) + ' (موضوع پرونده‌ها: ' + (s.safParvande || 0) + ') · خوانده: ' + (s.khande || 0) + ' · یافت‌نشده: ' + (s.nayaft || 0) + ' · گام‌ها: ' + (s.gamha || 0),
    'مدل معنایی (' + EMB.title + '): ' + (s.emb.ready ? '🟢 روشن (درگاه ' + PORT_EMB + ')' : (s.emb.nasb ? '⚪ نصب‌شده، خاموش' : '⬇ هنوز نصب نیست')) + (s.emb.err ? ' — ' + s.emb.err : ''),
    'آخرین گام: ' + (s.akharin || '—') + (s.khata ? '\n⚠ ' + s.khata : ''),
  ].join('\n');
}
function roshan(){
  if (!db()) return 'پایگاه دانش باز نشد: ' + DB_ERR;
  bazr(); mset('auto', '1');
  if (!R.on){ R.on = true; R.timer = setTimeout(halghe, 1000); log('مطالعهٔ بی‌وقفه روشن شد'); }
  return statusLine();
}
function khamoosh(){
  R.on = false; if (R.timer){ clearTimeout(R.timer); R.timer = null; }
  mset('auto', '0'); stopEmb(); log('مطالعهٔ بی‌وقفه خاموش شد');
  return statusLine();
}
function init(shared, helpers){
  S = shared; H = helpers;
  try { db(); const pid = +mget('emb_pid') || 0; if (pid && !malekDigar()){ H.killPid(pid); mset('emb_pid', ''); } } catch(e){}
  if (mget('auto') === '1') setTimeout(() => { try { roshan(); log('مطالعه از پیش روشن بود — ادامه یافت'); } catch(e){ log('آغاز: ' + e.message); } }, 8000);
}
function stopAll(){ R.on = false; if (R.timer) clearTimeout(R.timer); stopEmb(); }

const TOOLS = [{
  name: 'danesh', title: 'پایگاه دانش میزبان',
  description: 'پایگاه دانش میزبان شخصی — به دستور کارفرما (۱۴۰۵/۰۷/۰۲) فقط از داده‌های خود سیستم؛ ویکی‌پدیا و ویکی‌نبشته هرگز منبع نیستند و هر چه از آن‌ها بود به سطل زباله رفت. amal=vaziat · amal=roshan (آغاز مطالعه؛ پس از بازراه‌اندازی سرور ادامه می‌یابد) · amal=khamoosh · amal=jostojoo با q (جست‌وجوی واژه‌ای + معنایی، با منبع و نمرهٔ اعتبار) · amal=afzoodan با onvan و manba (wikipedia|wikisource) و olaviat (پیش‌فرض ۹۰) برای افزودن موضوع به صف.',
  inputSchema: { type: 'object', properties: { amal: { type: 'string' }, q: { type: 'string' }, had: { type: 'number' }, onvan: { type: 'string' }, manba: { type: 'string' }, olaviat: { type: 'number' } }, required: ['amal'], additionalProperties: false },
  async run(a){
    a = a || {};
    const amal = String(a.amal || 'vaziat');
    if (amal === 'vaziat') return S.ok(statusLine());
    if (amal === 'roshan') return S.ok(roshan());
    if (amal === 'khamoosh') return S.ok(khamoosh());
    if (amal === 'yeki') return S.ok(yekiShodan());
    if (amal === 'jostojoo' && mget('yeki_ketabkhane') === '1'){ if (!a.q) return S.fail('q لازم است'); const KB = require('./ketabkhane.js'); return S.ok(KB.matnNatayej(await KB.jostojoo(a.q, a.had || 8))); }
    if (amal === 'jostojoo'){ if (!a.q) return S.fail('q لازم است'); bazr(); return S.ok(matnNatayej(await jostojoo(a.q, a.had))); }
    if (amal === 'afzoodan'){
      if (!a.manba || a.manba === 'wikipedia' || a.manba === 'wikisource') return S.fail('به دستور کارفرما ویکی‌پدیا و ویکی‌نبشته منبع پایگاه دانش نیستند؛ پایگاه دانش فقط از داده‌های خود سیستم ساخته می‌شود.');
      const m = MANABE[a.manba] ? a.manba : 'wikipedia'; if (!a.onvan) return S.fail('onvan لازم است');
      bazr(); const onvan = String(a.onvan).trim();
      const pish = db().prepare('SELECT vaziat FROM mowzoo WHERE manba=? AND onvan=?').get(m, onvan);
      const ok = afzoodanMowzoo(m, onvan, Math.max(1, Math.min(+a.olaviat || 90, 150)), 0, 'کارفرما');
      if (pish && pish.vaziat !== 'dar_saf') return S.ok('این موضوع پیش‌تر خوانده شده است: ' + onvan + ' (' + pish.vaziat + ')');
      return S.ok(ok ? (pish ? 'در صف بود؛ اولویتش بالا رفت: ' : 'به صف مطالعه افزوده شد: ') + onvan + ' (' + MANABE[m].onvan + ')' : 'نامعتبر: ' + onvan);
    }
    return S.fail('amal ناشناخته: ' + amal);
  }
}];

module.exports = { NASKHE, seriGet, azKetabkhane, bordarAzKetabkhane, bebarSatl, yektaDanesh, init, roshan, khamoosh, state, stopEmb, statusLine, jostojoo, matnNatayej, stopAll, TOOLS, PORT_EMB, EMB, startEmb, bordarha, _test: { qofl, malekDigar, tekkeha, norm, ftsQuery, daryaftSafhe, gam, bazr, db, R, afzoodanMowzoo } };
