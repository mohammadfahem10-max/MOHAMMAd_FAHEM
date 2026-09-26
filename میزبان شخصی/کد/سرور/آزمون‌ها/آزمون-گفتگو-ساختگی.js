/* آزمون سرتاسری مسیر گفتگو (mizban.js → goftogoo.js → واسطهٔ کتابخانه → کد واقعی کیس دو) با مدل ساختگی — بی مدل واقعی و بی شبکه
   · مدل ساختگی روی درگاه 8792 همان رابط llama.cpp را می‌دهد و بدرفتاری‌های مدل کوچک را عمداً شبیه‌سازی می‌کند:
     - با temperature کمتر از ۱، همان پاسخ پیشین خودش را تکرار می‌کند (شکایت «همون پیام قبلی هی تکرار میکنه»)؛
     - به «یه سوال دارم» در نخستین بار می‌گوید «در منابع بازیابی‌شده نیست» (شکایت «جز سلام هیچی بلد نیست»).
   · کتابخانهٔ کیس دو روی درگاه 8802 با پایگاه ساختگی (کتابخانهٔ-ساختگی.js) اجرا می‌شود.
   اجرا (از پوشهٔ سرور): node "آزمون‌ها/آزمون-گفتگو-ساختگی.js"   — درگاه‌های 8792 و 8802 باید آزاد باشند. */
'use strict';
process.removeAllListeners('warning');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { KB: KB2 } = require('./کتابخانهٔ-ساختگی.js').besaz();
const bar = (n, ok, x) => { console.log((ok ? '✅ ' : '❌ ') + n + (x ? ' — ' + x : '')); if (!ok) process.exitCode = 1; };

/* ---- کیس دو ساختگی (همان مسیرهای ketab-gere2.js) ---- */
const J = (res, o) => { const b = Buffer.from(JSON.stringify(o)); res.writeHead(200, { 'content-type': 'application/json', 'content-length': b.length }); res.end(b); };
let KOND = 0;   /* شبیه‌سازی کندی کیس دو (میلی‌ثانیه) */
const gere2 = http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname; const ch = []; for await (const c of req) ch.push(c); const b = ch.length ? JSON.parse(Buffer.concat(ch).toString('utf8')) : {};
  if (p === '/hal') return J(res, { ok: true, state: KB2.state(), statusLine: KB2.statusLine() });
  if (p === '/gozaresh') return J(res, KB2.gozareshJson());
  if (p === '/hadaf') return J(res, { ok: true });
  if (p === '/jostojoo'){ if (KOND) await new Promise(r => setTimeout(r, KOND)); return J(res, await KB2.jostojoo(b.q, b.had, b.opt || {})); }
  if (p === '/matn') return J(res, KB2.matnQanunJson(b));
  if (p === '/fehrest') return J(res, KB2.fehrestJson(b));
  J(res, { ok: false, text: 'نیست' });
});

