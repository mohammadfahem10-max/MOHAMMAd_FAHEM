#!/usr/bin/env node
/* =====================================================================
   آزمون پذیرش گفتگوی میزبان شخصی — دستور کار «درمان گفتگو» بخش ۳
   ---------------------------------------------------------------------
   اجرا (از پوشهٔ سرور):
     node "ابزار/آزمون-گفتگو.js" --barchasb pish            ← روی میزبان روشن (http://127.0.0.1:8795)، پیش از تغییر
     node "ابزار/آزمون-گفتگو.js" --barchasb pas             ← پس از تغییر
     node "ابزار/آزمون-گفتگو.js" --moghayese <پیش.json> <پس.json>   ← جدول کنار هم (قانون ۴۸)
     node "ابزار/آزمون-گفتگو.js" --bi-model                 ← فقط مسیریاب و بازنویسی (بی مدل و بی سرور)
   گزینه‌ها: --neshani http://127.0.0.1:8795 · --faghat 01,05,33 · --goruh hoghooghi
   نتیجه‌ها در «آزمون‌ها/نتیجه‌ها/» (JSON برای مقایسه + Markdown برای خواندن) نوشته می‌شود.
   سنجه‌های خودکار: قصد، «در منابع نیست»ِ نابه‌جا، قانون درست در ۳ منبع نخست، متن ماده، فهرست دسته‌ها،
   تکرار پاسخ پیشین (shingle سه‌واژه‌ای ≥ ۸۵٪)، زمان تا نخستین واژه. «مرتبط بودن» پاسخ گفتگو داوری انسانی می‌خواهد:
   پاسخ‌ها کنار «رفتار درست» در گزارش Markdown آمده‌اند.
   ===================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const GF = require('../goftogoo.js');
const PAROVANDE = path.join(__dirname, '..', 'آزمون‌ها', 'آزمون گفتگو.json');
const NATIJE = path.join(__dirname, '..', 'آزمون‌ها', 'نتیجه‌ها');
const NIST = s => GF.nistNabeja(s);
const bi = s => GF.norm(s).replace(/ /g, '');
const fa = n => GF.faRagham(n);

function barPorseshha(){ return JSON.parse(fs.readFileSync(PAROVANDE, 'utf8')); }

/* ---------------------- حالت بی مدل: فقط مسیریاب و بازنویسی ---------------------- */
/* پاسخ ساختگی پیام‌های پیشین (همان شکلی که سرور تازه می‌سازد) تا ارجاع‌ها («اون ماده»، «ادامه بده») سنجیده شوند */
function pasokhSakhtegi(q, masir, bz){
  if (masir.qasd === 'porsesh_hoghooghi') return 'بر پایهٔ ماده ۳ ' + (bz.qanunha[0] || 'قانون مدنی') + '، … آیا جزئیات بیشتری دارید؟';
  if (masir.qasd === 'matn_madde') return 'متن رسمی ' + (masir.madde.qanun || '') + ' — ' + masir.madde.noe + ' ' + masir.madde.shomare + '\n…';
  if (masir.qasd === 'fehrest' && masir.fehrest && masir.fehrest.noe === 'daste_safhe') return 'دستهٔ «قوانین مجلس»: … برای صفحهٔ بعد بگویید «ادامه بده». 〔فهرست ' + (masir.fehrest.lar || 'hame') + ' از 50〕';
  if (masir.qasd === 'matn_qanun') return 'متن رسمی ' + (masir.matn.nam || '') + '\n… 〔متن 1001 از 30〕';
  return 'باشه، در خدمتم.';
}
function masirBiModel(porseshha, vn){
  const out = [];
  for (const c of porseshha){
    const history = [];
    for (const p of (c.tanha ? [] : c.pishin || [])){
      history.push({ role: 'user', content: p });
      const m = GF.masiryab(p, history, vn); const bz = GF.baznevisi(p, m, history);
      history.push({ role: 'assistant', content: pasokhSakhtegi(p, m, bz) });
    }
    history.push({ role: 'user', content: c.porsesh });
    const m = GF.masiryab(c.porsesh, history, vn); const bz = GF.baznevisi(c.porsesh, m, history);
    out.push({ id: c.id, goruh: c.goruh, porsesh: c.porsesh, qasd: m.qasd, dorost: c.qasd.includes(m.qasd), dalil: m.dalil, etminan: m.etminan, ebarat: bz.ebarat, qanunha: bz.qanunha, madde: m.madde || null });
  }
  return out;
}

