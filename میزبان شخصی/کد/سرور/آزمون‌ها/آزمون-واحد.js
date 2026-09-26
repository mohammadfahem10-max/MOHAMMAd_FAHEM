/* آزمون‌های واحدِ بی‌نیاز به مدل — دستور کار «درمان گفتگو» بخش ۰-الف
   مسیریاب قاعده‌ای، واژه‌نامه، بازنویسی، ضدتکرار، «نیست»ِ نابه‌جا، تاریخچهٔ کوتاه، دستورالعمل و نمونه‌گیری،
   مسیریاب مدلی (با فراخوان ساختگی)، و رتبه‌بندی/سازندهٔ پرسش FTS کیس دو.
   اجرا (از پوشهٔ سرور): node --test "آزمون‌ها/آزمون-واحد.js" */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const path = require('path'), fs = require('fs');
const GF = require('../goftogoo.js');
const RT = require('../../گره دوم/ketab/rotbe.js');
const AZ = require('../ابزار/آزمون-گفتگو.js');
const VN_FILE = path.join(__dirname, '..', 'واژه‌نامهٔ گفتگو.json');
const vn = GF.barVazhename(VN_FILE);
const P = JSON.parse(fs.readFileSync(path.join(__dirname, 'آزمون گفتگو.json'), 'utf8'));

test('واژه‌نامه: دست‌کم ۵۰۰ عبارت محاوره‌ای و ساختار درست', () => {
  const j = JSON.parse(fs.readFileSync(VN_FILE, 'utf8'));
  assert.ok(j.madkhal.length >= 450, 'مدخل: ' + j.madkhal.length);
  assert.ok(vn.olgoo.length >= 500, 'عبارت محاوره‌ای: ' + vn.olgoo.length);
  for (const m of j.madkhal){ assert.ok(m.mohavere.length && m.hoghooghi.length && m.qanunha.length, JSON.stringify(m).slice(0, 80)); }
  for (const [mohavere, hoghooghi] of [['صاحبخونه', 'موجر'], ['چکم برگشت خورد', 'چک برگشتی'], ['طلبمو نمیده', 'مطالبهٔ وجه'], ['شکایت کنم', 'شکوائیه'], ['قولنامه', 'مبایعه‌نامه'], ['مهریه‌مو', 'مهریه'], ['اجرائیه خوردم', 'اجرائیه'], ['ابلاغیه اومده', 'ابلاغیه'], ['ممنوع‌الخروج', 'ممنوع‌الخروجی'], ['شرکتمو ثبت کنم', 'ثبت شرکت']])
    assert.ok(GF.tatbigh(mohavere, vn).hoghooghi.includes(hoghooghi), mohavere + ' ← ' + hoghooghi);
});
test('واژه‌نامه: پسوندهای محاوره‌ای و جداکردن واژهٔ کامل', () => {
  assert.ok(GF.tatbigh('چکش برگشت خورده', vn).hoghooghi.includes('چک برگشتی'));
  assert.ok(GF.tatbigh('صابخونه‌م', vn).hoghooghi.includes('موجر'));
  assert.deepStrictEqual(GF.tatbigh('امروز خیلی خسته‌ام', vn).hits, []);
  assert.strictEqual(GF.tatbigh('بچه‌م مریضه', vn).qavi, 0, 'واژهٔ عمومی به‌تنهایی حقوقی نیست');
  assert.ok(GF.tatbigh('صاحبخونه وسایلمو ریخته بیرون', vn).pooshide.length >= 2);
});
test('واژه‌نامه: افزودن کارفرما در همان پیام بعد خوانده می‌شود', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vn-'));
  const f = path.join(tmp, 'v.json'); const j = JSON.parse(fs.readFileSync(VN_FILE, 'utf8'));
  fs.writeFileSync(f, JSON.stringify(j)); assert.strictEqual(GF.tatbigh('طرف زیرش زد', GF.barVazhename(f)).hits.length, 0);
  j.madkhal.push({ goruh: 'افزودهٔ کارفرما', mohavere: ['طرف زیرش زد'], hoghooghi: ['نقض تعهد'], qanunha: ['قانون مدنی'] });
  fs.writeFileSync(f, JSON.stringify(j)); const t = Date.now() / 1000 + 5; fs.utimesSync(f, t, t);
  assert.ok(GF.tatbigh('طرف زیرش زد', GF.barVazhename(f)).hoghooghi.includes('نقض تعهد'));
  GF.barVazhename(VN_FILE);
});