/* ---- مدل ساختگی (llama.cpp) ---- */
const BADANE = [];
const llm = http.createServer(async (req, res) => {
  if (req.url === '/health'){ res.writeHead(200); return res.end('{"status":"ok"}'); }
  const ch = []; for await (const c of req) ch.push(c); const b = JSON.parse(Buffer.concat(ch).toString('utf8') || '{}');
  if (!b.stream){ BADANE.push(b); return J(res, { choices: [{ message: { content: '{"qasd":"goftogoo","porsesh_mostaghel":"","kelidvazheha":[],"qanunha":[]}' } }] }); }
  BADANE.push(b);
  const msgs = b.messages || []; const sys = String((msgs[0] || {}).content || ''); const last = msgs[msgs.length - 1] || {}; const lt = typeof last.content === 'string' ? last.content : '';
  const pishin = msgs.filter(m => m.role === 'assistant').map(m => m.content).pop();
  let javab;
  if (b.max_tokens === 1) javab = 'سلام';
  else if (pishin && b.temperature < 1 && !/تکرار نکن/.test(lt)) javab = pishin;                       /* بدرفتاری: تکرار پاسخ پیشین */
  else if (/یه سوال دارم/.test(lt) && !/نگو «در منابع نیست»/.test(lt)) javab = 'متأسفم، پاسخ این پرسش در منابع بازیابی‌شده نیست و نمی‌توانم کمکی بکنم؛ لطفاً پرسش دیگری بپرسید.';   /* بدرفتاری */
  else if (/【متن رسمی از کتابخانهٔ حقوقی】/.test(lt)) { const m = /\d\) (قانون[^\n—]+?) — (ماده \d+)/.exec(lt) || []; javab = 'بر پایهٔ ' + (m[2] ? m[2] + ' ' + m[1] : 'منابع') + '، دارندهٔ چک برگشتی می‌تواند گواهی عدم پرداخت بگیرد و از راه اجرای ثبت یا شکایت کیفری اقدام کند. آیا چک صیادی است؟'; }
  else if (/یه سوال دارم/.test(lt)) javab = 'حتماً، بفرمایید؛ پرسشتان چیست؟ با کمال میل کمک می‌کنم.';
  else if (/خسته/.test(lt)) javab = 'خسته نباشید! کمی استراحت کنید؛ اگر کاری هست که سبکش کنم، بگویید.';
  else javab = 'سلام، وقت بخیر! در خدمتم؛ بفرمایید امروز چه کاری برایتان انجام بدهم؟ ' + Math.random().toString(36).slice(2, 6);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (let i = 0; i < javab.length; i += 12){ res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: javab.slice(i, i + 12) } }] }) + '\n\n'); }
  res.write('data: [DONE]\n\n'); res.end();
});

