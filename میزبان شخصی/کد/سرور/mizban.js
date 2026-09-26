/* =====================================================================
   میزبان شخصی آفلاین — «برنامهٔ شخصی» کارفرما (دستور ۱۴۰۵/۰۶/۲۴)
   پروژه: شرکت طلوع فردای ایرانیان — تهیه و تنظیم: محمدعلی کریمی‌پور
   ---------------------------------------------------------------------
   · یک مدل زبانی بازِ ۱۲ میلیاردی (Gemma 4 12B، وزن‌های رسمی QAT) روی llama.cpp، بی‌اینترنت، بی‌توکن.
   · رابط گفتگوی وب محلی (فارسی، راست‌به‌چپ) روی http://127.0.0.1:8795 — همین سرور آن را می‌دهد.
   · مدل با «ابزار» به لایهٔ دو وصل است: جست‌وجو در متن اسناد، متن یک سند، جست‌وجوی نام‌ها، دفتر، نقشه، پیشرفت، صف.
   · دو راه اجرا: (۱) از داخل سرور نقشه (mowtor_khanesh amal=mizban_roshan) — تا وقتی برنامهٔ Claude باز است؛
                  (۲) مستقل از برنامه: «میزبان شخصی.bat» در خانه کلود (node.exe server.js --mizban).
   · هیچ‌چیز بیرون پروژه نوشته نمی‌شود. مدل خودش هیچ سندی را تغییر نمی‌دهد — فقط می‌خواند.
   ===================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), crypto = require('crypto');
const { spawn } = require('child_process');

let S = null, K = null, H = null, SAFHE = null;   // اشتراک از server.js و khanesh.js و صفحهٔ وضعیت
const WIN = process.platform === 'win32';
const PORT_LLM = 8792, PORT_APP = 8795;
const MODEL = { title:'Gemma 3 4B فارسی (پایهٔ پاک، Q8_0)', repo:'mshojaei77/gemma-3-4b-persian-v0', file:'gemma-3-4b-persian-v0_q8_0.gguf', mmproj:'mmproj-gemma-3-4b-f16.gguf', mmprojRepo:'ggml-org/gemma-3-4b-it-GGUF', mmprojSrc:'mmproj-model-f16.gguf', ctx: 16384, ubatch: 512, minBytes: 3.5e9 };   /* ۲٫۰: مدل ۴ میلیاردیِ فارسی به‌جای ۱۲ میلیاردی (آموزشش خراب شده بود؛ به سطل زباله رفت)؛ چشم (mmproj) جدا و اختیاری */   /* ۱٫۱۵: ubatch بزرگ‌تر لازم است تا برگ تصویری (بینایی) در یک دسته پردازش شود (GGML_ASSERT non-causal attention requires n_ubatch >= n_tokens)؛ ctx کوچک‌تر تا حافظه جبران شود */
const MDIR = () => path.join(S.HERE, 'موتور خوانش', 'مدل‌ها', 'میزبان');
const LOGD = () => path.join(S.HERE, 'موتور خوانش', 'گزارش');
const L = { proc:null, ready:false, pid:0, startedAt:0, starting:null, lastErr:'' };
const APP = { server:null, port:PORT_APP, chats:0, lastAt:0 };
const DL = { running:false, current:'', bytes:0, size:0, log:[] };

function init(shared, helpers){ S = shared; H = helpers; K = helpers.K; SAFHE = helpers.SAFHE || null; }
function log(m){ S.log('میزبان: ' + m); }
function ts(){ return new Date().toISOString(); }
function modelFile(){ try { const o = (S.metaGet('mizban_model') || '').trim(); if (o && /^[\w.\-]+\.gguf$/.test(o)){ const g = path.join(MDIR(), o); if (fs.existsSync(g) && fs.statSync(g).size > 1e9) return g; } } catch(e){} const f = path.join(MDIR(), MODEL.file); return fs.existsSync(f) && fs.statSync(f).size > MODEL.minBytes ? f : null; }   /* ۱۴۰۵/۰۷/۰۱: گزینش مدل با تنظیم mizban_model */
function modelReady(){ return !!modelFile(); }
function mmprojFile(){ const f = path.join(MDIR(), MODEL.mmproj); try { return fs.existsSync(f) && fs.statSync(f).size > 1e8 ? f : null; } catch(e){ return null; } }
function autoOn(){ return (S.metaGet('mizban_auto') || '') === '1'; }

/* ---------------------- نصب مدل ---------------------- */
async function installModel(){
  if (DL.running) return 'دانلود از پیش در جریان است: ' + DL.current;
  DL.running = true; DL.log = [];
  try{
    fs.mkdirSync(MDIR(), { recursive:true });
    for (const it of [{ name: MODEL.mmproj, repo: MODEL.mmprojRepo, src: MODEL.mmprojSrc }, { name: MODEL.file, repo: MODEL.repo, src: MODEL.file }]){
      const name = it.name; const dest = path.join(MDIR(), name);
      if (fs.existsSync(dest) && (name !== MODEL.file || fs.statSync(dest).size > MODEL.minBytes)) { DL.log.push(name + ' از پیش هست'); continue; }
      DL.current = name;
      await H.download('https://huggingface.co/' + it.repo + '/resolve/main/' + it.src, dest, (b) => { DL.bytes = b; DL.size = H.dlSize(); });
      DL.log.push(name + ' گرفته شد (' + S.human(fs.statSync(dest).size) + ')');
    }
    writeLauncher();
    DL.log.push('میزبان آماده است: ' + MODEL.title);
    return DL.log.join('\n');
  } finally { DL.running = false; DL.current = ''; }
}
/* راه‌انداز مستقل از برنامهٔ Claude: خانه کلود\پنل و میزبان شخصی.bat */
function launcherPath(){ return path.join(path.dirname(S.HERE), 'پنل و میزبان شخصی.bat'); }
function writeLauncher(){
  if (!WIN) return '';
  const bat = launcherPath();
  const body = [
    '@echo off',
    'chcp 65001 >nul',
    'title پنل و میزبان شخصی — شرکت طلوع فردای ایرانیان',
    'cd /d "%~dp0سرور"',
    'echo در حال باز کردن پنل شرکت طلوع فردای ایرانیان...',
    'rem آرگومان نخست (مثلاً #goftogoo) بخش آغازین پنل را تعیین می‌کند',
    'start "" "http://127.0.0.1:' + PORT_APP + '/%~1"',
    'rem اگر پنل از پیش (در برنامهٔ Claude) روشن باشد، همین پنجره بی‌درنگ بسته می‌شود',
    'node.exe server.js --mizban',
    'exit'
  ].join('\r\n') + '\r\n';
  try { fs.writeFileSync(bat, '\ufeff' + body, 'utf8'); log('راه‌انداز نوشته شد: ' + bat); return bat; } catch(e){ log('راه‌انداز نوشته نشد: ' + (e.code || e.message)); return ''; }
}
/* آیکون روی دسکتاپ کارفرما (به دستور صریح او، ۱۴۰۵/۰۶/۲۴) — تنها چیزی که بیرون از پوشهٔ پروژه ساخته می‌شود */
async function writeDesktopIcon(){
  if (!WIN) return 'فقط روی ویندوز';
  const bat = writeLauncher(); if (!bat) return 'راه‌انداز ساخته نشد';
  const ps = [
    "$ErrorActionPreference='Stop'",
    "$d=[Environment]::GetFolderPath('Desktop')",
    "$w=New-Object -ComObject WScript.Shell",
    "$s=$w.CreateShortcut((Join-Path $d 'پنل شرکت طلوع فردای ایرانیان.lnk'))",
    "$s.TargetPath=$env:NAGHSHE_BAT",
    "$s.WorkingDirectory=Split-Path $env:NAGHSHE_BAT",
    "$s.IconLocation='shell32.dll,14'",
    "$s.Description='پنل وضعیت سرور و میزبان شخصی — شرکت طلوع فردای ایرانیان'",
    "$s.Save()",
    "$m=$w.CreateShortcut((Join-Path $d 'میزبان شخصی.lnk'))",
    "$m.TargetPath=$env:NAGHSHE_BAT",
    "$m.Arguments='#goftogoo'",
    "$m.WorkingDirectory=Split-Path $env:NAGHSHE_BAT",
    "$m.IconLocation='shell32.dll,160'",
    "$m.Description='گفتگو با میزبان شخصی — آفلاین، روی همین رایانه'",
    "$m.Save()",
    "Write-Output ((Join-Path $d 'پنل شرکت طلوع فردای ایرانیان.lnk') + ' · ' + (Join-Path $d 'میزبان شخصی.lnk'))"
  ].join('; ');
  const r = await H.runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { env: Object.assign({}, process.env, { NAGHSHE_BAT: bat }), windowsHide:true });
  const out = (r.out || '').trim();
  if (r.code !== 0) return '⚠ آیکون ساخته نشد (کد ' + r.code + '): ' + out.slice(-300);
  log('آیکون دسکتاپ ساخته شد: ' + out);
  return 'آیکون روی دسکتاپ ساخته شد: ' + out + '\nراه‌انداز: ' + bat;
}