/* ---------------------- حالت زنده: پرسش از میزبان روشن ---------------------- */
async function porsidan(neshani, history, mohlatMs){
  const t0 = Date.now(); let nokhost = 0, matn = ''; const ev = { masir: null, manabe: null, done: null, tool: [], error: '' };
  const ac = new AbortController(); const to = setTimeout(() => ac.abort(), mohlatMs || 300000);
  try {
    const r = await fetch(neshani.replace(/\/$/, '') + '/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history }), signal: ac.signal });
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;){
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0){
        const e = buf.slice(0, i); buf = buf.slice(i + 2); let type = 'message', data = '';
        for (const l of e.split('\n')){ if (l.startsWith('event:')) type = l.slice(6).trim(); else if (l.startsWith('data:')) data += l.slice(5).trim(); }
        let d = null; try { d = JSON.parse(data); } catch(x){ continue; }
        if (type === 'delta'){ if (!nokhost && d) nokhost = Date.now() - t0; matn += d; }
        else if (type === 'masir') ev.masir = d; else if (type === 'manabe') ev.manabe = d; else if (type === 'done') ev.done = d;
        else if (type === 'tool') ev.tool.push(d); else if (type === 'error') ev.error = String(d);
      }
    }
  } catch(e){ ev.error = ev.error || (e.name === 'AbortError' ? 'مهلت ' + Math.round((mohlatMs || 300000) / 1000) + ' ثانیه' : e.message); }
  finally { clearTimeout(to); }
  return { matn, nokhost, kol: Date.now() - t0, ev };
}
function sanjesh(c, r, pishinPasokh){
  const s = { id: c.id, goruh: c.goruh, porsesh: c.porsesh, raftarDorost: c.raftarDorost, pasokh: r.matn, qasd: r.ev.masir ? r.ev.masir.qasd : '', nokhost: r.nokhost, kol: r.kol, khata: r.ev.error };
  s.qasdDorost = r.ev.masir ? c.qasd.includes(r.ev.masir.qasd) : null;   /* سرور پیشین رخداد masir ندارد */
  s.nist = NIST(r.matn);
  s.bayad = (c.bayad || []).every(x => new RegExp(x).test(r.matn));
  s.nabayad = !(c.nabayad || []).some(x => new RegExp(x).test(r.matn));
  const manabe = (r.ev.manabe || []).slice(0, 3);
  s.manabe = manabe.map(x => x.onvan + (x.madde ? ' — ' + x.madde : ''));
  if (c.qanunDorost){
    const dar = t => c.qanunDorost.some(q => bi(t).includes(bi(q)));
    s.qanunDarSeNokhost = manabe.length ? manabe.some(x => dar(x.onvan)) : dar(r.matn);   /* بی رخداد منابع (سرور پیشین): نام قانون در پاسخ */
  }
  if (c.madde){
    const m = c.madde, hadaf = (m.asl ? 'اصل ' : 'ماده ') + m.shomare;
    const m0 = (r.ev.manabe || [])[0];
    const azManabe = m0 && String(m0.madde || '').replace(/\s+/g, ' ').trim() === hadaf && bi(m0.onvan).includes(bi(m.qanun));
    const azMatn = new RegExp('(ماده|اصل)\\s*(' + m.shomare + '|' + fa(m.shomare) + ')\\b').test(r.matn) && bi(r.matn).includes(bi(m.qanun)) && /متن رسمی/.test(r.matn);
    s.maddeDorost = !!(azManabe && /متن رسمی/.test(r.matn)) || azMatn;
  }
  if (c.fehrestDaste) s.fehrestDorost = (r.matn.match(/^• .+[0-9۰-۹].*$/gm) || []).length >= 3;
  if (pishinPasokh) s.shebahatPishin = Math.round(GF.shebahat(r.matn, pishinPasokh) * 100) / 100;
  s.tekrar = s.shebahatPishin !== undefined && s.shebahatPishin >= GF.HAD_TEKRAR;
  return s;
}
function jamBandi(natayej, meyar){
  const n = (f, p) => { const a = natayej.filter(f); return { kol: a.length, qaboul: a.filter(p).length }; };
  const jam = {
    goftogoo: n(x => x.goruh === 'goftogoo' || x.goruh === 'namafhoom' || x.goruh === 'edame' && (x.qasdMontazar || []).includes('goftogoo'), x => !x.nist && x.qasdDorost !== false && !x.khata),
    hoghooghi: n(x => x.qanunDarSeNokhost !== undefined, x => x.qanunDarSeNokhost),
    madde: n(x => x.maddeDorost !== undefined, x => x.maddeDorost),
    fehrest: n(x => x.fehrestDorost !== undefined, x => x.fehrestDorost),
    tekrar: n(x => x.shebahatPishin !== undefined, x => x.tekrar),
    zaman: n(x => !x.khata, x => x.nokhost > 0 && x.nokhost < 20000),
    qasd: n(x => x.qasdDorost !== null && x.qasdDorost !== undefined, x => x.qasdDorost),
  };
  const nokhostha = natayej.filter(x => x.nokhost > 0).map(x => x.nokhost).sort((a, b) => a - b);
  const sad = p => nokhostha.length ? nokhostha[Math.min(nokhostha.length - 1, Math.floor(p * nokhostha.length))] : 0;
  jam.zamanAmar = { miane: sad(0.5), sad90: sad(0.9), bishine: nokhostha[nokhostha.length - 1] || 0 };
  jam.meyar = meyar.map(m => { const j = jam[m.kelid] || { kol: 0, qaboul: 0 }; const nesbat = j.kol ? j.qaboul / j.kol : null; return Object.assign({}, m, j, { nesbat, gozasht: nesbat === null ? null : (m.kamtar ? j.qaboul <= m.had : nesbat >= m.had) }); });
  return jam;
}
const darsad = x => x === null || x === undefined ? '—' : fa(Math.round(x * 100)) + '٪';
function gozareshMd(o){
  const L = ['# آزمون پذیرش گفتگوی میزبان شخصی — ' + o.barchasb, '', 'زمان: ' + o.t + ' · نشانی: ' + o.neshani + ' · شمار پرسش: ' + fa(o.natayej.length), '', '| معیار | حد قبولی | نتیجه | گذشت؟ |', '|---|---|---|---|'];
  for (const m of o.jam.meyar) L.push('| ' + m.onvan + ' | ' + (m.kamtar ? 'صفر' : darsad(m.had)) + ' | ' + (m.kamtar ? fa(m.qaboul) + ' مورد از ' + fa(m.kol) : fa(m.qaboul) + ' از ' + fa(m.kol) + ' (' + darsad(m.nesbat) + ')') + ' | ' + (m.gozasht === null ? '—' : m.gozasht ? '✅' : '❌') + ' |');
  L.push('', 'زمان تا نخستین واژه: میانه ' + fa((o.jam.zamanAmar.miane / 1000).toFixed(1)) + ' ث · ۹۰٪ ' + fa((o.jam.zamanAmar.sad90 / 1000).toFixed(1)) + ' ث · بیشینه ' + fa((o.jam.zamanAmar.bishine / 1000).toFixed(1)) + ' ث', '', '## پرسش‌ها', '');
  for (const x of o.natayej){
    const bad = [x.nist && '«نیست»ِ نابه‌جا', x.qasdDorost === false && 'قصد نادرست (' + x.qasd + ')', x.qanunDarSeNokhost === false && 'قانون درست در ۳ نخست نیست', x.maddeDorost === false && 'متن ماده نیامد', x.fehrestDorost === false && 'فهرست دسته‌ها نیامد', x.tekrar && 'تکرار پاسخ پیشین', !x.bayad && 'عبارت لازم نیامد', x.khata && 'خطا: ' + x.khata].filter(Boolean);
    L.push('### ' + x.id + ' · ' + x.porsesh + ' ' + (bad.length ? '❌' : '✅'), '', '- قصد: ' + (x.qasd || '—') + ' · نخستین واژه: ' + fa((x.nokhost / 1000).toFixed(1)) + ' ث · کل: ' + fa((x.kol / 1000).toFixed(1)) + ' ث' + (x.shebahatPishin !== undefined ? ' · شباهت با پاسخ پیشین: ' + darsad(x.shebahatPishin) : ''));
    if (bad.length) L.push('- ایراد: ' + bad.join('، '));
    if (x.manabe && x.manabe.length) L.push('- ۳ منبع نخست: ' + x.manabe.join(' | '));
    L.push('- رفتار درست: ' + x.raftarDorost, '', '> ' + String(x.pasokh || '').slice(0, 700).replace(/\n/g, '\n> '), '');
  }
  return L.join('\n');
}
function moghayese(a, b){
  const L = ['# مقایسهٔ پیش و پس — آزمون پذیرش گفتگو', '', 'پیش: ' + a.barchasb + ' (' + a.t + ') · پس: ' + b.barchasb + ' (' + b.t + ')', '', '| معیار | حد قبولی | ' + a.barchasb + ' | ' + b.barchasb + ' |', '|---|---|---|---|'];
  for (const m of b.jam.meyar){ const p = a.jam.meyar.find(x => x.kelid === m.kelid) || {}; const f = x => x.kamtar ? fa(x.qaboul || 0) + ' مورد' : darsad(x.nesbat) + (x.gozasht ? ' ✅' : x.gozasht === false ? ' ❌' : ''); L.push('| ' + m.onvan + ' | ' + (m.kamtar ? 'صفر' : darsad(m.had)) + ' | ' + f(p) + ' | ' + f(m) + ' |'); }
  L.push('| زمان تا نخستین واژه (میانه) | کمتر از ۲۰ ث | ' + fa((a.jam.zamanAmar.miane / 1000).toFixed(1)) + ' ث | ' + fa((b.jam.zamanAmar.miane / 1000).toFixed(1)) + ' ث |', '', '## پرسش‌به‌پرسش', '', '| # | پرسش | ' + a.barchasb + ' | ' + b.barchasb + ' |', '|---|---|---|---|');
  const vaz = x => !x ? '—' : [x.nist ? '«نیست»' : '', x.qanunDarSeNokhost === false ? 'قانون نادرست' : '', x.maddeDorost === false ? 'ماده نیامد' : '', x.fehrestDorost === false ? 'فهرست نیامد' : '', x.tekrar ? 'تکرار' : '', x.khata ? 'خطا' : ''].filter(Boolean).join('، ') || '✅';
  for (const x of b.natayej){ const p = a.natayej.find(y => y.id === x.id); L.push('| ' + x.id + ' | ' + x.porsesh + ' | ' + vaz(p) + ' | ' + vaz(x) + ' |'); }
  return L.join('\n');
}
function arg(n, pish){ const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : pish; }
function nevesht(nam, matn){ fs.mkdirSync(NATIJE, { recursive: true }); const f = path.join(NATIJE, nam); fs.writeFileSync(f, matn, 'utf8'); return f; }

