/* نقشهٔ شناخته‌شدهٔ سامانهٔ my.ssaa.ir («ثبت من» سازمان ثبت اسناد و املاک کشور).
   این فایل «دانش» برنامه از سایت است: بخش‌های دادهٔ کاربر، مسیر صفحهٔ هر بخش در سایت، درخواستِ فهرست هر بخش،
   شکل پاسخ، کلید یکتای رکورد، برچسب فارسی همهٔ فیلدها، و پیوندهای فرزند (مدارک، رخدادها، گزارش‌ها، پیوست‌ها).
   هر چه اینجا نیست، با کشف خودکار (store/hook) گرفته می‌شود؛ پس این نقشه فقط دقت و زیبایی را بالا می‌برد. */
(function (S) {
  'use strict';

  /* ---------- برچسب فارسی فیلدها ---------- */

  const COMMON = {
    id: 'شناسه', title: 'عنوان', name: 'نام', family: 'نام خانوادگی', fathername: 'نام پدر', birthdate: 'تاریخ تولد', birthDate: 'تاریخ تولد',
    nationalno: 'کد ملی', nationalitycode: 'کد ملی', nationalCode: 'شناسهٔ ملی', personnationalno: 'کد ملی شخص', mobileno: 'تلفن همراه', mobileNo: 'تلفن همراه',
    tel: 'تلفن', postalCode: 'کد پستی', postCode: 'کد پستی', province: 'استان', ostan: 'استان', shahr: 'شهر', description: 'شرح', unitName: 'واحد',
    registerDate: 'تاریخ ثبت', registerNumber: 'شمارهٔ ثبت', registernumber: 'شمارهٔ ثبت', role: 'نقش', auth: 'سطح احراز', loginType: 'نوع ورود',
    email: 'رایانامه', address: 'نشانی', gender: 'جنسیت', isActive: 'فعال', createDate: 'تاریخ ایجاد', trackingCode: 'کد رهگیری', state: 'وضعیت', status: 'وضعیت',
  };

  const EXECUTIVE_CASE = {
    no: 'شمارهٔ پرونده', subNo: 'شمارهٔ فرعی', archiveNo: 'شمارهٔ بایگانی', caseState: 'وضعیت پرونده', unitName: 'واحد اجرا',
    docCount: 'شمار مدارک', eventCount: 'شمار رخدادها', lastChange: 'آخرین تغییر', docTypes: 'انواع مدرک',
  };
  const EXECUTIVE_DOC = {
    caseNo: 'شمارهٔ پرونده', caseSubNo: 'شمارهٔ فرعی', unitName: 'واحد اجرا', caseState: 'وضعیت پرونده',
    documentTypeName: 'نوع مدرک', documentNo: 'شمارهٔ مدرک', documentId: 'شناسهٔ مدرک', documentTypeId: 'شناسهٔ نوع مدرک',
    previousState: 'وضعیت پیشین', currentState: 'وضعیت جاری', lastChange: 'تاریخ و ساعت آخرین تغییر', firstChange: 'نخستین رخداد', eventCount: 'شمار رخدادها',
    changeDateTime: 'تاریخ و ساعت تغییر', nextState: 'وضعیت جاری', reportTypeName: 'نام گزارش', reportTypeCode: 'کد گزارش', objectId: 'شناسهٔ شیء', reportCommand: 'فرمان گزارش',
    fileType: 'نوع فایل', base64FileResult: 'فایل', attachmentName: 'نام پیوست', fileName: 'نام فایل',
  };
  const ESTATE = {
    area: 'مساحت', arrest: 'بازداشت', 'arrestList[]': 'فهرست بازداشت‌ها', arrestText: 'شرح بازداشت', basic: 'اصلی', caseTypeTitle: 'نوع پرونده',
    documentnumber: 'شمارهٔ سند', descriptionAddress: 'نشانی', eestateid: 'شناسهٔ ملک الکترونیک', eostatus: 'وضعیت سند الکترونیک', estatestatus: 'وضعیت ملک',
    estateType: 'نوع ملک', hasEstateElectronicNoteNo: 'دارای سند الکترونیک', iscurrent: 'جاری', jamCode: 'کد جام', numbernote: 'شمارهٔ دفتر', numberpage: 'شمارهٔ صفحه',
    ownerid: 'شناسهٔ مالک', plaqueoriginal: 'پلاک اصلی', propertyTypeTitle: 'نوع مال', sectioncode: 'کد بخش', sectionid: 'شناسهٔ بخش', sector: 'ناحیه', section: 'بخش',
    separate: 'مفروز', seridaftar: 'سری دفتر', shomaremostand: 'شمارهٔ مستند', shomareshenasnamesabt: 'شمارهٔ شناسنامهٔ ثبت', sidewayplaque: 'پلاک جانبی',
    subsectioncode: 'کد زیربخش', subsectionid: 'شناسهٔ زیربخش', secondary: 'پلاک فرعی', sharePart: 'سهم', shareText: 'شرح سهم', shareTotal: 'کل سهم',
    shomarDaftarAmlak: 'شمارهٔ دفتر املاک', subSection: 'زیربخش', tarikhmostanad: 'تاریخ مستند', tarikhsabtmelk: 'تاریخ ثبت ملک', theshareof: 'سهم از',
    thetext: 'متن', totalshare: 'کل سهام', tarikhSabteAmlak: 'تاریخ ثبت املاک', unitId: 'شناسهٔ واحد ثبتی', unitName: 'واحد ثبتی', plaqueText: 'پلاک ثبتی',
    price: 'مبلغ', sentencecode: 'شمارهٔ دستور', sentencedate: 'تاریخ دستور', sentencerefrence: 'مرجع دستور', name: 'نام مالک', family: 'نام خانوادگی مالک', birthdate: 'تاریخ تولد مالک',
  };
  const SSAR = {
    scriptoriumno: 'شمارهٔ دفترخانه', tel: 'تلفن دفترخانه', title: 'نوع سند', reqno: 'شمارهٔ پرونده', reqdate: 'تاریخ درخواست', docdate: 'تاریخ سند',
    doC_STATE: 'وضعیت سند', doC_STATE_CODE: 'کد وضعیت', sardaftarconfirmdate: 'تاریخ تأیید سردفتر', isoriginal: 'ثبت نهایی', singulartitle: 'عنوان',
    aganttypetitle: 'سمت در سند', legaltext: 'متن حقوقی', docImage: 'تصویر سند', vehiclE_TYPE: 'نوع خودرو', name: 'نام', family: 'نام خانوادگی',
  };
  const COMPANY = {
    name: 'نام شرکت', nationalCode: 'شناسهٔ ملی', postCode: 'کد پستی', registerDate: 'تاریخ ثبت', registerNumber: 'شمارهٔ ثبت',
    'theCICompanyType.title': 'نوع شرکت', 'theCICompanyType.code': 'کد نوع شرکت', 'theCICompanyType.state': 'وضعیت نوع', 'theCICompanyType.id': 'شناسهٔ نوع', 'theCICompanyType.allowedForcompany': 'مجاز برای شرکت', theObjectState: 'وضعیت',
  };

  /* ---------- بخش‌ها ----------
     path: کلید بخش در انبار (مسیر API فهرست، ماسک‌شده)؛ page: مسیر صفحه در سایت؛ list: نام آرایهٔ رکوردها در data
     keyFields: کلید یکتای رکورد؛ nameOf: نام پرونده/پوشه؛ status/type/date: فیلدهای اصلی؛ labels: برچسب فیلدها
     order: ترتیب گردآوری (سنگین‌ترها اول — بند ۱۰-۳ دستور کار) */
  const SECTIONS = [
    { id: 'executive-cases', path: '/executive/getallcases', module: 'executive', label: 'پرونده‌های اجرایی', short: 'پرونده‌ها', icon: 'gavel', group: 'اجرای اسناد رسمی',
      page: '/portal/executive/snap-execution', list: 'xCaseInformationList', keyFields: ['no', 'subNo'], nameOf: (f) => `پروندهٔ اجرایی ${f.no}${f.subNo && f.subNo !== '1.0' ? ' (' + f.subNo + ')' : ''}`,
      status: 'caseState', type: 'unitName', date: 'lastChange', labels: EXECUTIVE_CASE, order: 1, paged: { pageSize: 100 },
      counters: ['caseState', 'unitName'], hideFields: [], primary: ['no', 'unitName', 'caseState', 'docCount', 'eventCount', 'lastChange'] },
    { id: 'executive-docs', path: '/executive/documents', module: 'executive', label: 'مدارک پرونده‌های اجرایی', short: 'مدارک اجرا', icon: 'stack', group: 'اجرای اسناد رسمی',
      virtual: true, keyFields: ['caseNo', 'caseSubNo', 'documentId'], nameOf: (f) => `${f.documentTypeName || 'مدرک'}${f.documentNo ? ' ' + f.documentNo : ''} — پروندهٔ ${f.caseNo}`,
      status: 'currentState', type: 'documentTypeName', date: 'lastChange', prev: 'previousState', labels: EXECUTIVE_DOC, order: 2,
      counters: ['documentTypeName', 'currentState', 'caseState'], hideFields: ['documentId', 'documentTypeId'], primary: ['caseNo', 'documentTypeName', 'documentNo', 'previousState', 'currentState', 'lastChange', 'eventCount'],
      timeline: { date: 'changeDateTime', prev: 'previousState', status: 'nextState' },
      children: [
        { kind: 'گزارش‌ها', path: '/executive/getdocumentreports', method: 'POST', body: 'docTypeId={{documentTypeId}}&docId={{documentId}}&caseNo={{caseNo}}&caseSubNo={{caseSubNo}}', list: 'reportTypes' },
        { kind: 'پیوست‌ها', path: '/executive/getdocumentattachments', method: 'POST', body: 'docTypeId={{documentTypeId}}&docId={{documentId}}&caseNo={{caseNo}}&caseSubNo={{caseSubNo}}', list: 'documentAttachments', optional: true },
      ],
      fileOf: { path: '/executive/getreport', method: 'POST', body: 'caseNo={{caseNo}}&caseSubNo={{caseSubNo}}&documentTypeId={{documentTypeId}}&documentId={{documentId}}&reportCommand={{reportCommand}}&reportTypeCode={{reportTypeCode}}', base64: 'base64FileResult', fileType: 'fileType' } },
    { id: 'ssar', path: '/ssar/getalldocuments', module: 'ssar', label: 'اسناد رسمی من', short: 'اسناد رسمی', icon: 'doc', group: 'اسناد رسمی',
      page: '/portal/ssar/my-documents', keyFields: ['reqno', 'title', 'docdate', 'aganttypetitle', 'personnationalno'], nameOf: (f) => `${f.title || 'سند'} ${f.reqno || ''}`.trim(),
      status: 'doC_STATE', type: 'title', date: 'docdate', labels: SSAR, order: 3, counters: ['title', 'aganttypetitle', 'doC_STATE'], rowActions: ['بیشتر', 'جزئیات', 'سند'], hideFields: ['doC_STATE_CODE', 'docImage', 'legaltext'], primary: ['reqno', 'title', 'docdate', 'aganttypetitle', 'doC_STATE', 'scriptoriumno', 'shahr', 'name', 'family'] },
    { id: 'estate', path: '/estate/GetEstatePersonList', module: 'estate', label: 'املاک من', short: 'املاک', icon: 'home', group: 'املاک و کاداستر',
      page: '/portal/estate/list-estate', keyFields: ['eestateid', 'plaqueText', 'unitId'], nameOf: (f) => `ملک ${f.plaqueText || (f.secondary ? f.secondary + ' فرعی از ' + f.plaqueoriginal + ' اصلی' : f.eestateid || '')}`.trim(),
      status: 'estatestatus', type: 'estateType', date: 'tarikhsabtmelk', labels: ESTATE, order: 4, counters: ['estatestatus', 'propertyTypeTitle', 'unitName'], rowActions: ['جزئیات', 'بیشتر', 'دریافت سند'], hideFields: ['eestateid', 'ownerid', 'unitId', 'sectionid', 'subsectionid'], primary: ['plaqueText', 'unitName', 'propertyTypeTitle', 'estatestatus', 'area', 'shareText', 'documentnumber', 'tarikhsabtmelk', 'arrest'] },
    { id: 'companies', path: '/company/getsinglefootprint', module: 'company', label: 'شرکت‌های من', short: 'شرکت‌ها', icon: 'building', group: 'ثبت شرکت‌ها',
      page: '/portal/company/my-company', list: 'theCCompanyList', keyFields: ['nationalCode'], nameOf: (f) => `شرکت ${f.name || f.nationalCode || ''}`.trim(),
      status: 'theObjectState', type: 'theCICompanyType.title', date: 'registerDate', labels: COMPANY, order: 5, counters: ['theCICompanyType.title'], rowActions: ['بیشتر', 'توضیحات'], paged: { pageSize: 10, total: 'totalCount' }, hideFields: ['theCICompanyType.id', 'theCICompanyType.allowedForcompany', 'theCICompanyType.state', 'theCICompanyType.code'], primary: ['name', 'nationalCode', 'registerNumber', 'registerDate', 'theCICompanyType.title', 'postCode'] },
    { id: 'sset', path: '/sset/getallevents', module: 'sset', label: 'وقایع ازدواج و طلاق', short: 'ازدواج و طلاق', icon: 'rings', group: 'ازدواج و طلاق',
      page: '/portal/sset/list-events', list: 'lstEvents', keyFields: [], nameOf: (f) => `واقعهٔ ${f.eventType || f.type || ''} ${f.uniqueId || f.id || ''}`.trim(), order: 6, labels: {} },
    { id: 'vehicles', path: '//ssar/getallvehicles', module: 'ssar', label: 'خودروهای من', short: 'خودروها', icon: 'car', group: 'اسناد رسمی',
      page: '/portal/ssar/my-cars', keyFields: ['reqno'], nameOf: (f) => `خودرو ${f.vehiclE_TYPE || ''} ${f.reqno || ''}`.trim(), labels: SSAR, order: 7 },
    { id: 'ilenc', path: '/ilenc/getallissueslist', module: 'ilenc', label: 'شناسه‌های ثبت موقت', short: 'ثبت موقت', icon: 'badge', group: 'اشخاص حقوقی',
      page: '/portal/ilenc/temp-issues', list: 'theCLPLegalPersonReviewList', keyFields: ['trackingCode', 'id'], nameOf: (f) => `شناسهٔ موقت ${f.trackingCode || f.id || ''}`.trim(), order: 8, labels: {}, paged: { pageSize: 100, total: 'totalCount' } },
    { id: 'appointments', path: '/appointment/ceo/getRequestList', module: 'appointment', label: 'نوبت‌های من', short: 'نوبت‌ها', icon: 'calendar', group: 'نوبت‌دهی',
      page: '/portal/appointment/ceo-appointment', keyFields: ['id', 'requestId'], nameOf: (f) => `نوبت ${f.requestId || f.id || ''}`.trim(), order: 9, labels: {} },
    { id: 'profile', path: '/user/GetUserProfile', module: 'user', label: 'پروفایل', short: 'پروفایل', icon: 'user', group: 'حساب کاربری',
      page: '/portal/usr/profile', keyFields: [], single: true, nameOf: () => 'پروفایل', order: 10, labels: COMMON },
  ];
  const SECTIONS_BY_PATH = new Map(SECTIONS.map((s) => [s.path, s]));
  const SECTIONS_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

  /** پاسخ‌های سایت که دادهٔ کاربر نیستند (شمارنده، جدول کمکی، احراز) */
  const IGNORE = /(getissuestates|getfeedbackcount|getsignabledocumentscount|checktoken|generateotp|getuserinfo)$|^\/login$/i;
  /** پاسخ‌های فرزند که خودِ نقشه پردازش می‌کند (بخش مستقل نمی‌شوند) */
  const CHILD_PATHS = /^\/executive\/(getcasedocuments|getdocumentreports|getdocumentattachments|getreport)$/i;

  const STATUS_TONE = [
    [/مختومه|خاتمه|پایان|بایگانی|تایید نهایی|تأیید نهایی|انجام شده|ثبت نهایی/, 'ok'],
    [/توقف|معلق|بازداشت|ممنوع|ابطال|لغو|رد|منقضی|نادرست/, 'err'],
    [/جاري|جاری|در حال|منتظر|ارسال|پيش نويس|پیش‌نویس|ثبت شده جهت/, 'info'],
    [/رويت|رؤیت|ابلاغ شده|تاييد|تأیید/, 'good'],
  ];
  function tone(status) {
    const s = String(status || '');
    for (const [re, t] of STATUS_TONE) if (re.test(s)) return t;
    return 'muted';
  }

  function sectionFor(path) { return SECTIONS_BY_PATH.get(path) || null; }
  function byId(id) { return SECTIONS_BY_ID.get(id) || null; }

  /** برچسب فارسی یک فیلد (برای بخش شناخته‌شده، سپس عمومی، سپس انسانی‌سازی) */
  function fieldLabel(sectionPath, key) {
    const sec = typeof sectionPath === 'string' ? sectionFor(sectionPath) : sectionPath;
    if (sec && sec.labels && sec.labels[key]) return sec.labels[key];
    if (COMMON[key]) return COMMON[key];
    const last = key.split('.').pop().replace(/\[\]$/, '');
    if (sec && sec.labels && sec.labels[last]) return sec.labels[last];
    if (COMMON[last]) return COMMON[last];
    return humanize(key);
  }
  function humanize(key) {
    return String(key).replace(/\[\]$/, '').replace(/[_.]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function parseBody(body) {
    const out = {};
    if (!body) return out;
    const s = String(body).trim();
    if (s[0] === '{') { try { return JSON.parse(s); } catch (e) { return out; } }
    for (const part of s.split('&')) { const i = part.indexOf('='); if (i < 0) continue; try { out[decodeURIComponent(part.slice(0, i).replace(/\+/g, ' '))] = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { out[part.slice(0, i)] = part.slice(i + 1); } }
    return out;
  }

  function recordKey(sec, flat, index) {
    const vals = (sec.keyFields || []).map((k) => flat[k]).filter((v) => v !== null && v !== undefined && v !== '');
    return vals.length ? vals.join('|') : '#' + index;
  }

  /** پرکردن الگوی {{field}} از فیلدهای یک رکورد (و مقادیر اضافی) */
  function fill(template, flat, extra) {
    return String(template).replace(/\{\{(\w+)\}\}/g, (m, k) => {
      const v = extra && extra[k] !== undefined ? extra[k] : flat[k];
      return v === null || v === undefined ? '' : encodeURIComponent(String(v));
    });
  }

  /* ---------- تبدیل پاسخ‌های شناخته‌شده به رکوردهای برچسب‌دار ----------
     خروجی هر تبدیل: {section: <config>, records:[{key, raw, flat}], timelines?: Map(key → rows), meta?} یا null (= پردازش عمومی) */

  function transform(cap, ctx) {
    const U = S.util;
    const env = U.readEnvelope(cap.json);
    const data = env.isEnvelope ? env.data : cap.json;
    const path = cap.path;
    if (IGNORE.test(path)) return { ignore: true };
    if (path === '/executive/getcasedocuments') return transformCaseDocuments(cap, data, ctx);
    if (path === '/executive/getdocumentreports' || path === '/executive/getdocumentattachments') return transformDocChild(cap, data, ctx, path);
    if (path === '/executive/getreport') return transformReportFile(cap, data, ctx);
    const sec = sectionFor(path);
    if (!sec) return null;
    let rows = data;
    if (sec.list && U.isPlainObject(data)) rows = data[sec.list];
    if (sec.single) rows = U.isPlainObject(data) ? [data] : [];
    if (!Array.isArray(rows)) rows = U.isPlainObject(rows) ? [rows] : [];
    const records = rows.map((raw, i) => {
      if (!U.isPlainObject(raw)) raw = { مقدار: raw };
      const flat = U.flatten(raw);
      return { key: recordKey(sec, flat, i), raw, flat };
    });
    const meta = U.isPlainObject(data) && sec.list ? Object.fromEntries(Object.entries(data).filter(([k]) => k !== sec.list)) : null;
    return { section: sec, records, meta, replace: !sec.paged || (meta && Number(meta.pageIndex || 1) <= 1) };
  }

  function transformCaseDocuments(cap, data, ctx) {
    const U = S.util;
    const sec = byId('executive-docs');
    const body = parseBody(cap.requestBody);
    const caseNo = String(body.caseNo || ''), caseSubNo = String(body.caseSubNo || '');
    const parent = ctx && ctx.findRecord ? ctx.findRecord('/executive/getallcases', (f) => String(f.no) === caseNo && String(f.subNo) === caseSubNo) : null;
    const docs = data && Array.isArray(data.xCaseDocuments) ? data.xCaseDocuments : [];
    const records = [];
    const timelines = new Map();
    let caseLast = null, caseEvents = 0;
    const types = new Set();
    docs.forEach((doc, i) => {
      const events = Array.isArray(doc.xCaseDocumentWorkFloItems) ? doc.xCaseDocumentWorkFloItems : [];
      const sorted = events.map((e) => ({ changeDateTime: e.changeDateTime, previousState: e.previousState, nextState: e.nextState }))
        .sort((a, b) => (U.parseSystemDate(a.changeDateTime) || 0) - (U.parseSystemDate(b.changeDateTime) || 0));
      const last = sorted[sorted.length - 1] || null, first = sorted[0] || null;
      const flat = {
        caseNo, caseSubNo, unitName: parent ? parent.flat.unitName : (doc.unitName || ''), caseState: parent ? parent.flat.caseState : '',
        documentTypeName: doc.documentTypeName || '', documentNo: doc.documentNo || null,
        currentState: last ? last.nextState : '', previousState: last ? last.previousState : '', lastChange: last ? last.changeDateTime : null, firstChange: first ? first.changeDateTime : null,
        eventCount: sorted.length, documentId: doc.documentId, documentTypeId: doc.documentTypeId,
      };
      const key = recordKey(sec, flat, i);
      records.push({ key, raw: Object.assign({}, doc, { xCaseDocumentWorkFloItems: undefined }), flat });
      timelines.set(key, sorted);
      types.add(flat.documentTypeName);
      caseEvents += sorted.length;
      if (last && (!caseLast || (U.parseSystemDate(last.changeDateTime) || 0) > (U.parseSystemDate(caseLast) || 0))) caseLast = last.changeDateTime;
    });
    const parentPatch = parent ? { docCount: docs.length, eventCount: caseEvents, lastChange: caseLast, docTypes: [...types].join('، ') } : null;
    return { section: sec, records, timelines, replace: false, scope: (f) => f.caseNo === caseNo && f.caseSubNo === caseSubNo, parentPatch: parentPatch ? { path: '/executive/getallcases', record: parent, patch: parentPatch } : null };
  }

  function transformDocChild(cap, data, ctx, path) {
    const body = parseBody(cap.requestBody);
    const docId = String(body.docId || body.documentId || '');
    const kind = /reports$/.test(path) ? 'گزارش‌ها' : 'پیوست‌ها';
    const listKey = kind === 'گزارش‌ها' ? 'reportTypes' : 'documentAttachments';
    const rows = data && Array.isArray(data[listKey]) ? data[listKey] : (Array.isArray(data) ? data : []);
    return { child: { parentPath: '/executive/documents', kind, match: (f) => String(f.documentId) === docId, rows, childPath: path } };
  }

  function transformReportFile(cap, data, ctx) {
    const body = parseBody(cap.requestBody);
    const b64 = data && typeof data.base64FileResult === 'string' ? data.base64FileResult : '';
    if (!b64) return { ignore: true };
    const type = String(data.fileType || '');
    const ext = /tiff?/i.test(type) ? 'tif' : /png/i.test(type) ? 'png' : /jpe?g/i.test(type) ? 'jpg' : /pdf/i.test(type) ? 'pdf' : 'bin';
    return { file: { parentPath: '/executive/documents', match: (f) => String(f.documentId) === String(body.documentId || ''), base64: b64, ext, mime: ext === 'tif' ? 'image/tiff' : ext === 'pdf' ? 'application/pdf' : 'image/' + ext, reportTypeCode: body.reportTypeCode || body.reportType || '', request: { method: cap.method, url: cap.url, headers: cap.requestHeaders, body: cap.requestBody } } };
  }

  /* ---------- برای خودکارسازی سمت سایت ---------- */
  function collectPlan() {
    return SECTIONS.filter((s) => !s.virtual).sort((a, b) => a.order - b.order).map((s) => ({ key: s.id, label: s.label, page: s.page, api: s.path, list: s.list || null, paged: s.paged || null, rowActions: s.rowActions || [], deep: s.id === 'executive-cases' ? 'executive' : null, single: !!s.single }));
  }

  S.siteMap = { SECTIONS, sectionFor, byId, fieldLabel, humanize, transform, parseBody, fill, recordKey, tone, collectPlan, IGNORE, CHILD_PATHS, COMMON };
})(typeof window !== 'undefined' ? (window.SabtMan = window.SabtMan || {}) : (module.exports = {}));