test('مسیریاب قاعده‌ای: هر ۷۱ پرسش آزمون پذیرش (با زمینهٔ پیام‌های پیشین) قصد درست می‌گیرند', () => {
  const r = AZ.masirBiModel(P.porseshha, vn);
  const bad = r.filter(x => !x.dorost).map(x => x.id + ' ' + x.porsesh + ' ← ' + x.qasd);
  assert.ok(P.porseshha.length >= 60, 'شمار پرسش‌ها: ' + P.porseshha.length);
  assert.deepStrictEqual(bad, []);
});
test('مسیریاب: گفتگوی عادی هرگز به کتابخانه نمی‌رود', () => {
  for (const q of ['سلام', 'خوبی', 'امروز خیلی خسته‌ام', 'مرسی عالی بود', 'یه سوال دارم', 'چه خبر', 'دمت گرم', 'حالم خوب نیست'])
    assert.strictEqual(GF.masiryab(q, [{ role: 'user', content: q }], vn).qasd, 'goftogoo', q);
});
test('مسیریاب: ماده/اصل + عدد و نام قانون', () => {
  let m = GF.masiryab('ماده ۱۰ قانون مدنی', [], vn); assert.deepStrictEqual([m.qasd, m.madde.shomare, m.madde.qanun], ['matn_madde', 10, 'قانون مدنی']);
  m = GF.masiryab('اصل ۴۰ چی میگه', [], vn); assert.deepStrictEqual([m.qasd, m.madde.noe, m.madde.qanun, m.madde.tozih], ['matn_madde', 'اصل', 'قانون اساسی', true]);
  m = GF.masiryab('مادهٔ ۳ قانون صدور چک را بیاور', [], vn); assert.strictEqual(m.madde.qanun, 'قانون صدور چک');
});
test('مسیریاب: ارجاع به پیش («اون ماده»، «ادامه بده»، «اگه … چی»)', () => {
  const h = [{ role: 'user', content: 'اگه یکی چکم برگشت بخوره چیکار باید بکنم' }, { role: 'assistant', content: 'طبق ماده ۴ قانون صدور چک، بانک باید گواهی عدم پرداخت بدهد؛ همچنین ماده ۲ …' }];
  let m = GF.masiryab('خب حالا متن اون ماده رو کامل بنویس', h.concat([{ role: 'user', content: 'خب حالا متن اون ماده رو کامل بنویس' }]), vn);
  assert.deepStrictEqual([m.qasd, m.madde.shomare, m.madde.qanun], ['matn_madde', 4, 'قانون صدور چک']);
  m = GF.masiryab('اگه طرف فرار کرده باشه چی', h.concat([{ role: 'user', content: 'اگه طرف فرار کرده باشه چی' }]), vn);
  assert.deepStrictEqual([m.qasd, m.payeh], ['porsesh_hoghooghi', 'edame']);
  const bz = GF.baznevisi('اگه طرف فرار کرده باشه چی', m, h);
  assert.ok(bz.ebarat.includes('چک برگشتی') && bz.ebarat.includes('متواری'), bz.ebarat.join('، '));
  const hf = [{ role: 'user', content: 'فهرست قوانین مجلس را بیاور' }, { role: 'assistant', content: '… برای صفحهٔ بعد بگویید «ادامه بده». 〔فهرست lar2 از 50〕' }, { role: 'user', content: 'ادامه بده' }];
  m = GF.masiryab('ادامه بده', hf, vn); assert.deepStrictEqual([m.qasd, m.fehrest.lar, m.fehrest.offset], ['fehrest', 'lar2', 50]);
  m = GF.masiryab('بیشتر توضیح بده', [{ role: 'user', content: 'تو کی هستی' }, { role: 'assistant', content: 'میزبان شخصی هستم' }, { role: 'user', content: 'بیشتر توضیح بده' }], vn);
  assert.strictEqual(m.qasd, 'goftogoo', 'ادامهٔ گفتگوی عادی، گفتگو می‌ماند');
});
test('بازنویسی: واژهٔ محاوره‌ای که به اصطلاح حقوقی برگشته از پرسش FTS بیرون می‌رود؛ نام قانون حدس زده می‌شود', () => {
  const q = 'اگه یکی چکم برگشت بخوره چیکار باید بکنم';
  const bz = GF.baznevisi(q, GF.masiryab(q, [], vn), []);
  assert.ok(bz.ebarat.includes('چک برگشتی')); assert.ok(bz.qanunha.includes('قانون صدور چک'));
  assert.ok(!bz.vazheha.includes('برگشت') && !bz.vazheha.includes('بخوره') && !bz.vazheha.includes('چیکار'), bz.vazheha.join('،'));
  assert.ok(bz.porsesh.includes(q), 'پرسش اصلی در پرسش معنایی می‌ماند (افزودن، نه جایگزینی)');
  const fts = RT.sazandeFts({ ebarat: bz.ebarat, vazheha: bz.vazheha });
  assert.ok(fts.includes('"چک برگشتی"') && !/برگشت"|"بخوره/.test(fts.replace('"چک برگشتی"', '')), fts);
});
test('نام قانون و ماده از متن', () => {
  assert.strictEqual(GF.namQanun('قانون آیین دادرسی کیفری متنشو برام بنویس'), 'قانون آیین دادرسی کیفری');
  assert.strictEqual(GF.namQanun('چند تا قانون تو کتابخونه داریم'), '');
  assert.deepStrictEqual(GF.maddeAzMatn('مادهٔ ۱۰ از قانون مدنی می‌گوید …'), { noe: 'ماده', shomare: 10, qanun: 'قانون مدنی' });
  assert.deepStrictEqual(GF.maddeAzMatn('طبق ماده ۳ قانون صدور چک، صادرکننده باید …'), { noe: 'ماده', shomare: 3, qanun: 'قانون صدور چک' });
});