async function main(){
  const P = barPorseshha();
  const vn = GF.barVazhename(path.join(__dirname, '..', 'واژه‌نامهٔ گفتگو.json'));
  if (process.argv.includes('--moghayese')){
    const i = process.argv.indexOf('--moghayese'); const a = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')), b = JSON.parse(fs.readFileSync(process.argv[i + 2], 'utf8'));
    const f = nevesht('مقایسه ' + a.barchasb + ' و ' + b.barchasb + '.md', moghayese(a, b)); console.log(moghayese(a, b)); console.log('\n→ ' + f); return;
  }
  let porseshha = P.porseshha;
  const faghat = arg('--faghat', ''); if (faghat) porseshha = porseshha.filter(c => faghat.split(',').includes(c.id));
  const goruh = arg('--goruh', ''); if (goruh) porseshha = porseshha.filter(c => c.goruh === goruh);
  if (process.argv.includes('--bi-model')){
    const r = masirBiModel(porseshha, vn); const ok = r.filter(x => x.dorost).length;
    for (const x of r) console.log((x.dorost ? '✅ ' : '❌ ') + x.id + ' ' + x.qasd.padEnd(18) + ' ' + x.porsesh + (x.ebarat.length ? '  ← ' + x.ebarat.slice(0, 3).join('، ') : '') + (x.qanunha.length ? '  [' + x.qanunha.slice(0, 2).join('، ') + ']' : ''));
    console.log('\nقصد درست: ' + fa(ok) + ' از ' + fa(r.length)); process.exitCode = ok === r.length ? 0 : 1; return;
  }
  const neshani = arg('--neshani', 'http://127.0.0.1:8795'), barchasb = arg('--barchasb', 'azmoon');
  const natayej = [];
  for (const c of porseshha){
    const history = []; let pishinPasokh = '';
    for (const p of (c.tanha ? [] : c.pishin || [])){ history.push({ role: 'user', content: p }); const r0 = await porsidan(neshani, history); history.push({ role: 'assistant', content: r0.matn }); pishinPasokh = r0.matn; }
    history.push({ role: 'user', content: c.porsesh });
    const r = await porsidan(neshani, history);
    const s = sanjesh(c, r, pishinPasokh || undefined); s.qasdMontazar = c.qasd; natayej.push(s);
    console.log((s.nist || s.qasdDorost === false || s.qanunDarSeNokhost === false || s.maddeDorost === false || s.fehrestDorost === false || s.tekrar || s.khata ? '❌ ' : '✅ ') + c.id + ' ' + c.porsesh + ' · ' + (s.qasd || '—') + ' · ' + fa((s.nokhost / 1000).toFixed(1)) + ' ث');
  }
  const jam = jamBandi(natayej, P.meyar);
  const o = { barchasb, t: new Date().toISOString(), neshani, jam, natayej };
  const nam = 'آزمون گفتگو ' + barchasb + ' ' + o.t.slice(0, 16).replace(/[:T]/g, '-');
  const fj = nevesht(nam + '.json', JSON.stringify(o, null, 1)), fm = nevesht(nam + '.md', gozareshMd(o));
  console.log('\n' + jam.meyar.map(m => (m.gozasht === null ? '—  ' : m.gozasht ? '✅ ' : '❌ ') + m.onvan + ': ' + (m.kamtar ? fa(m.qaboul) + ' مورد' : darsad(m.nesbat))).join('\n'));
  console.log('\n→ ' + fj + '\n→ ' + fm);
  process.exitCode = jam.meyar.every(m => m.gozasht !== false) ? 0 : 1;
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { masirBiModel, pasokhSakhtegi, porsidan, sanjesh, jamBandi, gozareshMd, moghayese };
