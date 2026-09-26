// پنجرهٔ اصلی «ثبت من»: دو WebView2 — یکی دیدنی (صفحه‌های خود برنامه: ورود، پیشخوان، بخش‌ها) و یکی پنهان (سایت my.ssaa.ir).
// کاربر هرگز سایت را نمی‌بیند. پوسته فقط پیام‌ها را بین دو WebView رله می‌کند، فایل می‌نویسد و سرویس Node را پنهان اجرا می‌کند.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace SabtMan
{
    public class MainWindow : Window
    {
        const string AppHost = "app.sabtman";           // میزبان مجازی رابط برنامه
        readonly Settings settings;
        readonly WebView2 ui = new WebView2();          // دیدنی
        readonly WebView2 site = new WebView2();        // پنهان
        readonly DispatcherTimer poll = new DispatcherTimer();
        readonly JavaScriptSerializer json = new JavaScriptSerializer();
        ServiceHost service;
        string bundleDir;
        string siteScript;
        bool uiReady = false, siteReady = false;
        readonly Queue<string> uiBacklog = new Queue<string>();

        public MainWindow()
        {
            json.MaxJsonLength = int.MaxValue;
            settings = Settings.Load();
            Title = "طلوع فردای ایرانیان — ثبت من";
            FlowDirection = FlowDirection.RightToLeft;
            Width = settings.winWidth; Height = settings.winHeight;
            if (settings.winLeft >= 0 && settings.winTop >= 0) { Left = settings.winLeft; Top = settings.winTop; WindowStartupLocation = WindowStartupLocation.Manual; }
            else WindowStartupLocation = WindowStartupLocation.CenterScreen;
            MinWidth = 960; MinHeight = 640;
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EEF1FB"));
            Content = BuildLayout();
            Loaded += OnLoaded;
            Activated += delegate { if (uiReady) ui.Focus(); };
            Closing += OnClosing;
            Log.Written += OnLog;
            Backdrop.TryApply(this);
        }

        UIElement BuildLayout()
        {
            Grid root = new Grid();
            // WebView پنهان: زنده ولی ناپیدا (اندازهٔ ۱ پیکسل و شفاف؛ Collapsed رندر را متوقف می‌کند)
            // WebView2 (WPF) شفافیتش فقط‌خواندنی است؛ برای پنهان‌ماندنِ زنده: ۱ پیکسل، گوشهٔ بالا-چپ، پشت رابط، بی برخورد موس
            site.Width = 1; site.Height = 1; site.IsHitTestVisible = false; site.Focusable = false;
            // سایت پنهان هرگز فوکوس صفحه‌کلید را نگیرد؛ اگر گرفت، به رابط برگردد
            site.GotFocus += delegate { if (uiReady) ui.Focus(); };
            System.Windows.Controls.Panel.SetZIndex(site, 0);
            site.HorizontalAlignment = HorizontalAlignment.Left; site.VerticalAlignment = VerticalAlignment.Top;
            site.FlowDirection = FlowDirection.LeftToRight;
            root.Children.Add(site);
            ui.FlowDirection = FlowDirection.LeftToRight;
            ui.DefaultBackgroundColor = System.Drawing.Color.Transparent;
            System.Windows.Controls.Panel.SetZIndex(ui, 1);
            root.Children.Add(ui);
            return root;
        }

        /* ---------- راه‌اندازی ---------- */

        async void OnLoaded(object sender, RoutedEventArgs e)
        {
            bundleDir = Paths.FindBundleDir();
            if (bundleDir == null)
            {
                MessageBox.Show("فایل‌های رابط (قلاب.js و پوشهٔ برنامه) کنار exe پیدا نشد. ساخت.cmd را اجرا کنید.", "ثبت من", MessageBoxButton.OK, MessageBoxImage.Error, MessageBoxResult.OK, MessageBoxOptions.RtlReading);
                Log.Write("err", "قلاب.js پیدا نشد.");
                return;
            }
            siteScript = File.ReadAllText(Path.Combine(bundleDir, "قلاب.js"), Encoding.UTF8);
            StartService();
            await InitWebViews();
        }

        void StartService()
        {
            string node = Paths.FindNode(settings.nodePath);
            string serverJs = Path.Combine(bundleDir, "بک‌اند-فایل", "server.js");
            if (node == null) { Log.Write("err", "node.exe پیدا نشد؛ سرویس فایل اجرا نشد. node.exe قابل‌حمل را کنار برنامه یا در ..\\سرور بگذارید."); return; }
            if (!File.Exists(serverJs)) { Log.Write("err", "server.js پیدا نشد: " + serverJs); return; }
            service = new ServiceHost(node, serverJs, Paths.InboxDir, settings.port);
            if (service.Start(settings.dest, settings.browserPath))
            {
                poll.Interval = TimeSpan.FromSeconds(2.5);
                poll.Tick += delegate { PushState(); };
                poll.Start();
            }
        }

        async Task InitWebViews()
        {
            try
            {
                Directory.CreateDirectory(Paths.WebViewDir);
                CoreWebView2EnvironmentOptions opts = new CoreWebView2EnvironmentOptions();
                opts.Language = "fa";
                // فقط برای عیب‌یابی روی همین رایانه (127.0.0.1)؛ پیش‌فرض ۰ = خاموش
                if (settings.debugPort > 0) opts.AdditionalBrowserArguments = "--remote-debugging-port=" + settings.debugPort;
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, Paths.WebViewDir, opts);

                // ۱) سایت پنهان
                await site.EnsureCoreWebView2Async(env);
                CoreWebView2 sc = site.CoreWebView2;
                sc.Settings.AreDefaultContextMenusEnabled = false;
                sc.Settings.IsStatusBarEnabled = false;
                sc.Settings.AreDevToolsEnabled = true;
                sc.WebMessageReceived += OnSiteMessage;
                sc.NewWindowRequested += OnSiteNewWindow;
                // دانلودهای معمولی سایت (ناوبری) روی دیسک نروند؛ فایل‌ها از راه قلاب fetch/XHR گرفته می‌شوند
                sc.DownloadStarting += delegate(object s, CoreWebView2DownloadStartingEventArgs a) { a.Cancel = true; a.Handled = true; Log.Write("info", "دانلود ناوبری سایت نادیده گرفته شد: " + a.DownloadOperation.Uri); };
                sc.NavigationCompleted += delegate(object s, CoreWebView2NavigationCompletedEventArgs a) { if (!a.IsSuccess) Log.Write("warn", "بارگذاری سایت: " + a.WebErrorStatus); };
                string siteConfig = LoadSiteConfig();
                await sc.AddScriptToExecuteOnDocumentCreatedAsync("window.__sabtmanSiteConfig = " + siteConfig + ";");
                await sc.AddScriptToExecuteOnDocumentCreatedAsync(siteScript);
                siteReady = true;
                // نخستین صفحه همیشه صفحهٔ ورود خود برنامه است: نشست کهنهٔ سایت پاک می‌شود
                await ClearSiteSession();
                // WebView پنهان ۱ پیکسل است؛ بی این، سایت چیدمان موبایل می‌گیرد و منوها پنهان می‌شوند: نمای رومیزی ثابت
                try { await sc.CallDevToolsProtocolMethodAsync("Emulation.setDeviceMetricsOverride", "{\"width\":1366,\"height\":900,\"deviceScaleFactor\":1,\"mobile\":false}"); }
                catch (Exception ex) { Log.Write("warn", "نمای رومیزی سایت: " + ex.Message); }
                sc.Navigate(settings.siteUrl);

                // ۲) رابط برنامه (دیدنی)
                await ui.EnsureCoreWebView2Async(env);
                CoreWebView2 uc = ui.CoreWebView2;
                uc.Settings.AreDefaultContextMenusEnabled = false;
                uc.Settings.IsStatusBarEnabled = false;
                uc.Settings.AreDevToolsEnabled = true;
                uc.Settings.IsZoomControlEnabled = false;
                uc.SetVirtualHostNameToFolderMapping(AppHost, Path.Combine(bundleDir, "برنامه"), CoreWebView2HostResourceAccessKind.Allow);
                uc.WebMessageReceived += OnUiMessage;
                uc.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs a) { a.Handled = true; };
                uc.NavigationCompleted += delegate(object s, CoreWebView2NavigationCompletedEventArgs a)
                {
                    uiReady = a.IsSuccess;
                    if (uiReady) ui.Focus();
                    while (uiReady && uiBacklog.Count > 0) PostToUi(uiBacklog.Dequeue());
                    PushState();
                };
                uc.Navigate("https://" + AppHost + "/index.html");
            }
            catch (Exception ex)
            {
                Log.Write("err", "WebView2: " + ex.Message);
                MessageBox.Show("WebView2 راه‌اندازی نشد. WebView2 Runtime باید نصب باشد.\n" + ex.Message, "ثبت من", MessageBoxButton.OK, MessageBoxImage.Error, MessageBoxResult.OK, MessageBoxOptions.RtlReading);
            }
        }

        /// <summary>پیکربندی-سایت.json (انتخابگرهای فرم ورود و منوها) — بی کامپایل دوباره اصلاح می‌شود</summary>
        string LoadSiteConfig()
        {
            string[] candidates = new string[] { Path.Combine(Paths.AppDir, "پیکربندی-سایت.json"), Path.Combine(bundleDir, "پیکربندی-سایت.json") };
            foreach (string p in candidates)
            {
                try { if (File.Exists(p)) { string t = File.ReadAllText(p, Encoding.UTF8).Trim(); if (t.StartsWith("{")) return t; } } catch (Exception ex) { Log.Write("warn", "پیکربندی سایت: " + ex.Message); }
            }
            return "{}";
        }

        void OnSiteNewWindow(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            // تنها جایی که کاربر صفحهٔ بیرونی را می‌بیند (مثلاً «ورود از طریق دولت من»): پنجرهٔ جدا
            e.Handled = true;
            try
            {
                Window w = new Window();
                w.Title = "سامانه — پنجرهٔ ورود";
                w.Width = 900; w.Height = 700; w.Owner = this; w.WindowStartupLocation = WindowStartupLocation.CenterOwner;
                WebView2 wv = new WebView2();
                w.Content = wv;
                w.Show();
                wv.EnsureCoreWebView2Async(site.CoreWebView2.Environment).ContinueWith(delegate { Dispatcher.BeginInvoke(new Action(delegate { wv.CoreWebView2.Navigate(e.Uri); })); });
            }
            catch (Exception ex) { Log.Write("err", "پنجرهٔ بیرونی: " + ex.Message); }
        }

        /* ---------- رله ---------- */

        static string Raw(CoreWebView2WebMessageReceivedEventArgs e)
        {
            try { return e.TryGetWebMessageAsString(); } catch (Exception) { return e.WebMessageAsJson; }
        }

        /// <summary>سایت پنهان → رابط برنامه (رویدادهای قلاب، پاسخ فرمان‌ها)</summary>
        void OnSiteMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string raw = Raw(e);
            if (string.IsNullOrEmpty(raw)) return;
            PostToUi(raw);
        }

        /// <summary>رابط برنامه → پوسته (job/file/browse/…) یا → سایت پنهان (site-cmd)</summary>
        void OnUiMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string raw = Raw(e);
            if (string.IsNullOrEmpty(raw)) return;
            Dictionary<string, object> msg;
            try { msg = json.Deserialize<Dictionary<string, object>>(raw); } catch (Exception) { return; }
            if (msg == null || !msg.ContainsKey("type")) return;
            string type = Convert.ToString(msg["type"]);
            try
            {
                switch (type)
                {
                    case "site-cmd": PostToSite(raw); break;
                    case "ready": case "state": PushState(); break;
                    case "job": SaveJob(Str(msg, "name"), Str(msg, "base64")); break;
                    case "file": SaveFile(Str(msg, "name"), Str(msg, "base64")); break;
                    case "browse": BrowseDest(); break;
                    case "openDest": OpenDest(); break;
                    case "setConfig":
                        if (msg.ContainsKey("mode") && msg["mode"] != null) settings.mode = Convert.ToString(msg["mode"]);
                        if (msg.ContainsKey("dest") && msg["dest"] != null) SetDest(Convert.ToString(msg["dest"]));
                        settings.Save();
                        break;
                    case "logout": Logout(); break;
                    case "log": Log.Write(Str(msg, "level") == "" ? "info" : Str(msg, "level"), Str(msg, "text")); break;
                }
            }
            catch (Exception ex) { Log.Write("err", "پیام " + type + ": " + ex.Message); }
        }

        void PostToUi(string jsonText)
        {
            if (!uiReady) { if (uiBacklog.Count < 500) uiBacklog.Enqueue(jsonText); return; }
            try { ui.CoreWebView2.PostWebMessageAsJson(jsonText); } catch (Exception ex) { Log.Write("warn", "رله به رابط: " + ex.Message); }
        }

        void PostToSite(string jsonText)
        {
            if (!siteReady) return;
            try { site.CoreWebView2.PostWebMessageAsJson(jsonText); } catch (Exception ex) { Log.Write("warn", "رله به سایت: " + ex.Message); }
        }

        static string Str(Dictionary<string, object> d, string k)
        {
            object v;
            return d.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : "";
        }

        /// <summary>خروج از حساب: پاک‌کردن کوکی‌های سایت و بازگشت به صفحهٔ ورود سایت (پشت پرده)</summary>
        /// <summary>نشست سایت فقط کوکی نیست (my.ssaa.ir کاربر را در localStorage نگه می‌دارد): همهٔ دادهٔ همان مبدأ پاک می‌شود؛ دادهٔ رابط برنامه (کد ملیِ به‌خاطرسپرده) دست نمی‌خورد</summary>
        async Task ClearSiteSession()
        {
            try
            {
                CoreWebView2 sc = site.CoreWebView2;
                sc.CookieManager.DeleteAllCookies();
                string origin = new Uri(settings.siteUrl).GetLeftPart(UriPartial.Authority);
                await sc.CallDevToolsProtocolMethodAsync("Storage.clearDataForOrigin", "{\"origin\":\"" + origin + "\",\"storageTypes\":\"all\"}");
            }
            catch (Exception ex) { Log.Write("warn", "پاک‌کردن نشست سایت: " + ex.Message); }
        }

        async void Logout()
        {
            await ClearSiteSession();
            try
            {
                site.CoreWebView2.Navigate(settings.siteUrl);
                Log.Write("ok", "خروج از حساب انجام شد.");
            }
            catch (Exception ex) { Log.Write("err", "خروج: " + ex.Message); }
        }

        /* ---------- فایل ---------- */

        void SaveJob(string name, string base64)
        {
            if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(base64)) return;
            byte[] bytes = Convert.FromBase64String(base64);
            Directory.CreateDirectory(Paths.InboxDir);
            string safe = SafeName(name);
            string tmp = Path.Combine(Paths.InboxDir, safe + ".part");
            File.WriteAllBytes(tmp, bytes);
            File.Move(tmp, Path.Combine(Paths.InboxDir, safe));
            Log.Write("ok", "بسته دریافت شد: " + safe + " (" + (bytes.Length / 1024) + " کیلوبایت)");
            if (service == null || !service.Running) Log.Write("warn", "سرویس فایل اجرا نیست؛ بسته در پوشهٔ صف ماند: " + Paths.InboxDir);
        }

        void SaveFile(string name, string base64)
        {
            if (string.IsNullOrEmpty(name) || base64 == null) return;
            byte[] bytes = Convert.FromBase64String(base64);
            string dir = Path.Combine(settings.dest, "خروجی‌های دیگر");
            Directory.CreateDirectory(dir);
            string path = Unique(Path.Combine(dir, SafeName(name)));
            File.WriteAllBytes(path, bytes);
            Log.Write("ok", "ذخیره شد: " + path);
        }

        static string SafeName(string name)
        {
            StringBuilder sb = new StringBuilder();
            foreach (char c in name) sb.Append(Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0 ? '-' : c);
            string s = sb.ToString().Trim();
            return s.Length == 0 ? "فایل" : s;
        }

        static string Unique(string path)
        {
            if (!File.Exists(path)) return path;
            string dir = Path.GetDirectoryName(path), stem = Path.GetFileNameWithoutExtension(path), ext = Path.GetExtension(path);
            for (int i = 2; i < 1000; i++)
            {
                string p = Path.Combine(dir, stem + " (" + i + ")" + ext);
                if (!File.Exists(p)) return p;
            }
            return path;
        }

        void BrowseDest()
        {
            using (System.Windows.Forms.FolderBrowserDialog dlg = new System.Windows.Forms.FolderBrowserDialog())
            {
                dlg.Description = "پوشهٔ مقصد خروجی «ثبت من»";
                dlg.ShowNewFolderButton = true;
                try { if (Directory.Exists(settings.dest)) dlg.SelectedPath = settings.dest; } catch (Exception) { }
                if (dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK) SetDest(dlg.SelectedPath);
            }
        }

        void SetDest(string dest)
        {
            if (string.IsNullOrEmpty(dest)) return;
            settings.dest = dest;
            settings.Save();
            try { Directory.CreateDirectory(dest); } catch (Exception ex) { Log.Write("err", "ساخت پوشهٔ مقصد: " + ex.Message); }
            if (service != null && service.Running) service.SetDest(dest);
            PostToUi(json.Serialize(new Dictionary<string, object> { { "type", "dest" }, { "path", dest } }));
            PushState();
            Log.Write("ok", "پوشهٔ مقصد: " + dest);
        }

        void OpenDest()
        {
            try { Directory.CreateDirectory(settings.dest); Process.Start("explorer.exe", "\"" + settings.dest + "\""); } catch (Exception ex) { Log.Write("err", "باز کردن پوشه: " + ex.Message); }
        }

        /// <summary>وضعیت پوسته + سرویس → رابط ({type:'state', dest, mode, service:{running, browser, busy, lastText, stats}})</summary>
        void PushState()
        {
            Dictionary<string, object> svc = new Dictionary<string, object>();
            svc["running"] = service != null && service.Running;
            svc["port"] = service != null ? service.Port : 0;
            svc["busy"] = false;
            if (service != null && service.Running)
            {
                Dictionary<string, object> st = service.GetState();
                if (st != null)
                {
                    object v;
                    svc["browser"] = st.TryGetValue("مرورگر", out v) && v != null ? v.ToString() : "";
                    svc["busy"] = st.TryGetValue("مشغول", out v) && v is bool && (bool)v;
                    if (st.TryGetValue("گزارش", out v) && v is System.Collections.ArrayList)
                    {
                        System.Collections.ArrayList list = (System.Collections.ArrayList)v;
                        if (list.Count > 0 && list[0] is Dictionary<string, object>)
                        {
                            Dictionary<string, object> first = (Dictionary<string, object>)list[0];
                            svc["lastText"] = Str(first, "text");
                            svc["lastLevel"] = Str(first, "level");
                        }
                    }
                    if (st.TryGetValue("آمار", out v) && v is Dictionary<string, object>) svc["stats"] = v;
                }
            }
            Dictionary<string, object> msg = new Dictionary<string, object>();
            msg["type"] = "state"; msg["dest"] = settings.dest; msg["mode"] = settings.mode; msg["service"] = svc;
            PostToUi(json.Serialize(msg));
        }

        void OnLog(string level, string text)
        {
            if (level == "svc" || level == "svc-err") return;
            Dispatcher.BeginInvoke(new Action(delegate
            {
                PostToUi(json.Serialize(new Dictionary<string, object> { { "type", "log" }, { "level", level }, { "text", text } }));
            }));
        }

        void OnClosing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            if (WindowState == WindowState.Normal) { settings.winWidth = Width; settings.winHeight = Height; settings.winLeft = Left; settings.winTop = Top; }
            settings.Save();
            poll.Stop();
            if (service != null) service.Stop();
            try { site.Dispose(); } catch (Exception) { }
            try { ui.Dispose(); } catch (Exception) { }
        }
    }
}