/* ---------------------- فرایند مدل (llama-server دوم، با رابط وب داخلی) ---------------------- */
/* قفل مالکیت مدل میزبان میان نمونه‌های هم‌زمان سرور (اتمی، با ضربان) */
function begirMizban(){
  try {
    const d = S.openDb(), now = Date.now();
    d.prepare("INSERT OR IGNORE INTO meta(k,v) VALUES('mizban_qofl', '')").run();
    return d.prepare("UPDATE meta SET v=? WHERE k='mizban_qofl' AND (v='' OR v LIKE ? OR CAST(substr(v, instr(v,'|')+1) AS INTEGER) < ?)").run(process.pid + '|' + now, process.pid + '|%', now - 60000).changes === 1;
  } catch(e){ return true; }
}
function malekMizban(){ try { const v = String(S.metaGet('mizban_qofl') || '').split('|'); const pid = +v[0] || 0, t = +v[1] || 0; return pid && pid !== process.pid && Date.now() - t < 60000 ? pid : 0; } catch(e){ return 0; } }
/* ضربان: مالک قفل را تازه می‌کند؛ نمونهٔ دیگر آماده‌بودن مدلِ مالک را از درگاه می‌سنجد تا پنل و گفتگو وضعیت درست ببینند */
setInterval(() => {
  if (L.proc){ begirMizban(); return; }
  if (!H || L.starting) return;
  H.httpGet(PORT_LLM, '/health').then(h => { L.ready = !!(h && h.status === 200); }).catch(() => { L.ready = false; });
}, 10000).unref();
/* گرم‌کردن: دستورالعمل ثابت یک بار از پیش خوانده می‌شود تا در حافظهٔ مدل بماند و نخستین پرسش کارفرما منتظر خواندن آن نماند */
function GARMD(){ return path.join(path.dirname(modelFile()), 'حافظهٔ گرم'); }
function slotAmal(amal, file){
  return new Promise(res => {
    const data = Buffer.from(JSON.stringify({ filename: file }));
    const req = http.request({ host:'127.0.0.1', port: PORT_LLM, path:'/slots/0?action=' + amal, method:'POST', agent:false, headers:{ 'content-type':'application/json', 'content-length': data.length } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ ok: r.statusCode === 200, body: b })); });
    req.on('error', e => res({ ok:false, body: e.message })); req.setTimeout(600000, () => req.destroy(new Error('مهلت'))); req.end(data);
  });
}
/* یک بار برای هر راه‌اندازی مدل: اگر آخرین گرم‌شدن پیش از آخرین راه‌اندازی بوده، دوباره گرم کن */
function garmAgarLazem(){ try { const s = +(S.metaGet('mizban_start') || 0), g = +(S.metaGet('mizban_garm') || 0); if (!s || g < s) garmKardan(); } catch(e){ garmKardan(); } }
function garmKardan(){ setTimeout(() => { garmDoIt(); }, 2000); }
let GARM_P = null;
function garmDoIt(){ if (!GARM_P) GARM_P = garmDoIt0().finally(() => { GARM_P = null; }); return GARM_P; }
function garmLazem(){ try { const s = +(S.metaGet('mizban_start') || 0), g = +(S.metaGet('mizban_garm') || 0); return !s || g < s; } catch(e){ return false; } }
async function garmDoIt0(){
  {
    const file = 'garm-' + crypto.createHash('sha1').update(systemPrompt()).digest('hex').slice(0, 12) + '.bin';
    try { S.metaSet('mizban_dar_kar', String(Date.now())); } catch(e){}
    try {
      if (false && fs.existsSync(path.join(GARMD(), file))){ const r = await slotAmal('restore', file); if (r.ok){ log('حافظهٔ گرم مدل از دیسک بازگشت (' + file + ')'); try { S.metaSet('mizban_garm', String(Date.now())); } catch(e){} return; } log('بازگرداندن حافظهٔ گرم نشد: ' + r.body.slice(0, 200)); }
      await generate([{ role:'system', content: systemPrompt() }, { role:'user', content:'سلام' }], () => {}, 1);
      log('مدل میزبان گرم شد (دستورالعمل در حافظهٔ مدل)');
      try { S.metaSet('mizban_garm', String(Date.now())); } catch(e){}
      const s = { ok: false, body: 'خاموش' }; if (false) log(s.ok ? 'حافظهٔ گرم روی دیسک نشست (' + file + ')' : 'ذخیرهٔ حافظهٔ گرم نشد: ' + s.body.slice(0, 200));
    } catch(e){ log('گرم‌کردن مدل: ' + (e.message || e)); }
    finally { try { S.metaSet('mizban_dar_kar', '0'); } catch(e){} }
  }
}
async function startLlm(){
  if (L.proc && L.ready) return;
  if (L.starting) return L.starting;
  L.starting = (async () => {
    /* اگر نمونه‌ای از پیش (مثلاً اجرای مستقل با «میزبان شخصی.bat») زنده است، همان استفاده می‌شود */
    const h0 = await H.httpGet(PORT_LLM, '/health'); if (h0 && h0.status === 200){ L.ready = true; log('مدل میزبان از پیش روشن است (درگاه ' + PORT_LLM + ')'); garmAgarLazem(); return; }
    /* درگاه پاسخ می‌دهد (در حال بار شدن) یا نمونهٔ دیگر سرور مالک است: همان را منتظر می‌مانیم، نسخهٔ دوم ساخته نمی‌شود */
    if (h0 || malekMizban() || !begirMizban()){
      log('مدل میزبان در دست نمونهٔ دیگر سرور است؛ انتظار برای آماده‌شدن');
      const t1 = Date.now();
      while (Date.now() - t1 < 900000){ const h = await H.httpGet(PORT_LLM, '/health'); if (h && h.status === 200){ L.ready = true; return; } if (!h && !malekMizban()) break; await new Promise(r => setTimeout(r, 2000)); }
      if (!L.ready && malekMizban()) throw Object.assign(new Error('مدل میزبان در نمونهٔ دیگر سرور هنوز آماده نشده'), { code:'EBUSY' });
      if (!begirMizban()) throw Object.assign(new Error('مدل میزبان در دست نمونهٔ دیگر سرور است'), { code:'EBUSY' });
    }
    const ngl = Math.max(0, Math.min(99, +(S.metaGet('mizban_ngl') || 0) || 0)); const dev = (S.metaGet('mizban_device') || '').trim();
    let p = H.pickExe(); const vk = path.join(S.HERE, 'موتور خوانش', 'llama', 'vulkan', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
    if (ngl > 0 && fs.existsSync(vk)) p = { variant: 'vulkan', exe: vk };
    if (!p) throw Object.assign(new Error('llama.cpp نصب نیست (mowtor_khanesh amal=nasb)'), { code:'ENOENGINE' });
    if (!modelReady()) throw Object.assign(new Error('مدل میزبان نصب نیست (mowtor_khanesh amal=mizban_nasb)'), { code:'ENOMODEL' });
    H.ensureRuntimeDlls(path.dirname(p.exe));
    try { fs.mkdirSync(LOGD(), { recursive:true }); } catch(e){}
    let out = null; try { out = fs.openSync(path.join(LOGD(), 'میزبان.log'), 'a'); } catch(e){}
    const gpu = ngl > 0;
    const threads = Math.max(1, Math.min(Math.floor(os.cpus().length / 2) || 1, 8));
    const args = ['-m', modelFile(), '-ngl', String(ngl), '--host', '127.0.0.1', '--port', String(PORT_LLM), '--parallel', '1', '--ctx-size', String(Math.max(8192, +(S.metaGet('mizban_ctx') || 0) || MODEL.ctx)), '-b', String(MODEL.ubatch), '-ub', String(MODEL.ubatch), '--alias', 'mizban', '--jinja', '-t', String(threads), '--flash-attn', 'auto'];
    if (mmprojFile()){ args.push('--mmproj', mmprojFile()); if (gpu) args.push('--no-mmproj-offload'); }   /* چشم (۸۱۱ مگابایت) روی پردازنده می‌ماند تا کارت ۲ گیگابایتی برای لایه‌های متن بماند */
    if (gpu && dev) args.push('--device', dev);
    if (gpu) args.push('--no-op-offload');
    args.push('-tb', String(Math.max(threads, Math.min(os.cpus().length, 16))));   /* خوانش پرسش با همهٔ هسته‌های منطقی؛ نوشتن پاسخ با هسته‌های فیزیکی */
    try { /* ذخیرهٔ دیسکی حافظهٔ گرم برداشته شد */ } catch(e){}   /* حافظهٔ گرم دستورالعمل (بی افت کیفیت) */   /* آزمون ۱۴۰۵/۰۷/۰۱: بی این، هر دستهٔ پرسش وزن‌ها را از راه PCIe به GT 1030 می‌برد و خوانش پرسش ۶۵٪ کندتر است */
    log('راه‌اندازی مدل میزبان (' + p.variant + (gpu ? '، کارت گرافیک' : '، پردازنده') + '): ' + MODEL.file);
    const proc = spawn(p.exe, args, { cwd: path.dirname(p.exe), windowsHide:true, stdio: ['ignore', out !== null ? out : 'ignore', out !== null ? out : 'ignore'] });
    L.proc = proc; L.ready = false; L.pid = proc.pid; L.startedAt = Date.now(); try { S.metaSet('mizban_start', String(Date.now())); } catch(e){}
    try { S.metaSet('mizban_pid', String(proc.pid)); } catch(e){}
    let exited = false, code = null; proc.on('exit', c => { exited = true; code = c; if (L.proc === proc){ L.proc = null; L.ready = false; } log('مدل میزبان بسته شد (کد ' + c + ')'); });
    proc.on('error', e => { exited = true; code = e.code || e.message; });
    const t0 = Date.now();
    while (Date.now() - t0 < 900000){
      if (exited) throw Object.assign(new Error('مدل میزبان هنگام بالا آمدن بسته شد (کد ' + code + '؛ گزارش: ' + path.join(LOGD(), 'میزبان.log') + ')'), { code:'EENGINE' });
      const h = await H.httpGet(PORT_LLM, '/health'); if (h && h.status === 200){ L.ready = true; log('مدل میزبان آماده در ' + ((Date.now() - t0) / 1000).toFixed(0) + ' ثانیه'); garmKardan(); return; }
      await new Promise(r => setTimeout(r, 800));
    }
    try { proc.kill(); } catch(e){} H.killPid(proc.pid);
    throw Object.assign(new Error('مدل میزبان در ۱۵ دقیقه آماده نشد'), { code:'EENGINE' });
  })();
  try { await L.starting; } finally { L.starting = null; }
}
function stopLlm(){
  const p = L.proc; L.proc = null; L.ready = false;
  if (p){ try { p.kill(); } catch(e){} H.killPid(p.pid); log('مدل میزبان خاموش شد'); try { S.metaSet('mizban_pid', ''); S.openDb().prepare("UPDATE meta SET v='' WHERE k='mizban_qofl' AND v LIKE ?").run(process.pid + '|%'); } catch(e){} }
}
function killStale(){ if (malekMizban()) return; try { const pid = +S.metaGet('mizban_pid') || 0; if (pid){ H.killPid(pid); S.metaSet('mizban_pid', ''); } } catch(e){} }

/* ---------------------- ابزارهای در دسترس مدل محلی (فقط خواندن) ---------------------- */
const TOOL_DEFS = [
  { name:'ketabkhane',       desc:'کتابخانهٔ حقوقی معتبر: متن رسمی قوانین و مقررات ایران از منابع رسمی (مرکز پژوهش‌های مجلس)، با تاریخ و مرجع تصویب و نشانی — برای هر پرسش حقوقی اول این را بزن؛ پرسش را با نام قانون و شمارهٔ ماده بنویس', args:{ q:'مادهٔ قانون یا موضوع حقوقی' } },
  { name:'jostojoo_mohtava', desc:'جست‌وجو در متن همهٔ اسناد خوانده‌شده (کلیدواژه‌ها)', args:{ q:'کلیدواژه‌ها' } },
  { name:'mohtava',          desc:'متن کامل یک سند (با مسیر فایل یا اثر انگشت)', args:{ file:'مسیر نسبی فایل' } },
  { name:'jostojoo',         desc:'جست‌وجو در نام فایل‌ها و پوشه‌های پروژه', args:{ q:'کلیدواژه‌ها' } },
  { name:'fehrest',          desc:'محتویات یک پوشه', args:{ dir:'مسیر نسبی پوشه' } },
  /* ۱۴۰۵/۰۷/۰۲ دستور کارفرما: ابزار اینترنت (web) برداشته شد — داده فقط از کتابخانه‌های متن رسمی مرکز پژوهش‌های مجلس و داده‌های خود سیستم */
];
const OPEN = '⟪ابزار⟫', CLOSE = '⟪/ابزار⟫';
const MARK = '⟪';                       /* هر نشانهٔ ⟪ آغاز فراخوان ابزار شمرده می‌شود (مدل‌های کوچک گاهی نام ابزار را در خود نشانه می‌گذارند) */
const NAMES = () => TOOL_DEFS.map(t => t.name);
/* ---------------------- دنیای بیرون: جست‌وجو + سنجش اعتبار منبع ---------------------- */
const ALLOWLIST = {
  'wikipedia.org':92,'britannica.com':90,'nature.com':95,'science.org':94,'nih.gov':95,'pubmed.ncbi.nlm.nih.gov':95,'who.int':93,'iso.org':93,'ietf.org':90,'rfc-editor.org':90,'w3.org':90,'ieee.org':92,'nasa.gov':95,'un.org':90,'oecd.org':90,'worldbank.org':90,'arxiv.org':78,'reuters.com':85,'apnews.com':85,'bbc.com':82,
  'gov.ir':90,'inso.gov.ir':92,'isiri.gov.ir':92,'cbi.ir':90,'amar.org.ir':90,'behdasht.gov.ir':88,'majlis.ir':88,'rc.majlis.ir':90,'parliran.ir':88,'dolat.ir':86,'shora-gc.ir':86,'divan-edalat.ir':88,'eadl.ir':86,'dadgostary.ir':86,'ssaa.ir':84,
  'ac.ir':85,'ut.ac.ir':88,'sharif.edu':88,'aut.ac.ir':88,'sid.ir':85,'irandoc.ac.ir':86,'noormags.ir':82,'magiran.com':78,'civilica.com':80,'ensani.ir':82,
  'irna.ir':78,'isna.ir':78,'mehrnews.com':76,
};
const BADTLD = ['.xyz','.top','.buzz','.click','.tk','.ml','.ga','.cf','.gq'];
const REDWORDS = ['باورنکردنی','شوکه','معجزه','فقط امروز','۱۰۰٪ تضمین','!!!','shocking','miracle','you won'];
function hostOf(u){ try { return new URL(u).hostname.replace(/^www\./,''); } catch(e){ return ''; } }
function credibility(url, title, snippet){
  const host = hostOf(url); let score = 50; const why = [];
  let allow = 0; for (const d in ALLOWLIST){ if (host === d || host.endsWith('.' + d)){ allow = Math.max(allow, ALLOWLIST[d]); } }
  if (allow){ score = allow; why.push('منبع شناخته‌شدهٔ معتبر'); }
  else {
    if (/\.gov(\.[a-z]{2})?$/.test(host) || host.endsWith('.gov.ir') || host.endsWith('.mil')){ score += 25; why.push('دامنهٔ دولتی'); }
    else if (/(\.edu|\.ac\.ir|\.ac\.[a-z]{2})$/.test(host)){ score += 22; why.push('دامنهٔ دانشگاهی'); }
    else if (/(\.org|\.org\.ir)$/.test(host)){ score += 8; }
    if (BADTLD.some(x => host.endsWith(x))){ score -= 22; why.push('دامنهٔ مشکوک'); }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)){ score -= 20; why.push('نشانی عددی'); }
    if (/(blogspot|wordpress\.com|medium\.com|substack\.com|blog\.ir|mihanblog|persianblog)/.test(host)){ score -= 6; why.push('وبلاگ شخصی'); }
  }
  if (/^https:/.test(url)) score += 3;
  const txt = ((title||'') + ' ' + (snippet||'')).toLowerCase();
  if (REDWORDS.some(w => txt.indexOf(w.toLowerCase()) >= 0)){ score -= 12; why.push('نشانه‌های تبلیغاتی/هیجانی'); }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: score >= 70 ? 'معتبر' : score >= 40 ? 'متوسط' : 'کم‌اعتبار', host, why };
}
function httpsJson(url, ms){
  return new Promise((resolve) => {
    let done = false; const to = setTimeout(() => { if (!done){ done = true; resolve(null); } }, ms || 12000);
    const fin = (v) => { if (!done){ done = true; clearTimeout(to); resolve(v); } };
    try{
      const https = require('https');
      const req = https.get(url, { headers: { 'user-agent':'naghshe-mizban/1.0', 'accept':'application/json' } }, res => {
        if (res.statusCode !== 200){ res.resume(); return fin(null); }
        let b = ''; res.setEncoding('utf8'); res.on('data', c => b += c); res.on('end', () => { try { fin(JSON.parse(b)); } catch(e){ fin(null); } });
      });
      req.on('error', () => fin(null)); req.setTimeout(ms || 12000, () => req.destroy());
    }catch(e){ fin(null); }
  });
}
async function webSearch(query){
  const q = String(query || '').trim().slice(0, 200); if (!q) return { error:'پرسش خالی است', results: [] };
  const results = [], seen = {};
  try{
    const j = await httpsJson('https://fa.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=' + encodeURIComponent(q));
    if (j && j.query && j.query.search){
      for (const s of j.query.search){
        const url = 'https://fa.wikipedia.org/wiki/' + encodeURIComponent(String(s.title).replace(/ /g, '_'));
        const snip = String(s.snippet || '').replace(/<[^>]+>/g, ''); const cr = credibility(url, s.title, snip);
        if (seen[url]) continue; seen[url] = 1;
        results.push({ title: s.title, url, host: cr.host, snippet: snip, score: cr.score, label: cr.label, why: cr.why });
      }
    }
  }catch(e){}
  try{
    const j = await httpsJson('https://api.duckduckgo.com/?format=json&no_html=1&t=naghshe&q=' + encodeURIComponent(q));
    if (j){
      if (j.AbstractText && j.AbstractURL && !seen[j.AbstractURL]){ seen[j.AbstractURL]=1; const cr = credibility(j.AbstractURL, j.Heading, j.AbstractText); results.push({ title: j.Heading || q, url: j.AbstractURL, host: cr.host, snippet: j.AbstractText, score: cr.score, label: cr.label, why: cr.why }); }
      for (const r of (j.RelatedTopics || []).slice(0, 5)){ if (r.FirstURL && r.Text && !seen[r.FirstURL]){ seen[r.FirstURL]=1; const cr = credibility(r.FirstURL, r.Text, r.Text); results.push({ title: String(r.Text).slice(0, 90), url: r.FirstURL, host: cr.host, snippet: r.Text, score: cr.score, label: cr.label, why: cr.why }); } }
    }
  }catch(e){}
  if (!results.length) return { error:'به دنیای بیرون نرسیدم — شاید شبکه محدود است یا موضوع یافت نشد', results: [] };
  results.sort((a, b) => b.score - a.score);
  bumpProgress({ search: q, checked: results.length, credible: results.filter(r => r.score >= 70).length });
  return { query: q, results: results.slice(0, 8) };
}
function bumpProgress(o){
  try{
    let p = {}; try { p = JSON.parse(S.metaGet('mizban_progress') || '{}') || {}; } catch(e){ p = {}; }
    if (!p.startedAt) p.startedAt = Date.now();
    p.webReady = true;
    if (o.chat) p.chats = (p.chats || 0) + 1;
    if (o.search){ p.webSearches = (p.webSearches || 0) + 1; p.lastTopic = o.search; p.lastSearchAt = Date.now();
      p.topics = p.topics || []; if (p.topics.indexOf(o.search) < 0){ p.topics.push(o.search); if (p.topics.length > 30) p.topics = p.topics.slice(-30); } }
    if (o.checked) p.sourcesChecked = (p.sourcesChecked || 0) + o.checked;
    if (o.credible) p.credibleSources = (p.credibleSources || 0) + o.credible;
    p.series = p.series || []; p.series.push({ t: Date.now(), chats: p.chats || 0, searches: p.webSearches || 0 }); if (p.series.length > 60) p.series = p.series.slice(-60);
    S.metaSet('mizban_progress', JSON.stringify(p));
  }catch(e){}
}
/* کنش‌های کنترلی پنل (فقط از دکمه‌های خودِ کارفرما) */
async function doPanelAmal(kind){
  try{
    if (kind === 'queue_on'){ const r = await H.runTool('khanesh_sarvar', { amal:'shoroo', limit: 13000, olaviat: [] }); return { ok: !r.isError, msg: String(r.text||'').slice(0,220) }; }
    if (kind === 'queue_off'){ const r = await H.runTool('khanesh_sarvar', { amal:'ist' }); return { ok: !r.isError, msg: String(r.text||'').slice(0,220) }; }
    if (kind === 'host_on'){ roshan().catch(e => log('روشن‌کردن از پنل: ' + (e.message || e.code))); return { ok:true, msg:'میزبان در حال بالا آمدن است (چند دقیقه)' }; }
    if (kind === 'host_off'){ const m = khamoosh(); return { ok:true, msg: String(m).slice(0,220) }; }
    if (kind === 'danesh_on' || kind === 'danesh_off'){ const DN = require('./danesh.js'); const m = kind === 'danesh_on' ? DN.roshan() : DN.khamoosh(); return { ok:true, msg: String(m).split('\n')[0] }; }
    if (kind === 'restart'){ setTimeout(() => { try { H.runTool('bazrahandazi', { ba_saf: true }); } catch(e){} }, 300); return { ok:true, msg:'سرور تا چند لحظهٔ دیگر بازراه‌اندازی می‌شود' }; }
    return { ok:false, msg:'کنش ناشناخته' };
  }catch(e){ return { ok:false, msg: e.message || String(e) }; }
}

