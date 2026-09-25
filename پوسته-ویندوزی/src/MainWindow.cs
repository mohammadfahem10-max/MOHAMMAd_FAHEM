// پنجرهٔ اصلی «ثبت من»: نوار بالا (تم طلوع)، WebView2 با سایت، نوار وضعیت پایین، و پل postMessage به رابط تزریقی.
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
        readonly Settings settings;
        readonly WebView2 web = new WebView2();
        readonly TextBlock statusSession = new TextBlock();
        readonly TextBlock statusWork = new TextBlock();
        readonly TextBlock statusDest = new TextBlock();
        readonly DispatcherTimer poll = new DispatcherTimer();
        readonly JavaScriptSerializer json = new JavaScriptSerializer();
        ServiceHost service;
        string bundleDir;
        string overlayScript;
        bool webReady = false;

        static readonly Brush Base = Hex("#EEF1FB"), Ac = Hex("#0F6CBD"), Ac2 = Hex("#6B5BD6"), Tx = Hex("#1A1F2E"), Tx2 = Hex("#454C63"), Line = Hex("#14C9D8FF");
        static Brush Hex(string hex) { return new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex)); }

        public MainWindow()
        {
            json.MaxJsonLength = int.MaxValue;
            settings = Settings.Load();
            Title = "ثبت من — طلوع فردای ایرانیان";
            FlowDirection = FlowDirection.RightToLeft;
            Width = settings.winWidth; Height = settings.winHeight;
            MinWidth = 900; MinHeight = 600;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = Base;
            FontFamily = new FontFamily("Vazirmatn, Tahoma");
            FontSize = 14;
            Content = BuildLayout();
            Loaded += OnLoaded;
            Closing += OnClosing;
            Log.Written += OnLog;
        }

        /* ---------- چیدمان ---------- */

        UIElement BuildLayout()
        {
            DockPanel root = new DockPanel();

            Border top = new Border();
            top.Background = new SolidColorBrush(Color.FromArgb(190, 255, 255, 255));
            top.BorderBrush = Line; top.BorderThickness = new Thickness(0, 0, 0, 1);
            top.Padding = new Thickness(12, 6, 12, 6);
            StackPanel bar = new StackPanel(); bar.Orientation = Orientation.Horizontal;
            TextBlock title = new TextBlock(); title.Text = "ثبت من"; title.FontSize = 18; title.FontWeight = FontWeights.Bold; title.Foreground = Ac; title.VerticalAlignment = VerticalAlignment.Center; title.Margin = new Thickness(0, 0, 14, 0);
            bar.Children.Add(title);
            bar.Children.Add(MakeButton("نمایش سایت / نمایش داده‌ها", true, delegate { PostToWeb("{\"type\":\"toggle\"}"); }));
            bar.Children.Add(MakeButton("انتخاب پوشهٔ مقصد", false, delegate { BrowseDest(); }));
            bar.Children.Add(MakeButton("باز کردن پوشهٔ مقصد", false, delegate { OpenDest(); }));
            bar.Children.Add(MakeButton("تنظیمات", false, delegate { PostToWeb("{\"type\":\"settings\"}"); }));
            bar.Children.Add(MakeButton("بازکردن دوبارهٔ سایت", false, delegate { NavigateSite(); }));
            top.Child = bar;
            DockPanel.SetDock(top, Dock.Top);
            root.Children.Add(top);

            Border bottom = new Border();
            bottom.Background = new SolidColorBrush(Color.FromArgb(190, 255, 255, 255));
            bottom.BorderBrush = Line; bottom.BorderThickness = new Thickness(0, 1, 0, 0);
            bottom.Padding = new Thickness(12, 3, 12, 3);
            StackPanel sb = new StackPanel(); sb.Orientation = Orientation.Horizontal;
            statusSession.Text = "در حال بارگذاری…"; statusSession.Foreground = Tx2; statusSession.Margin = new Thickness(0, 0, 18, 0);
            statusWork.Foreground = Tx2; statusWork.Margin = new Thickness(0, 0, 18, 0);
            statusDest.Foreground = Tx2; statusDest.FlowDirection = FlowDirection.LeftToRight;
            sb.Children.Add(statusSession); sb.Children.Add(statusWork); sb.Children.Add(statusDest);
            bottom.Child = sb;
            DockPanel.SetDock(bottom, Dock.Bottom);
            root.Children.Add(bottom);

            web.FlowDirection = FlowDirection.LeftToRight;
            root.Children.Add(web);
            return root;
        }

        Button MakeButton(string text, bool primary, RoutedEventHandler onClick)
        {
            Button b = new Button();
            b.Content = text;
            b.Padding = new Thickness(12, 4, 12, 4);
            b.Margin = new Thickness(0, 0, 8, 0);
            b.FontWeight = FontWeights.SemiBold;
            b.Cursor = System.Windows.Input.Cursors.Hand;
            b.BorderThickness = new Thickness(1);
            if (primary)
            {
                LinearGradientBrush g = new LinearGradientBrush();
                g.StartPoint = new Point(0, 0); g.EndPoint = new Point(1, 1);
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#0F6CBD"), 0));
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#6B5BD6"), 1));
                b.Background = g; b.Foreground = Brushes.White; b.BorderBrush = Brushes.Transparent;
            }
            else { b.Background = Hex("#E6FFFFFF"); b.Foreground = Tx; b.BorderBrush = Line; }
            b.Click += onClick;
            return b;
        }

        /* ---------- راه‌اندازی ---------- */

        async void OnLoaded(object sender, RoutedEventArgs e)
        {
            UpdateDest();
            bundleDir = Paths.FindBundleDir();
            if (bundleDir == null)
            {
                statusSession.Text = "رابط.js پیدا نشد (کنار exe یا ..\\مخزن\\dist\\پوسته-ویندوزی).";
                Log.Write("err", "رابط.js پیدا نشد.");
            }
            else
            {
                overlayScript = File.ReadAllText(Path.Combine(bundleDir, "رابط.js"), Encoding.UTF8);
                StartService();
            }
            await InitWebView();
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

        async Task InitWebView()
        {
            try
            {
                Directory.CreateDirectory(Paths.WebViewDir);
                CoreWebView2EnvironmentOptions opts = new CoreWebView2EnvironmentOptions();
                opts.Language = "fa";
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, Paths.WebViewDir, opts);
                await web.EnsureCoreWebView2Async(env);
                CoreWebView2 core = web.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = true;
                core.Settings.AreDevToolsEnabled = true;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.IsZoomControlEnabled = true;
                core.WebMessageReceived += OnWebMessage;
                core.NavigationCompleted += OnNavigated;
                core.NewWindowRequested += OnNewWindow;
                if (!string.IsNullOrEmpty(overlayScript))
                {
                    // پیش از کد سایت، در هر بارگذاری. رابط خودش فقط در قاب اصلی و دامنه‌های ssaa.ir فعال می‌شود.
                    await core.AddScriptToExecuteOnDocumentCreatedAsync(overlayScript);
                }
                webReady = true;
                NavigateSite();
            }
            catch (Exception ex)
            {
                Log.Write("err", "WebView2: " + ex.Message);
                MessageBox.Show("WebView2 راه‌اندازی نشد. WebView2 Runtime باید نصب باشد.\n" + ex.Message, "ثبت من", MessageBoxButton.OK, MessageBoxImage.Error, MessageBoxResult.OK, MessageBoxOptions.RtlReading);
            }
        }

        void NavigateSite()
        {
            if (!webReady) return;
            try { web.CoreWebView2.Navigate(settings.siteUrl); } catch (Exception ex) { Log.Write("err", "بازکردن سایت: " + ex.Message); }
        }

        void OnNewWindow(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            // پنجره‌های تازهٔ سایت در همین پنجره باز شوند
            e.Handled = true;
            try { web.CoreWebView2.Navigate(e.Uri); } catch (Exception) { }
        }

        void OnNavigated(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            statusSession.Text = e.IsSuccess ? "سایت باز شد" : "بارگذاری سایت ناموفق: " + e.WebErrorStatus;
        }

        /* ---------- پل ---------- */

        void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string raw;
            try { raw = e.TryGetWebMessageAsString(); } catch (Exception) { raw = e.WebMessageAsJson; }
            if (string.IsNullOrEmpty(raw)) return;
            Dictionary<string, object> msg;
            try { msg = json.Deserialize<Dictionary<string, object>>(raw); } catch (Exception) { return; }
            if (msg == null || !msg.ContainsKey("type")) return;
            string type = Convert.ToString(msg["type"]);
            try
            {
                switch (type)
                {
                    case "ready": PushState(); break;
                    case "job": SaveJob(Str(msg, "name"), Str(msg, "base64")); break;
                    case "file": SaveFile(Str(msg, "name"), Str(msg, "base64")); break;
                    case "browse": BrowseDest(); break;
                    case "openDest": OpenDest(); break;
                    case "setConfig":
                        if (msg.ContainsKey("mode") && msg["mode"] != null) settings.mode = Convert.ToString(msg["mode"]);
                        if (msg.ContainsKey("dest") && msg["dest"] != null) SetDest(Convert.ToString(msg["dest"]));
                        settings.Save();
                        break;
                    case "state": PushState(); break;
                    case "status":
                        statusWork.Text = Str(msg, "text");
                        break;
                }
            }
            catch (Exception ex) { Log.Write("err", "پیام " + type + ": " + ex.Message); }
        }

        static string Str(Dictionary<string, object> d, string k)
        {
            object v;
            return d.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : "";
        }

        /// <summary>بستهٔ کار → پوشهٔ صف؛ سرویس Node همان‌جا را پایش می‌کند و در مقصد مرتب می‌کند.</summary>
        void SaveJob(string name, string base64)
        {
            if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(base64)) return;
            byte[] bytes = Convert.FromBase64String(base64);
            Directory.CreateDirectory(Paths.InboxDir);
            string safe = SafeName(name);
            string tmp = Path.Combine(Paths.InboxDir, safe + ".part");
            File.WriteAllBytes(tmp, bytes);
            File.Move(tmp, Path.Combine(Paths.InboxDir, safe)); // نام نهایی فقط وقتی کامل نوشته شد
            statusWork.Text = "بسته دریافت شد (" + (bytes.Length / 1024) + " کیلوبایت)؛ در حال مرتب‌سازی…";
            Log.Write("ok", "بسته دریافت شد: " + safe);
            if (service == null || !service.Running) Log.Write("warn", "سرویس فایل اجرا نیست؛ بسته در پوشهٔ صف ماند: " + Paths.InboxDir);
        }

        /// <summary>فایل‌های دیگر (نقشهٔ کشف‌شده، CSV، JSON) → مقصد\خروجی‌های دیگر</summary>
        void SaveFile(string name, string base64)
        {
            if (string.IsNullOrEmpty(name) || base64 == null) return;
            byte[] bytes = Convert.FromBase64String(base64);
            string dir = Path.Combine(settings.dest, "خروجی‌های دیگر");
            Directory.CreateDirectory(dir);
            string path = Unique(Path.Combine(dir, SafeName(name)));
            File.WriteAllBytes(path, bytes);
            Log.Write("ok", "ذخیره شد: " + path);
            PostToWeb(json.Serialize(new Dictionary<string, object> { { "type", "log" }, { "level", "ok" }, { "text", "ذخیره شد: " + path } }));
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
            UpdateDest();
            PostToWeb(json.Serialize(new Dictionary<string, object> { { "type", "dest" }, { "path", dest } }));
            PushState();
            Log.Write("ok", "پوشهٔ مقصد: " + dest);
        }

        void OpenDest()
        {
            try { Directory.CreateDirectory(settings.dest); Process.Start("explorer.exe", "\"" + settings.dest + "\""); } catch (Exception ex) { Log.Write("err", "باز کردن پوشه: " + ex.Message); }
        }

        void UpdateDest() { statusDest.Text = "مقصد: " + settings.dest; }

        /// <summary>وضعیت پوسته + سرویس → رابط ({type:'state', dest, mode, service:{running, browser, busy, lastText}})</summary>
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
                    if (st.TryGetValue("آمار", out v) && v is Dictionary<string, object>)
                    {
                        Dictionary<string, object> stats = (Dictionary<string, object>)v;
                        statusWork.Text = "بسته‌ها: " + Str(stats, "processed") + " · PDF: " + Str(stats, "pdfOk") + (Str(stats, "pdfFail") != "0" ? " (ناموفق " + Str(stats, "pdfFail") + ")" : "") + ((bool)svc["busy"] ? " · در حال پردازش…" : "");
                    }
                }
            }
            Dictionary<string, object> msg = new Dictionary<string, object>();
            msg["type"] = "state"; msg["dest"] = settings.dest; msg["mode"] = settings.mode; msg["service"] = svc;
            PostToWeb(json.Serialize(msg));
        }

        void PostToWeb(string jsonText)
        {
            if (!webReady) return;
            try { web.CoreWebView2.PostWebMessageAsJson(jsonText); } catch (Exception) { }
        }

        void OnLog(string level, string text)
        {
            if (level == "svc" || level == "svc-err") return;
            Dispatcher.BeginInvoke(new Action(delegate
            {
                if (level == "err") statusWork.Text = text;
                PostToWeb(json.Serialize(new Dictionary<string, object> { { "type", "log" }, { "level", level == "svc" ? "info" : level }, { "text", text } }));
            }));
        }

        void OnClosing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            settings.winWidth = Width; settings.winHeight = Height;
            settings.Save();
            poll.Stop();
            if (service != null) service.Stop();
            try { web.Dispose(); } catch (Exception) { }
        }
    }
}
