/* تنظیمات: پوشهٔ مقصد، حالت خروجی، تم‌ها (همهٔ تم‌های میزبان)، اندازهٔ نوشته، زمان‌بند خودکار، آستانه‌ها، نقشهٔ بخش‌ها، گزارش کار. */
(function (S) {
  'use strict';
  const U = S.util;
  const UI = S.ui;
  const { esc, n, icon, el, toast } = UI;
  const st = () => S.store;

  function render(box) {
    const s = st().state.settings;
    const sh = S.bridge.last || {};
    const svc = sh.service || {};
    const themes = UI.themes();
    const cur = s.theme || 'fluent';
    let rem = false; try { rem = localStorage.getItem('sm_remember') === '1'; } catch (e) { /* ادامه */ }
    const page = el(`<div class="page">
      <div class="set-grid">
        <div class="card"><h2>${icon('folder')}پوشهٔ مقصد خروجی</h2>
          <div class="muted" style="font-size:.84em;margin-bottom:8px">هر بخش یک پوشه؛ هر پرونده یک پوشه با زیرپوشه‌های «۱ اسناد، ۲ پیوست‌ها، ۳ روند و رخدادها، ۴ گزارش‌ها» و فهرست.xlsx.</div>
          <code class="path">${esc(sh.dest || '—')}</code>
          <div class="toolbar" style="margin-top:10px"><button class="btn pri" data-act="browse">${icon('folder')}انتخاب پوشهٔ مقصد…</button><button class="btn" data-act="open">باز کردن پوشه</button></div>
          <div class="set-row" style="margin-top:8px"><div>سرویس فایل<div class="d">${svc.running ? 'در حال اجرا' + (svc.browser ? ' · چاپ پی‌دی‌اف با ' + esc(svc.browser.split(/[\\\\/]/).pop()) : '') : 'اجرا نشده'}</div></div><span class="badge ${svc.running ? 'ok' : 'err'}">${svc.running ? 'فعال' : 'غیرفعال'}</span></div>
        </div>
        <div class="card"><h2>${icon('download')}خروجی</h2>
          <div class="set-row"><div>حالت پیش‌فرض دانلود<div class="d">برای «دانلود همه» و کلیدهای هر رکورد</div></div><select class="input sm" data-k="mode"><option value="pdf+text" ${s.mode === 'pdf+text' ? 'selected' : ''}>پی‌دی‌اف + متن</option><option value="pdf" ${s.mode === 'pdf' ? 'selected' : ''}>فقط پی‌دی‌اف</option><option value="text" ${s.mode === 'text' ? 'selected' : ''}>فقط متن</option></select></div>
          <div class="set-row"><div>آستانهٔ «معطل» (روز)<div class="d">رکوردی که بیش از این مدت بی‌تغییر مانده</div></div><input type="number" class="input sm" data-k="pendingDays" min="1" value="${s.pendingDays || 7}" style="width:90px"></div>
          <div class="set-row"><div>آستانهٔ «تازه» (روز)<div class="d">برای «فقط تازه‌ها» و بخش تازه‌های گزارش</div></div><input type="number" class="input sm" data-k="recentDays" min="1" value="${s.recentDays || 7}" style="width:90px"></div>
          <div class="set-row"><div>زمان‌بند خودکار<div class="d">تا وقتی وارد هستید، هر چند دقیقه یک بار داده‌ها دوباره گردآوری شود (۰ = خاموش)</div></div><input type="number" class="input sm" data-k="autoRefreshMin" min="0" value="${s.autoRefreshMin || 0}" style="width:90px"></div>
          <div class="set-row"><div>سرعت گردآوری<div class="d">خودکار و تطبیقی: بیشترین سرعتِ ایمن؛ با نشانهٔ فشار سایت عقب می‌کشد (بند ۱۰ دستور کار)</div></div><span class="badge ok">خودکار</span></div>
        </div>
        <div class="card"><h2>${icon('user')}ورود و حریم</h2>
          <div class="set-row"><div>به‌خاطر سپردن کد ملی<div class="d">فقط کد ملی روی همین رایانه؛ رمز پویا هرگز ذخیره نمی‌شود</div></div><span class="switch ${rem ? 'on' : ''}" data-sw="remember"></span></div>
          <div class="set-row"><div>داده‌ها<div class="d">هیچ داده‌ای به بیرون فرستاده نمی‌شود؛ فقط روی دیسک خود شما</div></div><span class="badge ok">محلی</span></div>
          <div class="set-row"><div>نقشهٔ بخش‌ها<div class="d">فهرست درخواست‌ها و نام فیلدها بی مقدار (برای دقیق‌تر شدن نگاشت)</div></div><button class="btn sm" data-act="map">${icon('map')}ذخیرهٔ نقشه</button></div>
        </div>
        <div class="card"><h2>${icon('map')}اتصال به سامانه (تغییر آی‌پی / DNS)</h2>
          <div class="muted" style="font-size:.84em;margin-bottom:8px">اگر سامانه اتصال شما را بست («بلاک»)، با عوض‌کردن DNS، نام <code class="path">my.ssaa.ir</code> به آی‌پی دیگری حل می‌شود و اغلب دوباره باز می‌شود. برای اعمال، برنامه یک بار بسته و باز می‌شود.</div>
          <div class="set-row"><div>وضعیت اتصال<div class="d" data-role="connstate">${sh.hostIp ? 'آی‌پی سامانه: ' + esc(sh.hostIp) : 'با DNS سیستم'}</div></div><span class="badge ${(S.app.state.siteState && S.app.state.siteState.page && S.app.state.siteState.page !== 'closed') ? 'ok' : 'warn'}">${(S.app.state.siteState && S.app.state.siteState.page && S.app.state.siteState.page !== 'closed') ? 'برقرار' : 'برقرار نیست'}</span></div>
          <label class="lbl" style="margin-top:6px">انتخاب DNS<select class="input" data-role="dnssel">${UI.DNS_PRESETS.map((d) => `<option value="${esc(d.ips)}" ${(sh.dnsIps || '') === d.ips ? 'selected' : ''}>${esc(d.name)}${d.ips ? ' — ' + esc(d.ips) : ''}</option>`).join('')}<option value="__custom" ${sh.dnsIps && !UI.DNS_PRESETS.some((d) => d.ips === sh.dnsIps) ? 'selected' : ''}>دلخواه…</option></select></label>
          <label class="lbl" style="margin-top:6px" data-role="customwrap" ${sh.dnsIps && !UI.DNS_PRESETS.some((d) => d.ips === sh.dnsIps) ? '' : 'hidden'}>آی‌پی‌های DNS (با کاما)<input class="input sm ltr" data-role="dnsips" placeholder="8.8.8.8, 8.8.4.4" value="${esc(sh.dnsIps && !UI.DNS_PRESETS.some((d) => d.ips === sh.dnsIps) ? sh.dnsIps : '')}"></label>
          <div class="toolbar" style="margin-top:10px"><button class="btn pri" data-act="applydns">${icon('refresh')}اعمال DNS و راه‌اندازی دوباره</button><button class="btn" data-act="retryconn">${icon('refresh')}تلاش دوباره برای اتصال</button></div>
        </div>
        <div class="card"><h2>${icon('sun')}نوشتار و حرکت</h2>
          <div class="set-row"><div>اندازهٔ نوشته<div class="d">${n(s.fontSize || 17)} پیکسل</div></div><input type="range" data-k="fontSize" min="13" max="22" value="${s.fontSize || 17}" style="width:160px"></div>
          <div class="set-row"><div>حرکت پس‌زمینه<div class="d">جریان آرام رنگ‌ها</div></div><span class="switch ${s.motion === false ? '' : 'on'}" data-sw="motion"></span></div>
          <div class="set-row"><div>حالت خودکار روشن/تیره<div class="d">پیرو تنظیم ویندوز</div></div><span class="switch ${cur === 'auto' ? 'on' : ''}" data-sw="auto"></span></div>
        </div>
      </div>
      <div class="card"><h2>${icon('star')}تم<span class="tail">${n(themes.length)} تم میزبان</span></h2><div class="themes">${themes.map((t) => `<div class="theme-sw ${cur === t.id ? 'on' : ''}" data-theme="${esc(t.id)}"><div class="sw" style="background:${esc(t.base)}"><i style="background:${esc(t.ac)}"></i><i style="background:${esc(t.ac2)}"></i><i style="background:${esc((t.b || [])[0] || t.base)}"></i><i style="background:${esc((t.b || [])[1] || t.base)}"></i></div><span>${esc(t.name)}</span></div>`).join('')}</div></div>
      <div class="card"><h2>${icon('info')}گزارش کار<span class="tail">${n(st().state.log.length)} رویداد</span></h2><div class="log">${st().state.log.slice(0, 80).map((l) => `<div><span class="t num">${U.formatSystemDate(l.ts)}</span><span class="${l.level}">${esc(l.text)}</span></div>`).join('') || '<div class="muted">رویدادی ثبت نشده است.</div>'}</div></div>
    </div>`);
    box.appendChild(page);
    page.addEventListener('change', (e) => {
      const k = e.target.dataset.k; if (!k) return;
      const v = e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value;
      st().setSetting(k, v);
      if (k === 'mode') S.bridge.setConfig({ mode: v });
      if (k === 'fontSize') { S.app.applyAppearance(); e.target.closest('.set-row').querySelector('.d').textContent = n(v) + ' پیکسل'; }
      if (k === 'autoRefreshMin') S.app.setupScheduler();
      toast('ذخیره شد.');
    });
    page.addEventListener('input', (e) => { if (e.target.dataset.k === 'fontSize') { document.documentElement.style.setProperty('--fs', e.target.value + 'px'); } });
    page.addEventListener('change', (e) => { if (e.target.dataset.role === 'dnssel') { const cw = page.querySelector('[data-role=customwrap]'); if (cw) cw.hidden = e.target.value !== '__custom'; } });
    page.addEventListener('click', async (e) => {
      const th = e.target.closest('[data-theme]'); if (th) { st().setSetting('theme', th.dataset.theme); S.app.applyAppearance(); page.querySelectorAll('.theme-sw').forEach((x) => x.classList.toggle('on', x === th)); return; }
      const sw = e.target.closest('[data-sw]');
      if (sw) {
        const on = !sw.classList.contains('on'); sw.classList.toggle('on', on);
        if (sw.dataset.sw === 'remember') { try { if (on) { localStorage.setItem('sm_remember', '1'); if (S.app.state.login.nationalCode) localStorage.setItem('sm_nat', S.app.state.login.nationalCode); } else { localStorage.removeItem('sm_remember'); localStorage.removeItem('sm_nat'); } } catch (x) { /* ادامه */ } }
        if (sw.dataset.sw === 'motion') { st().setSetting('motion', on); S.app.applyAppearance(); }
        if (sw.dataset.sw === 'auto') { st().setSetting('theme', on ? 'auto' : 'fluent'); S.app.applyAppearance(); page.querySelectorAll('.theme-sw').forEach((x) => x.classList.toggle('on', !on && x.dataset.theme === 'fluent')); }
        return;
      }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'applydns') {
        const sel = page.querySelector('[data-role=dnssel]'); let ips = sel.value; let name = sel.options[sel.selectedIndex].textContent;
        if (ips === '__custom') { ips = U.enDigits((page.querySelector('[data-role=dnsips]').value || '').trim()); name = 'دلخواه'; }
        else name = (UI.DNS_PRESETS.find((d) => d.ips === ips) || { name: 'DNS سیستم' }).name;
        if (ips && !/^[0-9.,;\s]+$/.test(ips)) return toast('آی‌پی DNS نامعتبر است.', 'err');
        toast('DNS «' + name + '» اعمال می‌شود؛ برنامه یک لحظه بسته و باز می‌شود…');
        S.bridge.setDns(name, ips);
        return;
      }
      if (a.dataset.act === 'retryconn') { S.bridge.reloadSite(); toast('در حال تلاش دوباره برای اتصال به سامانه…'); return; }
      if (a.dataset.act === 'browse') S.bridge.browseDest();
      else if (a.dataset.act === 'open') S.bridge.openDest();
      else if (a.dataset.act === 'map') { await S.hook.refreshDiscovery(); S.exporter.downloadText(U.safeFileName(`نقشهٔ بخش‌ها ${U.formatSystemDate().replace(/[:\/]/g, '-')}.json`), JSON.stringify(S.hook.exportDiscovery(), null, 2), 'application/json'); toast('نقشهٔ بخش‌ها (بدون داده) در «خروجی‌های دیگر» ذخیره شد.'); }
    });
  }

  S.ui.pages = Object.assign(S.ui.pages || {}, { settings: render });
})(window.SabtMan = window.SabtMan || {});
