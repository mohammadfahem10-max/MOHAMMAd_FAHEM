// شیشهٔ واقعی ویندوز ۱۱ (میکا/آکریلیک) مانند ApplyBackdrop در «اپلیکیشن میزبان\src\Host.cs».
// روی ویندوزهای قدیمی‌تر بی‌صدا نادیده گرفته می‌شود.
using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace SabtMan
{
    public static class Backdrop
    {
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        const int DWMWA_SYSTEMBACKDROP_TYPE = 38;   // ویندوز ۱۱ 22H2+
        const int DWMSBT_MAINWINDOW = 2;            // میکا
        const int DWMSBT_TRANSIENTWINDOW = 3;       // آکریلیک

        public static void TryApply(Window window)
        {
            window.SourceInitialized += delegate
            {
                try
                {
                    if (Environment.OSVersion.Version.Major < 10) return;
                    IntPtr hwnd = new WindowInteropHelper(window).Handle;
                    int backdrop = DWMSBT_MAINWINDOW;
                    int hr = DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, ref backdrop, sizeof(int));
                    if (hr == 0)
                    {
                        // زمینهٔ شفاف تا میکا دیده شود؛ رابط HTML خودش زمینهٔ شیشه‌ای دارد
                        HwndSource src = HwndSource.FromHwnd(hwnd);
                        if (src != null && src.CompositionTarget != null) src.CompositionTarget.BackgroundColor = Colors.Transparent;
                        window.Background = Brushes.Transparent;
                    }
                    int dark = 0;
                    DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref dark, sizeof(int));
                }
                catch (Exception ex) { Log.Write("warn", "شیشهٔ ویندوز: " + ex.Message); }
            };
        }
    }
}
