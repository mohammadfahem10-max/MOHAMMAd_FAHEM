// مسیرها، تنظیمات و گزارش کار پوسته. همه‌چیز کنار exe در پوشهٔ «داده» می‌ماند (داده هرگز در مخزن نیست).
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace SabtMan
{
    public static class Paths
    {
        public static readonly string AppDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        public static readonly string DataDir = Path.Combine(AppDir, "داده");
        public static readonly string WebViewDir = Path.Combine(DataDir, "WebView2");
        public static readonly string InboxDir = Path.Combine(DataDir, "صف");
        public static readonly string SettingsFile = Path.Combine(DataDir, "تنظیمات.json");
        public static readonly string LogFile = Path.Combine(DataDir, "گزارش-کار.log");

        /// <summary>پوشهٔ خروجی build (قلاب.js، برنامه\، بک‌اند-فایل): کنار exe، وگرنه ..\مخزن\dist\پوسته-ویندوزی، وگرنه SABTMAN_REPO.</summary>
        public static string FindBundleDir()
        {
            List<string> candidates = new List<string>();
            candidates.Add(AppDir);
            candidates.Add(Path.Combine(AppDir, "..", "مخزن", "dist", "پوسته-ویندوزی"));
            candidates.Add(Path.Combine(AppDir, "..", "..", "مخزن", "dist", "پوسته-ویندوزی"));
            string repo = Environment.GetEnvironmentVariable("SABTMAN_REPO");
            if (!string.IsNullOrEmpty(repo)) candidates.Add(Path.Combine(repo, "dist", "پوسته-ویندوزی"));
            foreach (string c in candidates)
            {
                try { if (File.Exists(Path.Combine(c, "قلاب.js")) && Directory.Exists(Path.Combine(c, "برنامه"))) return Path.GetFullPath(c); } catch (Exception) { }
            }
            return null;
        }

        /// <summary>node.exe قابل‌حمل (npm لازم نیست).</summary>
        public static string FindNode(string configured)
        {
            List<string> candidates = new List<string>();
            if (!string.IsNullOrEmpty(configured)) candidates.Add(configured);
            string env = Environment.GetEnvironmentVariable("SABTMAN_NODE");
            if (!string.IsNullOrEmpty(env)) candidates.Add(env);
            candidates.Add(Path.Combine(AppDir, "node.exe"));
            candidates.Add(Path.Combine(AppDir, "node", "node.exe"));
            candidates.Add(Path.Combine(AppDir, "..", "node", "node.exe"));
            candidates.Add(Path.Combine(AppDir, "..", "سرور", "node.exe"));
            candidates.Add(Path.Combine(AppDir, "..", "..", "سرور", "node.exe"));
            candidates.Add(Path.Combine(AppDir, "..", "..", "خانه کلود", "سرور", "node.exe"));
            candidates.Add(Path.Combine(AppDir, "..", "..", "..", "خانه کلود", "سرور", "node.exe"));
            foreach (string c in candidates)
            {
                try { if (File.Exists(c)) return Path.GetFullPath(c); } catch (Exception) { }
            }
            // روی PATH
            string pathVar = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string dir in pathVar.Split(';'))
            {
                try { string p = Path.Combine(dir.Trim(), "node.exe"); if (dir.Trim().Length > 0 && File.Exists(p)) return p; } catch (Exception) { }
            }
            return null;
        }

        public static string DefaultDest()
        {
            // مقصد پیش‌فرض بیرون از پوشهٔ پروژه است و از «تنظیمات ← پوشهٔ مقصد» تغییر می‌کند (خواست کارفرما ۱۴۰۵/۰۷/۰۴)
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "طلوع فردای ایرانیان - ثبت من");
        }
    }

    /// <summary>تنظیمات پوسته (JSON ساده در داده\تنظیمات.json).</summary>
    public class Settings
    {
        public string dest = "";
        public string siteUrl = "https://my.ssaa.ir/";
        public string nodePath = "";
        public string browserPath = "";
        public string mode = "pdf+text";
        public int port = 0;
        public bool panelOpen = false;
        public double winWidth = 1400;
        public double winHeight = 900;
        public double winLeft = -1;
        public double winTop = -1;

        public static Settings Load()
        {
            Settings s = new Settings();
            try
            {
                if (File.Exists(Paths.SettingsFile))
                {
                    JavaScriptSerializer js = new JavaScriptSerializer();
                    Dictionary<string, object> d = js.Deserialize<Dictionary<string, object>>(File.ReadAllText(Paths.SettingsFile, Encoding.UTF8));
                    if (d != null)
                    {
                        object v;
                        if (d.TryGetValue("dest", out v) && v != null) s.dest = v.ToString();
                        if (d.TryGetValue("siteUrl", out v) && v != null) s.siteUrl = v.ToString();
                        if (d.TryGetValue("nodePath", out v) && v != null) s.nodePath = v.ToString();
                        if (d.TryGetValue("browserPath", out v) && v != null) s.browserPath = v.ToString();
                        if (d.TryGetValue("mode", out v) && v != null) s.mode = v.ToString();
                        if (d.TryGetValue("port", out v) && v != null) s.port = Convert.ToInt32(v);
                        if (d.TryGetValue("panelOpen", out v) && v != null) s.panelOpen = Convert.ToBoolean(v);
                        if (d.TryGetValue("winWidth", out v) && v != null) s.winWidth = Convert.ToDouble(v);
                        if (d.TryGetValue("winHeight", out v) && v != null) s.winHeight = Convert.ToDouble(v);
                        if (d.TryGetValue("winLeft", out v) && v != null) s.winLeft = Convert.ToDouble(v);
                        if (d.TryGetValue("winTop", out v) && v != null) s.winTop = Convert.ToDouble(v);
                    }
                }
            }
            catch (Exception ex) { Log.Write("warn", "خواندن تنظیمات: " + ex.Message); }
            if (string.IsNullOrEmpty(s.dest)) s.dest = Paths.DefaultDest();
            return s;
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Paths.DataDir);
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["dest"] = dest; d["siteUrl"] = siteUrl; d["nodePath"] = nodePath; d["browserPath"] = browserPath; d["mode"] = mode;
                d["port"] = port; d["panelOpen"] = panelOpen; d["winWidth"] = winWidth; d["winHeight"] = winHeight; d["winLeft"] = winLeft; d["winTop"] = winTop;
                File.WriteAllText(Paths.SettingsFile, new JavaScriptSerializer().Serialize(d), Encoding.UTF8);
            }
            catch (Exception ex) { Log.Write("warn", "ذخیرهٔ تنظیمات: " + ex.Message); }
        }
    }

    public static class Log
    {
        static readonly object gate = new object();
        public static event Action<string, string> Written;

        public static void Write(string level, string text)
        {
            try
            {
                lock (gate)
                {
                    Directory.CreateDirectory(Paths.DataDir);
                    File.AppendAllText(Paths.LogFile, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + level.ToUpperInvariant() + " " + text + "\r\n", Encoding.UTF8);
                }
            }
            catch (Exception) { }
            Action<string, string> h = Written;
            if (h != null) { try { h(level, text); } catch (Exception) { } }
        }
    }
}