function systemPrompt(){
  const tools = TOOL_DEFS.map(t => '- ' + t.name + ': ' + t.desc + (Object.keys(t.args).length ? ' — ورودی: ' + JSON.stringify(t.args) : '')).join('\n');
  return [
    (global.naghsheGhavaninMizban ? '———— قوانین اجباری کارفرما برای میزبان (اجباری، نه ترجیح یا پیشنهاد) — عین دفتر «قوانین میزبان.xlsx» (قانون ۳) ————\n' + global.naghsheGhavaninMizban() + '\n———— پایان قوانین اجباری ————' : (global.naghsheGhavanin ? '———— قوانین اجباری کارفرما ————\n' + global.naghsheGhavanin() + '\n———— پایان قوانین اجباری ————' : '')),
    'تو «میزبان شخصی» پروژهٔ شرکت طلوع فردای ایرانیان هستی: دستیار آفلاین آقای محمدعلی کریمی‌پور روی رایانهٔ خودش. همیشه به فارسی رسمی و روشن پاسخ بده؛ کوتاه و دقیق.',
    'اصل خطای صفر: هیچ‌چیزی را از خودت نساز. هر ادعا دربارهٔ اسناد و پرونده فقط با متنی که از ابزارها گرفته‌ای پشتیبانی شود و مسیر سند را ذکر کن. اگر چیزی در اسناد نبود، بگو «در اسناد خوانده‌شده نیست».',
    'پرسش‌های عمومی، فنی یا مشورتی (مثل سخت‌افزار، برنامه‌نویسی، حقوق عمومی، برآورد و حدس) به اسناد ربطی ندارند: از دانش خودت پاسخ بده و در آغاز بنویس «(از دانش عمومی مدل، نه از اسناد)»؛ برآوردها را با بازه و با گفتن عدم قطعیت بده و اگر واقعاً نمی‌دانی، بگو نمی‌دانم. هرگز به‌جای پاسخ به این پرسش‌ها نگو «در اسناد نیست».',
    'تحلیل و کارشناسی حقوقی نهایی فقط به دستور صریح کارفرما و پس از خوانش کامل اسناد انجام می‌شود؛ تا آن زمان به جست‌وجو، خلاصهٔ مستند، پاسخ به پرسش‌ها و پیش‌نویس کمک کن.',
    'ابزارهای اسناد فقط خواندنی‌اند و چیزی را تغییر نمی‌دهند. هیچ ابزاری به اینترنت وصل نیست: داده فقط از کتابخانهٔ حقوقی (متن رسمی مرکز پژوهش‌های مجلس) و داده‌های خود سیستم می‌آید؛ از ویکی‌پدیا یا هر جای دیگر هرگز داده نگیر و به آن استناد نکن.',
    'کتابخانهٔ حقوقی: ابزار «ketabkhane» متن رسمی قوانین و مقررات را از منبع رسمی (مرکز پژوهش‌های مجلس شورای اسلامی) می‌دهد، با تاریخ تصویب، مرجع تصویب و نشانی. برای هر پرسش حقوقی اول ketabkhane را بزن و فقط به متنی که آورده استناد کن؛ نام قانون، شمارهٔ ماده، تاریخ تصویب و نشانی را بیاور و هشدار منبع را بازگو کن. اگر در کتابخانه نبود، صریح بگو «در کتابخانهٔ حقوقی نیست» و از حافظهٔ خودت مادهٔ قانون نساز. ویکی‌پدیا و منابع کم‌اعتبار هرگز مبنای استناد نیستند. آنچه از کتابخانه یا اینترنت می‌آید را هرگز «از اسناد پرونده» معرفی نکن.',
    'فهرست ابزارها:',
    tools,
    'شیوهٔ استفاده: هر وقت به داده نیاز داری، در یک خط جداگانه دقیقاً همین قالب را بنویس و همان‌جا متن را تمام کن:',
    OPEN + ' {"name":"نام‌ابزار", "ورودی":"مقدار"} ' + CLOSE,
    'نمونه: ' + OPEN + ' {"name":"ketabkhane", "q":"مهلت تجدیدنظرخواهی در امور مدنی"} ' + CLOSE,
    'نمونه: ' + OPEN + ' {"name":"jostojoo_mohtava", "q":"شمارهٔ قرارداد"} ' + CLOSE,
    'نام ابزار همیشه داخل JSON و در کلید name می‌آید؛ خودِ نشانه‌ها همیشه ' + OPEN + ' و ' + CLOSE + ' هستند. نتیجه برایت فرستاده می‌شود و سپس ادامه بده. در هر پاسخ حداکثر چهار بار ابزار صدا بزن. اگر نیاز به داده نداری، مستقیم و بدون نشانه پاسخ بده.'
  ].join('\n');
}
async function runTool(call){
  if (call.name === 'ketabkhane' || call.name === 'danesh'){
    let KB = null; try { KB = require('./ketabkhane.js'); } catch(e){ return 'کتابخانهٔ حقوقی در دسترس نیست'; }
    const r = await KB.jostojoo(call.q || call.query || call['پرسش'] || '', 6);
    return KB.matnNatayej(r).slice(0, 7000);
  }
  if (call.name === 'web') return 'ابزار اینترنت به دستور کارفرما برداشته شده است؛ فقط کتابخانهٔ حقوقی و داده‌های خود سیستم.';
  if (false){ const r = await webSearch(call.q || call.query || call['موضوع'] || ''); if (r.error) return r.error; return r.results.map((s, i) => (i + 1) + ') [' + s.label + ' ' + s.score + '] ' + s.title + ' — ' + s.host + '\n' + s.snippet).join('\n\n').slice(0, 4000); }
  const t = TOOL_DEFS.find(x => x.name === call.name); if (!t) return 'ابزار ناشناخته: ' + call.name;
  const args = Object.assign({}, call); delete args.name;
  if (call.name === 'daftar') { args.tail = true; args.limit = 5000; }
  if (call.name === 'jostojoo_mohtava' && !args.limit) args.limit = 5;
  if (call.name === 'jostojoo' && !args.limit) args.limit = 20;
  if (call.name === 'khanesh_sarvar') args.amal = 'vaziat';
  let out;
  try { out = await H.runTool(call.name, args); } catch(e){ return 'خطا: ' + (e.message || e.code); }
  let text = out && out.text ? String(out.text) : String(out || '');
  if (call.name === 'naghshe') text = text.slice(0, 6000); else text = text.slice(0, 7000);
  return text || '(خالی)';
}
/* یک نوبت تولید از مدل به‌صورت جریانی؛ اگر نشانهٔ ابزار دیده شد، همان‌جا قطع می‌شود */
function generate(messages, onDelta, maxTok){
  return new Promise((resolve, reject) => {
    const body = { model:'mizban', stream:true, temperature: 0.1, top_p: 0.9, max_tokens: maxTok || 1500, cache_prompt: true, messages };
    const data = Buffer.from(JSON.stringify(body));
    let text = '', buf = '', done = false, toolSeen = false, sent = 0;
    const finishUp = (why) => { if (done) return; done = true; resolve({ text, why }); };
    const req = http.request({ host:'127.0.0.1', port: PORT_LLM, path:'/v1/chat/completions', method:'POST', agent:false, headers:{ 'content-type':'application/json', 'content-length': data.length, accept:'text/event-stream', connection:'close' } }, res => {
      if (res.statusCode !== 200){ let e = ''; res.on('data', c => e += c); res.on('end', () => { done = true; reject(Object.assign(new Error('مدل کد ' + res.statusCode + ' داد: ' + e.slice(0, 300)), { code:'EENGINE' })); }); return; }
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buf += chunk; let i;
        while ((i = buf.indexOf('\n')) >= 0){
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue; const payload = line.slice(5).trim(); if (payload === '[DONE]') continue;
          let j; try { j = JSON.parse(payload); } catch(e){ continue; }
          const ch = j.choices && j.choices[0]; const d = ch && ch.delta && typeof ch.delta.content === 'string' ? ch.delta.content : '';
          if (!d) continue;
          text += d;
          if (!toolSeen){
            const k = text.indexOf(MARK);
            if (k >= 0){ toolSeen = true; if (k > sent){ onDelta(text.slice(sent, k)); sent = k; } }
            else { const safe = Math.max(0, text.length - 2); if (safe > sent){ onDelta(text.slice(sent, safe)); sent = safe; } }
          }
          if (toolSeen && /⟪\s*\/[^⟫]*⟫/.test(text)){ req.destroy(); finishUp('tool'); return; }
        }
      });
      res.on('end', () => { if (!toolSeen && text.length > sent){ onDelta(text.slice(sent)); sent = text.length; } finishUp(toolSeen ? 'tool' : 'stop'); });
      res.on('error', () => finishUp(toolSeen ? 'tool' : 'stop'));
    });
    req.setTimeout(1800000, () => { req.destroy(Object.assign(new Error('مهلت پاسخ مدل تمام شد'), { code:'ETIMEOUT' })); });
    req.on('error', e => { if (!done){ done = true; reject(e); } });
    req.end(data);
  });
}
/* خواندن فراخوان ابزار با سخت‌گیری کم: ⟪ابزار⟫{...}⟪/ابزار⟫ و نیز ⟪نام‌ابزار⟫{...}⟪/نام‌ابزار⟫ یا فقط JSON با کلید name */
function parseToolCall(text){
  const open = /⟪\s*([^⟫\/]*)⟫/.exec(text);
  if (open){
    const tag = (open[1] || '').trim();
    const after = text.slice(open.index + open[0].length);
    const end = /⟪\s*\/[^⟫]*⟫/.exec(after);
    const raw = (end ? after.slice(0, end.index) : after).trim();
    let args = {};
    const m = /\{[\s\S]*\}/.exec(raw);
    if (m){ try { args = JSON.parse(m[0]) || {}; } catch(e){ args = {}; } }
    if (typeof args.name === 'string' && NAMES().includes(args.name)) return args;
    if (NAMES().includes(tag)) return Object.assign({}, args, { name: tag });
    /* نام در متن خام (مثلاً «ابزار: pishraft») */
    const n = NAMES().find(x => raw.includes(x) || tag.includes(x));
    if (n) return Object.assign({}, args, { name: n });
    return null;
  }
  const m2 = /\{[\s\S]*?"name"\s*:\s*"([A-Za-z_]+)"[\s\S]*?\}/.exec(text);
  if (m2 && NAMES().includes(m2[1])){ try { return JSON.parse(m2[0]); } catch(e){ return { name: m2[1] }; } }
  return null;
}
/* گفتگو: تا چهار دور ابزار، سپس پاسخ نهایی — رخدادها به‌صورت SSE به صفحه می‌رود */
/* ۱۴۰۵/۰۷/۰۱ — اگر پرسش شمارهٔ ماده/اصل دارد و همان مادهٔ همان قانون در نتایج هست، فقط همان (کامل) بماند: متن کمتر برای خواندن، نویز کمتر برای مدل */
function dagigh(q, natayej, fekr){
  try {
    const s = String(q).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/ي/g, 'ی').replace(/ك/g, 'ک');
    const m = /(ماد[هّ]?|اصل)\s*(\d+)/.exec(s); if (!m) return natayej;
    const hadaf = (/^اصل/.test(m[1]) ? 'اصل ' : 'ماده ') + (+m[2]);
    const kw = s.replace(m[0], ' ').split(/[\s‌،,.؟?]+/).filter(w => w.length > 2 && !/^(قانون|چه|می‌گوید|میگوید|چیست|متن|بگو|بیاور|درباره|دربارهٔ)$/.test(w));
    const ham = natayej.filter(x => String(x.madde || '').replace(/\s+/g, ' ').trim() === hadaf).map(x => ({ x, e: kw.filter(w => String(x.onvan || '').includes(w)).length, l: String(x.onvan || '').length }));
    if (!ham.length) return natayej;
    ham.sort((a, b) => (b.e - a.e) || (a.l - b.l));
    const best = ham.filter(h => h.e === ham[0].e).slice(0, 2).map(h => h.x);
    if (kw.length && ham[0].e === 0) return natayej;   /* نام قانون در پرسش بود ولی با هیچ‌کدام جور نیست: همهٔ نتایج می‌ماند */
    return fekr ? best.concat(natayej.filter(x => !best.includes(x)).slice(0, 3)) : best;
  } catch(e){ return natayej; }
}
async function chat(history, send, opt){
  opt = opt || {};
  /* ۱۴۰۵/۰۷/۰۲ — «حالت تمام‌قدرت آموزش»: کارت گرافیک، حافظه و پردازنده به دانش و نمایهٔ معنایی داده شده؛ مدل گفتگو بالا نمی‌آید */
  if ((S.metaGet && S.metaGet('tamamghodrat')) === '1'){ send('delta', 'حالت «تمام‌قدرت آموزش» روشن است: به دستور شما کارت گرافیک، حافظه و پردازنده همه به ساخت پایگاه دانش و نمایهٔ معنایی کتابخانه داده شده و مدل گفتگو فعلاً خاموش است. وقتی آموزش تمام شود، خودش به حالت عادی برمی‌گردد؛ یا در زبانهٔ «گره دوم» دکمهٔ «پایان حالت تمام‌قدرت» را بزنید.'); send('done', { rounds: 0 }); return ''; }
  L.dar = true; APP.lastAt = Date.now(); try { S.metaSet('mizban_dar_kar', String(Date.now())); } catch(e){}
  if (L.ready && garmLazem()){ try { send('status', 'بازگرداندن حافظهٔ گرم مدل…'); await garmDoIt(); } catch(e){} try { S.metaSet('mizban_dar_kar', String(Date.now())); } catch(e){} }
  try {
  send('status', L.ready ? 'پرسش به مدل رسید؛ مدل در حال خواندن زمینه است…' : 'مدل میزبان در حال بالا آمدن است…');
  await startLlm();
  send('status', 'مدل در حال اندیشیدن است' + (K && K.queueState && K.queueState().running ? ' (صف خوانش هم روشن است و پردازنده مشترک است؛ پاسخ کندتر می‌آید)' : '') + '…');
  const messages = [{ role:'system', content: systemPrompt() }].concat(history.slice(-16).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 6000) })));
  /* ۲٫۰ — بازیابی پیش از پاسخ (اصل خطای صفر): مدل کوچک منتظر نمی‌ماند تا خودش ابزار بزند؛ سرور متن رسمی کتابخانهٔ حقوقی و اسناد مرتبط را خودش می‌آورد و مدل فقط از همان پاسخ می‌دهد */
  try {
    const last = messages[messages.length - 1];
    const q0 = String((history[history.length - 1] || {}).content || '').trim();
    /* ۱۴۰۵/۰۷/۰۱: سلام و احوال‌پرسی و پیام‌های خیلی کوتاه نیازی به آوردن منابع ندارند (زمینهٔ بی‌جا پاسخ را کند و بلند می‌کرد) */
    const kootah = q0.length < 14 || /^(سلام|درود|سلام علیکم|صبح بخیر|عصر بخیر|شب بخیر|خسته نباشی|ممنون|مرسی|متشکرم|خداحافظ)[\s!.؟?،]*$/.test(q0);
    if (last && last.role === 'user' && !kootah){
      const q = q0.slice(0, 500);
      const parts = [];
      try { const KB = require('./ketabkhane.js'); const r = await KB.jostojoo(q, opt.fekr ? 8 : 4); if (r && r.natayej && r.natayej.length) r.natayej = dagigh(q, r.natayej, opt.fekr); if (r && r.natayej && KB.akharinEslah) r.natayej.forEach(x => { const a = KB.akharinEslah(x.onvan, x.tarikh); if (a) x.onvan = x.onvan + ' [تاریخچه در کتابخانه: ' + a.n + ' متن؛ آخرین اصلاحیهٔ این قانون «' + a.onvan + '» مورخ ' + a.tarikh + ']'; });   /* ۱۴۰۵/۰۷/۰۲ تاریخچهٔ قوانین */ if (r && r.natayej && r.natayej.length) parts.push('【متن رسمی از کتابخانهٔ حقوقی】\n' + r.natayej.map((x, i) => (i + 1) + ') ' + x.onvan + (x.madde ? ' — ' + x.madde : '') + ' (تاریخ تصویب ' + (x.tarikh || '؟') + '، ' + (x.marja || '') + '، ' + x.url + ')\n' + String(x.matn || '').slice(0, 1400)).join('\n\n')); } catch(e){}
      if (/سند|پرونده|قرارداد|نامه|بانک|وکالت|فایل|اسناد|بورس|چک|سفته|دادگاه|رأی|ابلاغ/.test(q)){ try { const dr = await H.runTool('jostojoo_mohtava', { q: q.replace(/[؟?]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 6).join(' '), limit: 3 }); const t = dr && dr.text ? String(dr.text) : ''; if (t && !/یافت نشد/.test(t.slice(0, 80))) parts.push('【اسناد پرونده از لایهٔ دو】\n' + t.slice(0, 2500)); } catch(e){} }
      if (parts.length){
        last.content = last.content + '\n\n' + parts.join('\n\n') + '\n【پایان منابع】\nدستور: فقط بر پایهٔ منابع بالا پاسخ بده و عبارت مربوط را عیناً نقل کن و نام قانون، شمارهٔ ماده/اصل، تاریخ تصویب و نشانی را بیاور. اگر پاسخ در منابع بالا نیست، فقط بنویس «در منابع بازیابی‌شده نیست» و از حافظهٔ خودت چیزی نساز.';
        send('tool', { name: 'bazyabi', args: { manabe: parts.length } });
      }
    }
  } catch(e){ log('بازیابی پیش از پاسخ: ' + (e.message || e)); }
  /* ۲٫۱ — تصویر پیوست (چشم مدل) و «ژرف‌اندیشی» */
  try {
    const lastH = history[history.length - 1] || {}; const lm = messages[messages.length - 1];
    if (opt.fekr && lm && typeof lm.content === 'string') lm.content += '\nژرف‌اندیشی: پیش از پاسخ، پرسش را به اجزایش بشکن، هر جزء را با منابع بسنج و سپس پاسخ مستندِ مرتب بده؛ هر جا منبع نبود بگو نیست.';
    if (Array.isArray(lastH.images) && lastH.images.length && lm){
      if (mmprojFile()) lm.content = [{ type:'text', text: String(lm.content) }].concat(lastH.images.slice(0, 4).map(u => ({ type:'image_url', image_url:{ url: String(u) } })));
      else lm.content = String(lm.content) + '\n(تصویری پیوست شده ولی چشم مدل نصب نیست؛ بگو نمی‌بینم)';
    }
  } catch(e){}
  let rounds = 0, finalText = '';
  for (;;){
    const r = await generate(messages, d => { finalText += d; send('delta', d); }, opt.fekr ? 2500 : 900);
    if (r.why !== 'tool' || rounds >= 4){ break; }
    const call = parseToolCall(r.text);
    if (!call){
      if (rounds >= 2) break;
      rounds++;
      messages.push({ role:'assistant', content: r.text.slice(0, 1500) });
      messages.push({ role:'user', content: 'قالب فراخوان ابزار درست نبود. اگر به داده نیاز داری دقیقاً همین یک خط را بنویس (نام ابزار داخل JSON): ' + OPEN + ' {"name":"pishraft"} ' + CLOSE + ' — وگرنه بدون هیچ نشانه‌ای پاسخ بده.' });
      continue;
    }
    rounds++;
    send('tool', { name: call.name, args: Object.assign({}, call, { name: undefined }) });
    send('status', 'ابزار ' + call.name + ' در حال اجرا…');
    const result = await runTool(call);
    const iMark = r.text.indexOf(MARK); const shown = (iMark >= 0 ? r.text.slice(0, iMark) : r.text).trim();
    messages.push({ role:'assistant', content: (shown ? shown + '\n' : '') + OPEN + ' ' + JSON.stringify(call) + ' ' + CLOSE });
    messages.push({ role:'user', content: '【نتیجهٔ ابزار ' + call.name + '】\n' + result + '\n【پایان نتیجه】\nحالا با تکیه بر همین نتیجه ادامه بده (اگر باز هم داده لازم است، ابزار دیگری صدا بزن).' });
    if (finalText && !finalText.endsWith('\n')) { send('delta', '\n'); finalText += '\n'; }
  }
  if (opt.fekr && finalText.trim()){
    send('status', 'ژرف‌اندیشی: بازبینی پاسخ با منابع…');
    messages.push({ role:'assistant', content: finalText });
    messages.push({ role:'user', content: 'پاسخ بالا را جمله‌به‌جمله با منابع بسنج. اگر ادعای بی‌منبع یا نادرست دارد، فقط فهرست اصلاح‌ها را کوتاه بنویس؛ اگر درست است فقط بنویس: تأیید شد.' });
    let rev = '';
    try { await generate(messages, d => { rev += d; send('baznegari', d); }, 600); } catch(e){}
    if (rev.trim()) finalText += '\n\n〔بازبینی〕 ' + rev.trim();
  }
  send('done', { rounds });
  return finalText;
  } finally { L.dar = false; APP.lastAt = Date.now(); try { S.metaSet('mizban_dar_kar', '0'); } catch(e){} }
}