(async () => {
  await new Promise(r => gere2.listen(8802, '127.0.0.1', r));
  await new Promise(r => llm.listen(8792, '127.0.0.1', r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mizban-azmoon-'));
  const META = { gere2_ip: '127.0.0.1' };
  const S = { HERE: tmp, ROOT: tmp, log(){}, human: String, metaGet: k => META[k] || '', metaSet: (k, v) => { META[k] = String(v); }, openDb(){ throw new Error('بی پایگاه'); } };
  const httpGet = (port, p) => new Promise(res => { const r = http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, s => { let b = ''; s.on('data', c => b += c); s.on('end', () => res({ status: s.statusCode, body: b })); }); r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); }); });
  const H = { K: { queueState: () => ({ running: false }) }, httpGet, runTool: async (n) => ({ text: n === 'salamat' ? 'سرور سالم' : 'یافت نشد' }) };
  fs.copyFileSync(path.join(__dirname, '..', 'واژه‌نامهٔ گفتگو.json'), path.join(tmp, 'واژه‌نامهٔ گفتگو.json'));
  const KB1 = require('../ketabkhane.js'); KB1.init(S, H);
  const M = require('../mizban.js'); M.init(S, H);
  await new Promise(r => setTimeout(r, 1200));   /* وضعیت و گزارش کتابخانه از کیس دو برسد */
  async function porsidan(history){
    const ev = []; let matn = '';
    const t0 = Date.now(); let nokhost = 0;
    await M.chat(history, (e, d) => { ev.push([e, d]); if (e === 'delta'){ if (!nokhost) nokhost = Date.now() - t0; matn += d; } }, {});
    return { ev, matn, masir: (ev.find(x => x[0] === 'masir') || [])[1] || {}, done: (ev.find(x => x[0] === 'done') || [])[1] || {}, nokhost };
  }
  const NIST = /در (منابع|کتابخانه)[^.\n]{0,20}(نیست|وجود ندارد)/;
  try {
    let r = await porsidan([{ role: 'user', content: 'سلام' }]);
    bar('«سلام» ← گفتگو، بی منبع', r.masir.qasd === 'goftogoo' && !r.ev.some(x => x[0] === 'tool') && !NIST.test(r.matn), r.matn.slice(0, 50));
    const b0 = BADANE.filter(b => b.stream && b.max_tokens !== 1).pop();
    bar('نمونه‌گیری گفتگو: temperature ۰٫۷، top_p ۰٫۹، repeat_penalty، presence_penalty، DRY', b0 && b0.temperature === 0.7 && b0.top_p === 0.9 && b0.repeat_penalty === 1.1 && b0.presence_penalty === 0.3 && b0.dry_multiplier === 0.8 && b0.dry_base === 1.75 && b0.dry_allowed_length === 2);
    bar('دستورالعمل کوتاه (کمتر از ۲۰۰۰ نویسه) و بی فهرست ابزار', b0 && b0.messages[0].content.length < 2000 && !/⟪ابزار⟫/.test(b0.messages[0].content), String(b0 && b0.messages[0].content.length));
    const h1 = [{ role: 'user', content: 'سلام' }, { role: 'assistant', content: r.matn }, { role: 'user', content: 'امروز خیلی خسته‌ام' }];
    r = await porsidan(h1);
    bar('ضدتکرار: مدل پاسخ پیشین را تکرار کرد ← پیش از نمایش قطع و دوباره ساخته شد', r.masir.qasd === 'goftogoo' && !r.matn.includes(h1[1].content.slice(0, 30)) && /خسته نباشید/.test(r.matn), r.matn.slice(0, 60));
    r = await porsidan([{ role: 'user', content: 'یه سوال دارم' }]);
    bar('«نیست»ِ نابه‌جا در گفتگو ← دوباره ساخته شد', r.masir.qasd === 'goftogoo' && !NIST.test(r.matn) && /بفرمایید/.test(r.matn), r.matn.slice(0, 60));
    r = await porsidan([{ role: 'user', content: 'اگه یکی چکم برگشت بخوره چیکار باید بکنم' }]);
    const mb = BADANE.filter(b => b.stream && b.max_tokens !== 1).pop(); const lt = mb.messages[mb.messages.length - 1].content;
    const manabe = (lt.match(/^\d\) .+$/gm) || []).slice(0, 3).join(' | ');
    bar('پرسش حقوقی محاوره‌ای ← منابع با «قانون صدور چک» در ۳ نخست، بی موافقت‌نامهٔ پستی', r.masir.qasd === 'porsesh_hoghooghi' && /قانون صدور چک/.test(manabe) && !/پستی/.test(manabe), manabe.slice(0, 160));
    bar('دستور تازهٔ حقوقی: «نزدیک‌ترین مواد + پرسش روشن‌کننده»، نه «فقط بنویس در منابع نیست»', /نزدیک‌ترین مواد/.test(mb.messages[0].content) && !/فقط بنویس «در منابع بازیابی‌شده نیست»/.test(lt));
    bar('نمونه‌گیری حقوقی: temperature ۰٫۳', mb.temperature === 0.3);
    const h2 = [{ role: 'user', content: 'اگه یکی چکم برگشت بخوره چیکار باید بکنم' }, { role: 'assistant', content: r.matn }, { role: 'user', content: 'خب حالا متن اون ماده رو کامل بنویس' }];
    r = await porsidan(h2);
    const yad = (/(ماده \d+) قانون صدور چک/.exec(h2[1].content) || [])[1];
    bar('ادامهٔ پیام قبل ← متن همان مادهٔ یادشده در پاسخ پیشین، بی مدل', r.masir.qasd === 'matn_madde' && !!yad && r.matn.includes(yad + ' - ') && /قانون صدور چک/.test(r.matn), (yad || '') + ' · ' + r.matn.slice(0, 50));
    r = await porsidan([h2[0], h2[1], { role: 'user', content: 'اگه طرف فرار کرده باشه چی' }]);
    bar('«اگه طرف فرار کرده باشه چی» ← ادامهٔ همان پرسش چک (حقوقی)', r.masir.qasd === 'porsesh_hoghooghi' && r.masir.payeh === 'edame');
    r = await porsidan([{ role: 'user', content: 'ماده ۱۰ قانون مدنی' }]);
    bar('«ماده ۱۰ قانون مدنی» ← متن درست', r.masir.qasd === 'matn_madde' && /ماده 10 - قراردادهای خصوصی/.test(r.matn));
    r = await porsidan([{ role: 'user', content: 'اصل ۴۰ قانون اساسی چی میگه' }]);
    bar('«اصل ۴۰ قانون اساسی چی میگه» ← متن درست + توضیح', r.masir.qasd === 'matn_madde' && /اصل 40 - هیچ‌کس/.test(r.matn));
    r = await porsidan([{ role: 'user', content: 'متن تمام قوانین موجود را از کتابخانه بیاور و بنویس' }]);
    bar('«متن تمام قوانین» ← محدودیت + فهرست دسته‌ها و شمار', r.masir.qasd === 'fehrest' && /در یک پیام جا نمی‌شود/.test(r.matn) && /مصوبات هیئت وزیران: ۲ متن/.test(r.matn), r.matn.split('\n').slice(0, 3).join(' / '));
    r = await porsidan([{ role: 'user', content: 'چند تا قانون تو کتابخونه داریم' }]);
    bar('«چند تا قانون تو کتابخونه داریم» ← شمار', r.masir.qasd === 'fehrest' && /۶ متن/.test(r.matn));
    r = await porsidan([{ role: 'user', content: 'فهرست مصوبات هیئت وزیران را بیاور' }]);
    bar('فهرست یک دسته صفحه‌به‌صفحه', r.masir.qasd === 'fehrest' && /دستهٔ «مصوبات هیئت وزیران»: ۲ متن/.test(r.matn));
    r = await porsidan([{ role: 'user', content: 'کل متن قانون صدور چک' }]);
    bar('«کل متن قانون صدور چک» ← متن رسمی ماده‌به‌ماده', r.masir.qasd === 'matn_qanun' && /متن رسمی قانون صدور چک/.test(r.matn) && /ماده 11/.test(r.matn));
    r = await porsidan([{ role: 'user', content: 'سلامت سرور و مدل را بسنج و اگر مشکلی هست بگو' }]);
    bar('وضعیت سرور ← گزارش قطعی', r.masir.qasd === 'vaziat' && /گزارش وضعیت/.test(r.matn) && /(مشکلی دیده نشد|مشکل‌ها)/.test(r.matn));
    KOND = 6000; META.mizban_mohlat_bazyabi = '1500';
    r = await porsidan([{ role: 'user', content: 'مهریه رو چطوری میشه گرفت' }]);
    KOND = 0; delete META.mizban_mohlat_bazyabi;
    bar('کتابخانهٔ کند ← «دیر جواب داد»، دو بار پرسیده، و هرگز «در منابع نیست»', r.masir.qasd === 'porsesh_hoghooghi' && /دیر جواب داد/.test(r.matn) && !NIST.test(r.matn) && r.ev.some(x => x[0] === 'status' && /یک بار دیگر/.test(x[1])), r.matn.slice(0, 60));
    const log = fs.readFileSync(path.join(tmp, 'ارزیابی گفتگو.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    bar('ثبت ارزیابی: هر گفتگو یک سطر با قصد، بازنویسی، منابع، زمان‌ها و پاسخ', log.length === 14 && log.every(x => x.id && x.qasd && x.zaman && typeof x.zaman.kol === 'number') && log.some(x => x.baznevisi && x.baznevisi.ebarat.includes('چک برگشتی') && x.manabe && x.manabe.length));
    bar('«پاسخ بد بود» برچسب به همان ثبت می‌زند', M.barchasbBad(log[0].id, 'آزمون') && /"bad":true/.test(fs.readFileSync(path.join(tmp, 'ارزیابی گفتگو.jsonl'), 'utf8')));
    const af = M.vazhenameAfzoodan({ mohavere: ['طرف زیرش زد'], hoghooghi: ['نقض تعهد'], qanunha: ['قانون مدنی'] });
    bar('افزودن مدخل به واژه‌نامه؛ نسخهٔ پیشین در سطل زباله', af.ok && fs.readdirSync(path.join(tmp, 'سطل زباله', 'خانه کلود', 'سرور', 'واژه‌نامهٔ گفتگو — نسخه‌های پیشین')).length === 1);
  } catch(e){ console.error(e); process.exitCode = 1; }
  finally { try { KB2.stopAll(); KB1.stopAll(); M.stopApp(); } catch(e){} setTimeout(() => process.exit(process.exitCode || 0), 50); }
})();