test('ضدتکرار: شباهت shingle سه‌واژه‌ای', () => {
  const a = 'بر پایهٔ ماده ۴ قانون صدور چک بانک باید گواهی عدم پرداخت صادر کند و دارنده می‌تواند اجرائیه بگیرد';
  assert.strictEqual(GF.shebahat(a, a), 1);
  assert.ok(GF.tekrari(a, ['سلام', a]).tekrari);
  assert.ok(!GF.tekrari('خسته نباشید! کمی استراحت کنید و اگر کاری هست بگویید', [a]).tekrari);
  assert.ok(GF.poosheshAghaz(a.slice(0, 60), a) >= GF.HAD_TEKRAR, 'آغاز پاسخ تکراری پیش از نمایش شناخته می‌شود');
});
test('«در منابع نیست»ِ نابه‌جا', () => {
  for (const s of ['در منابع بازیابی‌شده نیست', 'پاسخ این پرسش در منابع نیست.', 'این موضوع در کتابخانهٔ حقوقی وجود ندارد', 'در منبع وجود ندارد']) assert.ok(GF.nistNabeja(s), s);
  for (const s of ['سلام! در خدمتم', 'مادهٔ ۴ قانون صدور چک می‌گوید …', 'در کتابخانه متنی نزدیک به این پرسش نیافتم']) assert.ok(!GF.nistNabeja(s), s);
});
test('تاریخچهٔ کوتاه: ۶ پیام آخر، خلاصهٔ کهنه‌ها ≤ ۶۰۰ نویسه، پاسخ دستیار ≤ ۱۵۰۰، بی منابع چسبیده، نقش‌ها یک‌درمیان', () => {
  const h = [];
  for (let i = 0; i < 12; i++){ h.push({ role: 'user', content: 'پرسش ' + i + ' ' + 'الف '.repeat(80) }); h.push({ role: 'assistant', content: 'پاسخ ' + i + ' ' + 'ب '.repeat(1200) + '【متن رسمی】 منبع کهنه' }); }
  h.push({ role: 'user', content: 'پرسش تازه' });
  const t = GF.tarikhcheKootah(h);
  assert.ok(t.messages.length <= 6); assert.strictEqual(t.messages[t.messages.length - 1].content, 'پرسش تازه');
  assert.strictEqual(t.messages[0].role, 'user');
  for (let i = 1; i < t.messages.length; i++) assert.notStrictEqual(t.messages[i].role, t.messages[i - 1].role);
  assert.ok(t.messages.filter(m => m.role === 'assistant').every(m => m.content.length <= 1500 && !m.content.includes('【')));
  assert.ok(t.kholase.length > 0 && t.kholase.length <= 600, String(t.kholase.length));
});
test('دستورالعمل: کوتاه، بی فهرست ابزار، ویژهٔ هر قصد؛ پیشوند ثابت برای حافظهٔ مدل', () => {
  const g = GF.dastoor('goftogoo'), h = GF.dastoor('porsesh_hoghooghi', { kholase: 'کاربر پیش‌تر پرسید …' });
  assert.ok(g.length < 1600 && h.length < 1900, g.length + ' / ' + h.length);
  assert.ok(!/⟪/.test(g + h));
  assert.ok(/هرگز نگو «در منابع نیست»/.test(g)); assert.ok(/نزدیک‌ترین مواد/.test(h) && /پرسش روشن‌کننده/.test(h));
  assert.ok(h.startsWith(GF.dastoorPaye({})), 'بخش ثابت اول می‌آید');
});
test('نمونه‌گیری بر پایهٔ قصد (جدول بخش ۲-۵)', () => {
  const g = GF.nemoone('goftogoo'), h = GF.nemoone('porsesh_hoghooghi'), d = GF.nemoone('goftogoo', true);
  assert.deepStrictEqual([g.temperature, g.top_p, h.temperature], [0.7, 0.9, 0.3]);
  for (const o of [g, h]) assert.deepStrictEqual([o.repeat_penalty, o.presence_penalty, o.dry_multiplier, o.dry_base, o.dry_allowed_length], [1.1, 0.3, 0.8, 1.75, 2]);
  assert.ok(d.temperature > g.temperature, 'ساخت دوباره با temperature بالاتر');
});
test('مسیریاب مدلی: JSON schema، خواندن امن، و بازگشت به قاعده اگر مدل پاسخ ندهد', async () => {
  const b = GF.badaneMasirModel('یه چیزی', []);
  assert.strictEqual(b.temperature, 0); assert.deepStrictEqual(b.response_format.json_schema.schema.properties.qasd.enum, GF.QASDHA);
  assert.ok(GF.NEMOONE_MASIR.length >= 20);
  assert.strictEqual(GF.khandanMasirModel('نه JSON'), null);
  assert.strictEqual(GF.khandanMasirModel('{"qasd":"ghalat"}'), null);
  const q = 'یک موضوع مبهم و بلند که هیچ قاعده‌ای آن را نمی‌شناسد و باید مدل بسنجد';
  const m0 = GF.masiryab(q, [], vn); assert.strictEqual(m0.etminan, 'payin');
  const m1 = await GF.masiryabKamel(q, [], { vn, llm: async () => '{"qasd":"porsesh_hoghooghi","porsesh_mostaghel":"مطالبهٔ خسارت","kelidvazheha":["خسارت"],"qanunha":["قانون مسئولیت مدنی"]}' });
  assert.deepStrictEqual([m1.qasd, m1.etminan], ['porsesh_hoghooghi', 'model']);
  const bz = GF.afzoodanModelBeBaznevisi(GF.baznevisi(q, m1, []), m1); assert.ok(bz.qanunha.includes('قانون مسئولیت مدنی') && bz.ebarat.includes('خسارت'));
  const m2 = await GF.masiryabKamel(q, [], { vn, llm: async () => { throw new Error('مدل خاموش'); } }); assert.strictEqual(m2.qasd, m0.qasd);
});