/* ---------------------- برنامهٔ وب محلی ---------------------- */
function page(){
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>میزبان شخصی — شرکت طلوع فردای ایرانیان</title>
<style>
:root{--bg:#f3f5f8;--ink:#16283F;--ac:#7A1B2B;--card:#fff;--line:#d9dee6}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Tahoma,sans-serif;background:var(--bg);color:var(--ink);height:100vh;display:flex;flex-direction:column}
header{background:var(--ink);color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
header b{font-size:15px}header small{opacity:.8;font-size:12px}
#st{font-size:12px;color:#9fb2c9}
main{flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.m{max-width:900px;padding:10px 14px;border-radius:12px;line-height:1.9;white-space:pre-wrap;word-wrap:break-word;font-size:14.5px}
.u{background:#e8eef7;align-self:flex-start;border:1px solid var(--line)}
.a{background:var(--card);align-self:flex-end;border:1px solid var(--line);border-right:4px solid var(--ac)}
.t{align-self:flex-end;font-size:12px;color:#5b6b7f;background:#fbf6ec;border:1px dashed #d9c9a0;padding:4px 10px;border-radius:8px}
footer{padding:10px 16px;background:#fff;border-top:1px solid var(--line);display:flex;gap:8px;align-items:flex-end}
textarea{flex:1;min-height:52px;max-height:200px;resize:vertical;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:14.5px}
button{background:var(--ac);color:#fff;border:0;border-radius:10px;padding:12px 18px;font:inherit;cursor:pointer}button[disabled]{opacity:.5}
button.g{background:#fff;color:var(--ink);border:1px solid var(--line)}
</style></head><body>
<header><div><b>میزبان شخصی — شرکت طلوع فردای ایرانیان</b><br><small>آفلاین · روی همین رایانه · ${MODEL.title} · تهیه و تنظیم: محمدعلی کریمی‌پور</small></div><div id="st">…</div></header>
<main id="log"></main>
<footer><textarea id="in" placeholder="پرسش یا دستور… (Enter برای فرستادن، Shift+Enter خط تازه)"></textarea><button id="go">بفرست</button><button class="g" id="clr">پاک</button></footer>
<script>
const logEl=document.getElementById('log'),inEl=document.getElementById('in'),go=document.getElementById('go'),clr=document.getElementById('clr'),st=document.getElementById('st');
let hist=[];try{hist=JSON.parse(localStorage.getItem('mizban_hist')||'[]')}catch(e){}
function add(cls,txt){const d=document.createElement('div');d.className='m '+cls;d.textContent=txt;logEl.appendChild(d);logEl.scrollTop=logEl.scrollHeight;return d}
for(const m of hist)add(m.role==='user'?'u':'a',m.content);
function save(){try{localStorage.setItem('mizban_hist',JSON.stringify(hist.slice(-40)))}catch(e){}}
async function status(){try{const r=await fetch('/vaziat');st.textContent=await r.text()}catch(e){st.textContent='سرور در دسترس نیست'}}
status();setInterval(status,15000);
async function sendMsg(){const q=inEl.value.trim();if(!q)return;inEl.value='';go.disabled=true;hist.push({role:'user',content:q});add('u',q);save();
 const a=add('a','');let acc='';
 try{const r=await fetch('/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:hist.slice(-16)})});
  const rd=r.body.getReader();const dec=new TextDecoder();let buf='';
  for(;;){const {done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
   while((i=buf.indexOf('\\n\\n'))>=0){const ev=buf.slice(0,i);buf=buf.slice(i+2);const lines=ev.split('\\n');let type='message',data='';for(const l of lines){if(l.startsWith('event:'))type=l.slice(6).trim();else if(l.startsWith('data:'))data+=l.slice(5).trim()}
    if(type==='delta'){acc+=JSON.parse(data);a.textContent=acc;logEl.scrollTop=logEl.scrollHeight}
    else if(type==='tool'){const j=JSON.parse(data);const t=document.createElement('div');t.className='m t';t.textContent='🔎 ابزار: '+j.name+' '+JSON.stringify(j.args||{});logEl.insertBefore(t,a)}
    else if(type==='error'){acc+='\\n⚠ '+JSON.parse(data);a.textContent=acc}
   }}
 }catch(e){acc+='\\n⚠ '+e.message;a.textContent=acc}
 hist.push({role:'assistant',content:acc});save();go.disabled=false;inEl.focus()}
go.onclick=sendMsg;inEl.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()}});
clr.onclick=()=>{hist=[];save();logEl.innerHTML=''};
</script></body></html>`;
}
/* وضعیت میزبان به شکل داده (برای پنل) */
function modelNam(){ const f = modelFile(); if (!f) return MODEL.title; const b = path.basename(f); return /Q6_K/i.test(b) ? 'Gemma 3 4B فارسی (Q6_K)' : /q8_0/i.test(b) ? MODEL.title : b; }
function state(){ return { web: true, on: L.ready, starting: !!L.starting, ready: modelReady(), model: modelNam(), port: PORT_LLM, app: !!APP.server, chats: APP.chats, busy: !!L.starting, dl: DL.running ? { name: DL.current, bytes: DL.bytes, size: DL.size } : null }; }
function statusLine(){
  const dl = DL.running ? ' · ⬇ ' + DL.current + ' ' + S.human(DL.bytes) + (DL.size ? ' از ' + S.human(DL.size) : '') : '';
  return 'میزبان شخصی: ' + (L.ready ? '🟢 مدل روشن (درگاه ' + PORT_LLM + ')' : (L.starting ? '⏳ مدل در حال بالا آمدن' : '⚪ مدل خاموش')) + ' · برنامهٔ وب: ' + (APP.server ? 'http://127.0.0.1:' + PORT_APP : 'خاموش') + ' · مدل: ' + (modelReady() ? '✅ ' + MODEL.title : '❌ نصب نشده (mowtor_khanesh amal=mizban_nasb)') + ' · گفتگوها: ' + APP.chats + (autoOn() ? ' · خودکار با سرور: روشن' : '') + dl;
}
function startApp(){
  if (APP.server) return;
  const srv = http.createServer(async (req, res) => {
    try{
      const json = (o) => { res.writeHead(200, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }); res.end(JSON.stringify(o)); };
      /* ۲٫۱ — امنیت: فقط اپلیکیشن میزبان و خود پنل؛ هیچ وبگاه دیگری در مرورگر نمی‌تواند به این درگاه فرمان بدهد */
      const orig = String(req.headers.origin || '');
      if (orig && !/^(https:\/\/mizban\.local|http:\/\/(127\.0\.0\.1|localhost):8795)$/.test(orig) && !(req.url.startsWith('/rabet/cbi/') && /^https:\/\/(www\.)?cbi\.ir$/.test(orig)) && !(req.url.startsWith('/rabet/qavanin/') && /^https:\/\/(www\.)?qavanin\.ir$/.test(orig))){ res.writeHead(403, { 'content-type':'text/plain; charset=utf-8' }); return res.end('مبدأ نامجاز'); }
      if (orig === 'https://mizban.local'){ res.setHeader('access-control-allow-origin', orig); res.setHeader('access-control-allow-headers', 'content-type, x-name'); res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS'); res.setHeader('access-control-max-age', '600'); }
      if (req.url.startsWith('/rabet/cbi/') || req.url.startsWith('/rabet/qavanin/')){ const RB = require('./rabet.js'); if (await RB.handle(req, res, { json, runTool: H.runTool })) return; }   /* بانک مرکزی از مرورگر کارفرما (۱۴۰۵/۰۷/۰۲) */
    if (req.method === 'OPTIONS'){ res.writeHead(204); return res.end(); }
      if (req.url.startsWith('/rabet/')){ const RB = require('./rabet.js'); if (await RB.handle(req, res, { json, runTool: H.runTool })) return; }
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))){ res.writeHead(200, { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store' }); return res.end(SAFHE ? SAFHE.page() : page()); }
      if (req.method === 'GET' && req.url === '/api' && SAFHE){ return json(SAFHE.apiData()); }
      if (req.method === 'GET' && req.url === '/abzarha'){ const all = (S && S.ALL_TOOLS) ? S.ALL_TOOLS() : []; return json({ ok:true, abzarha: all.map(t => { const pr = (t.inputSchema && t.inputSchema.properties) || {}; const args = {}; for (const k of Object.keys(pr)) args[k] = pr[k].type || 'string'; return { name: t.name, title: t.title || '', desc: t.description || '', args, required: (t.inputSchema && t.inputSchema.required) || [] }; }) }); }   /* ۲٫۰: فهرست زندهٔ ابزارها برای اپلیکیشن میزبان شخصی */
      if (req.method === 'GET' && req.url.startsWith('/daftar') && SAFHE){ return json(SAFHE.daftarTail(9000)); }
      if (req.method === 'GET' && req.url === '/sade'){ res.writeHead(200, { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store' }); return res.end(page()); }
      if (req.method === 'GET' && req.url === '/vaziat'){ res.writeHead(200, { 'content-type':'text/plain; charset=utf-8', 'cache-control':'no-store' }); return res.end(statusLine()); }
      if (req.method === 'GET' && req.url === '/satl'){ let AB = null; try { AB = require('./abzar.js'); } catch(e){} return json(AB ? AB.satlInfo() : { files: 0, bytes: 0 }); }
      if (req.method === 'POST' && req.url === '/satl/khali'){
        /* فقط دکمهٔ پنل و فقط با عبارت تأیید کارفرما — مدل ابزاری برای این کار ندارد */
        const ch=[]; for await (const c of req) ch.push(c); let bd={}; try{ bd=JSON.parse(Buffer.concat(ch).toString('utf8')); }catch(e){}
        if (String(bd.taeed || '').trim() !== 'پاک شود') return json({ ok:false, msg:'عبارت تأیید درست نبود؛ چیزی پاک نشد' });
        const AB = require('./abzar.js'); return json(AB.satlKhali());
      }
      if (req.method === 'POST' && req.url === '/abzar'){ const ch=[]; for await (const c of req) ch.push(c); let bd={}; try{ bd=JSON.parse(Buffer.concat(ch).toString('utf8')); }catch(e){} if (!bd.name) return json({ ok:false, text:'name لازم است' }); const r = await H.runTool(String(bd.name), bd.args || {}); return json({ ok: !r.isError, text: String(r.text || '') }); }
      if (req.method === 'POST' && req.url === '/amal'){ const ch=[]; for await (const c of req) ch.push(c); let bd={}; try{ bd=JSON.parse(Buffer.concat(ch).toString('utf8')); }catch(e){} const r = await doPanelAmal(String(bd.do||'')); return json({ ok: r.ok, msg: r.msg }); }
      if (req.method === 'POST' && req.url === '/web'){ const ch=[]; for await (const c of req) ch.push(c); let bd={}; try{ bd=JSON.parse(Buffer.concat(ch).toString('utf8')); }catch(e){} const r = await webSearch(String(bd.q||'')); return json(r); }
      if (req.method === 'POST' && req.url === '/chat'){
        const ch = []; for await (const c of req) ch.push(c);
        let body; try { body = JSON.parse(Buffer.concat(ch).toString('utf8')); } catch(e){ res.writeHead(400); return res.end('bad json'); }
        const history = Array.isArray(body.messages) ? body.messages : [];
        res.writeHead(200, { 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-store', connection:'keep-alive' });
        try { res.flushHeaders(); } catch(e){}
        const send = (ev, data) => { try { res.write('event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch(e){} };
        APP.chats++; APP.lastAt = Date.now(); bumpProgress({ chat: true });
        try { const t0 = Date.now(); const txt = await chat(history, send, { fekr: !!body.fekr, manba: String(body.manba || '') }); try { S.appendChained('[میزبان شخصی — گفتگو] پرسش: ' + String((history[history.length - 1] || {}).content || '').slice(0, 2000) + '\nپاسخ (' + Math.round((Date.now() - t0) / 1000) + ' ثانیه): ' + txt.slice(0, 4000)); } catch(e){} }
        catch(e){ send('error', e.message || String(e)); }
        return res.end();
      }
      res.writeHead(404, { 'content-type':'text/plain; charset=utf-8' }); res.end('نیست');
    }catch(e){ try { res.writeHead(500); res.end(String(e.message || e)); } catch(x){} }
  });
  srv.on('error', e => { log('برنامهٔ وب: ' + (e.code || e.message)); APP.server = null; if (e.code === 'EADDRINUSE') kohneBebandi(); });
  srv.listen(PORT_APP, '127.0.0.1', () => log('برنامهٔ وب میزبان روی http://127.0.0.1:' + PORT_APP));
  APP.server = srv;
}
/* اگر درگاه پنل در دست نمونهٔ کهنه‌تری از سرور است (نسخهٔ دیگر)، آن را می‌بندد و پنل تازه را بالا می‌آورد — فقط یک بار */
let KOHNE_TRIED = false;
async function kohneBebandi(){
  if (KOHNE_TRIED || !WIN) return; KOHNE_TRIED = true;
  try{
    const h = await H.httpGet(PORT_APP, '/api');
    let v = ''; try { v = JSON.parse(h && h.body || '{}').noskhe || ''; } catch(e){}
    const mine = (S.PANEL && S.PANEL.VERSION) || '';
    /* ۱۴۰۵/۰۷/۰۲: کسی پاسخ نمی‌دهد (نمونهٔ پیشین در حال بسته‌شدن است) ← تا ۲ دقیقه هر ۳ ثانیه دوباره */
    const dobare = () => { globalThis.__kohneBar = (globalThis.__kohneBar || 0) + 1; if (globalThis.__kohneBar > 40) return; KOHNE_TRIED = false; setTimeout(() => { try { startApp(); } catch(e){} }, 3000); };
    if (!v){ dobare(); return; }
    if (v === mine){
      /* هم‌نسخه ولی شاید با کدِ پیش از آخرین وصله (مثلاً نمونه‌ای که هنگام بازراه‌اندازی جدا بالا آمده) — اگر پیش از آخرین تغییر کدها راه افتاده، کهنه است */
      const fs0 = require('fs'), path0 = require('path');
      let kod = 0; try { for (const f of fs0.readdirSync(__dirname)) if (/\.js$/i.test(f)) kod = Math.max(kod, fs0.statSync(path0.join(__dirname, f)).mtimeMs); } catch(e){}
      const r0 = await H.runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$p=((netstat -ano | Select-String (\':' + PORT_APP + '\\s+\\S+\\s+LISTENING\') | Select -First 1) -as [string]).Trim() -split \'\\s+\' | Select -Last 1; if($p){ $p; [int64]((Get-Process -Id $p).StartTime.ToUniversalTime() - [datetime]::new(1970,1,1)).TotalMilliseconds }'], { windowsHide:true });
      const [p0, t0] = String(r0.out || '').trim().split(/\s+/).map(Number);
      if (!p0){ dobare(); return; }
      if (p0 === process.pid || !t0 || !kod || t0 >= kod){ log('درگاه پنل در دست نمونه‌ای هم‌نسخه و هم‌کد است؛ دست نخورد'); return; }
      log('نمونهٔ کهنه‌کد پنل (pid ' + p0 + '، راه‌افتاده پیش از آخرین وصله) بسته می‌شود تا کد تازه بالا بیاید');
      H.killPid(p0); setTimeout(() => { try { startApp(); } catch(e){} }, 1500); return;
    }
    const r = await H.runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-NetTCPConnection -LocalPort ' + PORT_APP + ' -State Listen -ErrorAction SilentlyContinue).OwningProcess'], { windowsHide:true });
    const pid = parseInt(String(r.out || '').trim().split(/\s+/)[0], 10);
    if (!pid || pid === process.pid) return;
    log('نمونهٔ کهنهٔ پنل (نسخهٔ ' + v + '، pid ' + pid + ') بسته می‌شود تا نسخهٔ ' + mine + ' بالا بیاید');
    H.killPid(pid);
    setTimeout(() => { try { startApp(); } catch(e){} }, 1500);
  }catch(e){ log('بستن نمونهٔ کهنه: ' + (e.message || e)); globalThis.__kohneBar = (globalThis.__kohneBar || 0) + 1; if (globalThis.__kohneBar <= 40){ KOHNE_TRIED = false; setTimeout(() => { try { startApp(); } catch(e2){} }, 3000); } }
}
function stopApp(){ if (APP.server){ try { APP.server.close(); } catch(e){} APP.server = null; } }

/* ---------------------- فرمان‌ها ---------------------- */
async function roshan(){ startApp(); APP.lastAt = Date.now(); await startLlm(); S.metaSet('mizban_auto', '1'); return statusLine() + '\nدر مرورگر باز کنید: http://127.0.0.1:' + PORT_APP; }
function khamoosh(){ stopLlm(); S.metaSet('mizban_auto', '0'); return statusLine(); }   // پنل روشن می‌ماند؛ فقط مدل خاموش می‌شود
/* اجرای مستقل از برنامهٔ Claude: node server.js --mizban */
async function standalone(){
  const alive = await H.httpGet(PORT_APP, '/vaziat');
  if (alive && alive.status === 200){ log('میزبان از پیش روشن است (در برنامهٔ Claude) — همان باز می‌ماند'); return false; }
  startApp();
  try { await startLlm(); log('میزبان مستقل آماده: http://127.0.0.1:' + PORT_APP); } catch(e){ log('میزبان مستقل: ' + (e.message || e.code)); }
  return true;
}
/* آغاز خودکار همراه سرور (فقط اگر کارفرما پیش‌تر با mizban_roshan آن را روشن کرده باشد) */
/* پنل همیشه بالا می‌آید؛ مدل فقط اگر خودکار روشن است و صف خوانش روشن نیست (حافظهٔ ۱۶ گیگابایتی برای هر دو بس نیست) */
function safRoshan(){ try { if (S.metaGet('saf_edame')) return true; const q = K && K.queueState ? K.queueState() : null; return !!(q && q.running); } catch(e){ return false; } }
function autoStart(){ setTimeout(() => { startApp(); if (autoOn() && !safRoshan()) startLlm().catch(e => log('آغاز خودکار: ' + (e.message || e.code))); }, 3000); }
/* مدیریت منابع: هنگام صف خوانش، مدلِ بیکار (۱۰ دقیقه بی‌گفتگو) خاموش می‌شود؛ پس از پایان صف، اگر خودکار روشن است، دوباره بالا می‌آید. گفتگو هر زمان مدل را روشن می‌کند. */
setInterval(() => {
  try {
    if (!S || !H) return;
    const q = safRoshan();
    if (q && L.proc && L.ready && !L.dar && Date.now() - (APP.lastAt || 0) > 600000){ log('صف خوانش روشن است و میزبان ۱۰ دقیقه بیکار بود؛ مدل برای آزادشدن حافظه خاموش شد'); stopLlm(); L.khodkarKhamoosh = true; }
    else if (!q && autoOn() && !L.proc && !L.ready && !L.starting && !malekMizban()){ startLlm().catch(e => log('آغاز دوبارهٔ خودکار: ' + (e.message || e.code))); }
  } catch(e){}
}, 60000).unref();

module.exports = { init, installModel, roshan, khamoosh, statusLine, state, standalone, autoStart, killStale, stopLlm, stopApp, startApp, startLlm, generate, chat, writeLauncher, writeDesktopIcon, MODEL, PORT_APP, PORT_LLM, DL, L, APP };
