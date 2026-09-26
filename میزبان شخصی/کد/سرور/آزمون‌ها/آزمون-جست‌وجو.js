/* آزمون یکپارچهٔ جست‌وجوی کتابخانه (کیس دو) روی یک پایگاه کوچک ساختگی — بی مدل و بی شبکه
   اجرا: node "آزمون‌ها/آزمون-جست‌وجو.js"   (از پوشهٔ سرور؛ Node 22 به بالا برای node:sqlite)
   می‌سنجد: پرسش محاوره‌ای با بازنویسی ← «قانون صدور چک» در ۳ نتیجهٔ نخست و موافقت‌نامهٔ پستی بیرون از آن‌ها؛
   «ماده ۱۰ قانون مدنی» ← همان ماده در رتبهٔ نخست؛ بودجهٔ زمان؛ حافظهٔ نهان؛ متن بخش‌به‌بخش؛ فهرست با دسته. */
'use strict';
process.removeAllListeners('warning');
const path = require('path');
const G = require('../goftogoo.js');
G.barVazhename(path.join(__dirname, '..', 'واژه‌نامهٔ گفتگو.json'));
const { KB } = require('./کتابخانهٔ-ساختگی.js').besaz();
const bar = (n, ok, x) => { console.log((ok ? '✅ ' : '❌ ') + n + (x ? ' — ' + x : '')); if (!ok) process.exitCode = 1; };
(async () => {
  try {
    const q1 = 'اگه یکی چکم برگشت بخوره چیکار باید بکنم';
    const m1 = G.masiryab(q1, [{ role: 'user', content: q1 }]); const b1 = G.baznevisi(q1, m1, []);
    const r1 = await KB.jostojoo(q1, 5, { ebarat: b1.ebarat, vazheha: b1.vazheha, qanunha: b1.qanunha, porsesh: b1.porsesh, mohlat: 9000 });
    const top3 = r1.natayej.slice(0, 3).map(x => x.onvan);
    bar('چک برگشتی محاوره‌ای ← قانون صدور چک در ۳ نتیجهٔ نخست', top3.includes('قانون صدور چک'), top3.join(' | '));
    bar('موافقت‌نامهٔ پستی و تصویب‌نامهٔ اعتبار در ۳ نتیجهٔ نخست نیستند', !top3.some(t => /پستی|تخصیص/.test(t)));
    bar('زمان هر مرحله برمی‌گردد', r1.zaman && typeof r1.zaman.fts === 'number' && typeof r1.zaman.kol === 'number', JSON.stringify(r1.zaman));
    const r0 = await KB.jostojoo(q1, 5, {});
    const top3b = r0.natayej.slice(0, 3).map(x => x.onvan);
    console.log('   (برای مقایسه، بی بازنویسی: ' + top3b.join(' | ') + ')');
    const r1b = await KB.jostojoo(q1, 5, { ebarat: b1.ebarat, vazheha: b1.vazheha, qanunha: b1.qanunha, porsesh: b1.porsesh, mohlat: 9000 });
    bar('پرسش تکراری از حافظهٔ نهان', r1b.kesh === true || r1.chera === 'بی‌بردار' && r1b.natayej.length === r1.natayej.length);
    const r2 = await KB.jostojoo('ماده ۱۰ قانون مدنی', 4, { manaei: false, mohlat: 8000 });
    bar('«ماده ۱۰ قانون مدنی» ← همان ماده در رتبهٔ نخست', r2.natayej[0] && r2.natayej[0].onvan === 'قانون مدنی' && r2.natayej[0].madde === 'ماده 10', r2.natayej[0] && r2.natayej[0].onvan + ' ' + r2.natayej[0].madde);
    const q3 = 'اجاره خونه تموم شده صاحبخونه وسایلمو بیرون ریخته';
    const m3 = G.masiryab(q3, []); const b3 = G.baznevisi(q3, m3, []);
    const r3 = await KB.jostojoo(q3, 5, { ebarat: b3.ebarat, vazheha: b3.vazheha, qanunha: b3.qanunha, porsesh: b3.porsesh, mohlat: 9000 });
    bar('صاحبخونه/تخلیه ← قانون روابط موجر و مستأجر در ۳ نتیجهٔ نخست', r3.natayej.slice(0, 3).some(x => /موجر/.test(x.onvan)), r3.natayej.slice(0, 3).map(x => x.onvan).join(' | '));
    const mt = KB.matnQanunJson({ onvan: 'قانون صدور چک', offset: 0, limit: 3 });
    bar('متن قانون بخش‌به‌بخش (۳ ماده، سپس ادامه)', mt.ok && mt.tekkeha.length === 3 && mt.baadi === 3 && mt.kol === 5, mt.ok ? mt.onvan + ' ' + mt.tekkeha.map(t => t.madde).join('،') : mt.text);
    const mt2 = KB.matnQanunJson({ shenase: mt.shenase, offset: mt.baadi, limit: 3 });
    bar('ادامهٔ متن با شناسه', mt2.ok && mt2.tekkeha.length === 2 && mt2.baadi === 0);
    const fh = KB.fehrestJson({ lar: 'lar8', limit: 10 });
    bar('فهرست با دسته (lar8)', fh.ok && fh.kol === 2 && fh.rows.length === 2, fh.nam);
    const fh2 = KB.fehrestJson({ limit: 2, offset: 2 });
    bar('فهرست صفحه‌به‌صفحه', fh2.ok && fh2.kol === 6 && fh2.rows.length === 2);
  } catch(e){ console.error(e); process.exitCode = 1; }
  finally { try { KB.stopAll(); } catch(e){} setTimeout(() => process.exit(process.exitCode || 0), 50); }
})();