test('کیس دو: قانون مادر، اصلاحیه، و مصوبهٔ موردی', () => {
  assert.strictEqual(RT.madarAst('قانون صدور چک'), 2); assert.strictEqual(RT.madarAst('قانون اصلاح قانون صدور چک'), 1);
  assert.strictEqual(RT.madarAst('قانون آئین دادرسی کیفری'), 2); assert.strictEqual(RT.madarAst('قانون نحوه اجرای محکومیتهای مالی مصوب 1394'), 2);
  assert.strictEqual(RT.madarAst('قانون روابط موجر و مستأجر مصوب 1376'), 2); assert.strictEqual(RT.madarAst('قانون کارشناسان رسمی دادگستری'), 0);
  assert.ok(RT.QANUN_MADAR.length >= 55);
  const posti = { onvan: 'موافقت‌نامه مبادله بسته پستی بین دولت جمهوری اسلامی ایران و دولت فلان', lar: 'lar8', qid: 9 };
  assert.ok(RT.zarib(posti, 'چک برگشتی', new Set()) < 0, 'نویز پستی ضریب منفی');
  assert.strictEqual(RT.zarib(posti, 'موافقت‌نامه پستی با فلان', new Set()), 0, 'پرسش صریح دربارهٔ آن، بی ضریب منفی');
  assert.ok(RT.zarib({ onvan: 'قانون صدور چک', lar: 'lar2', qid: 1 }, 'چک', new Set([1])) > RT.zarib({ onvan: 'قانون صدور چک', lar: 'lar2', qid: 1 }, 'چک', new Set()));
});
test('کیس دو: سازندهٔ پرسش FTS امن است و واژه‌های بی‌ارزش را بیرون می‌گذارد', () => {
  const f = RT.sazandeFts({ ebarat: ['چک "برگشتی"', 'اگه'], vazheha: ['چیکار', 'باید', 'صادرکننده', 'x'] });
  assert.strictEqual(f, '"چک برگشتی" OR "صادرکننده"');
  assert.strictEqual(RT.sazandeFts({}), '');
});
test('کیس دو: حافظهٔ نهان با مهلت و وعدهٔ بامهلت', async () => {
  const k = new RT.Kesh(30, 2); k.set('a', 1); assert.strictEqual(k.get('a'), 1);
  k.set('b', 2); k.set('c', 3); assert.strictEqual(k.get('a'), undefined, 'بیشینهٔ اندازه');
  await new Promise(r => setTimeout(r, 40)); assert.strictEqual(k.get('c'), undefined, 'مهلت ۱۰ دقیقه‌ای (اینجا ۳۰ میلی‌ثانیه)');
  assert.strictEqual(await RT.baMohlat(new Promise(r => setTimeout(() => r(1), 200)), 20), null);
  assert.strictEqual(await RT.baMohlat(Promise.resolve(7), 50), 7);
});
