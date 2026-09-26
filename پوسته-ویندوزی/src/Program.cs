// «ثبت من» — پوستهٔ ویندوزی (WPF + WebView2). هدف C# 5 با csc چارچوب 4.0 (بدون $""، ?.، nameof، بدنهٔ =>).
using System;
using System.Threading;
using System.Windows;

namespace SabtMan
{
    public static class Program
    {
        [STAThread]
        public static int Main(string[] args)
        {
            bool created;
            using (Mutex mutex = new Mutex(true, "SabtMan.Shell.SingleInstance", out created))
            {
                if (!created)
                {
                    MessageBox.Show("«ثبت من» از قبل باز است.", "ثبت من", MessageBoxButton.OK, MessageBoxImage.Information, MessageBoxResult.OK, MessageBoxOptions.RtlReading);
                    return 0;
                }
                Application app = new Application();
                app.ShutdownMode = ShutdownMode.OnMainWindowClose;
                app.DispatcherUnhandledException += OnUnhandled;
                AppDomain.CurrentDomain.UnhandledException += OnDomainUnhandled;
                MainWindow win = new MainWindow();
                app.MainWindow = win;
                win.Show();
                return app.Run();
            }
        }

        static void OnUnhandled(object sender, System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
        {
            Log.Write("err", "خطای پیش‌بینی‌نشده: " + e.Exception);
            MessageBox.Show("خطای پیش‌بینی‌نشده:\n" + e.Exception.Message, "ثبت من", MessageBoxButton.OK, MessageBoxImage.Error, MessageBoxResult.OK, MessageBoxOptions.RtlReading);
            e.Handled = true;
        }

        static void OnDomainUnhandled(object sender, UnhandledExceptionEventArgs e)
        {
            Log.Write("err", "خطای دامنه: " + e.ExceptionObject);
        }
    }
}
