// اجرای پنهانِ سرویس فایل Node (بک‌اند-فایل/server.js) با node.exe قابل‌حمل؛ با بستن پنجره خاموش می‌شود (Job Object).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

namespace SabtMan
{
    public class ServiceHost : IDisposable
    {
        Process proc;
        IntPtr job = IntPtr.Zero;
        readonly string nodeExe;
        readonly string serverJs;
        public int Port { get; private set; }
        public string InboxDir { get; private set; }
        public string LastError { get; private set; }

        public bool Running { get { return proc != null && !proc.HasExited; } }

        public ServiceHost(string nodeExe, string serverJs, string inboxDir, int port)
        {
            this.nodeExe = nodeExe;
            this.serverJs = serverJs;
            this.InboxDir = inboxDir;
            this.Port = port > 0 ? port : FreePort();
        }

        static int FreePort()
        {
            TcpListener l = new TcpListener(IPAddress.Loopback, 0);
            l.Start();
            int p = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return p;
        }

        public bool Start(string dest, string browserPath)
        {
            try
            {
                Directory.CreateDirectory(InboxDir);
                ProcessStartInfo psi = new ProcessStartInfo(nodeExe, "\"" + serverJs + "\"");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                psi.StandardErrorEncoding = Encoding.UTF8;
                psi.WorkingDirectory = Path.GetDirectoryName(serverJs);
                psi.EnvironmentVariables["SABTMAN_PORT"] = Port.ToString();
                psi.EnvironmentVariables["SABTMAN_INBOX"] = InboxDir;
                psi.EnvironmentVariables["SABTMAN_DEST"] = dest;
                if (!string.IsNullOrEmpty(browserPath)) psi.EnvironmentVariables["SABTMAN_BROWSER"] = browserPath;
                proc = new Process();
                proc.StartInfo = psi;
                proc.EnableRaisingEvents = true;
                proc.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { if (e.Data != null) Log.Write("svc", e.Data); };
                proc.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if (e.Data != null) Log.Write("svc-err", e.Data); };
                proc.Start();
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
                AttachToJob(proc);
                Log.Write("ok", "سرویس فایل روی درگاه " + Port + " با " + nodeExe + " اجرا شد.");
                return true;
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
                Log.Write("err", "اجرای سرویس فایل: " + ex.Message);
                return false;
            }
        }

        /// <summary>GET /api/state → JSON (dictionary) یا null</summary>
        public Dictionary<string, object> GetState()
        {
            try
            {
                using (WebClient wc = new WebClient())
                {
                    wc.Encoding = Encoding.UTF8;
                    string json = wc.DownloadString("http://127.0.0.1:" + Port + "/api/state");
                    return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
                }
            }
            catch (Exception) { return null; }
        }

        public bool PostJson(string path, Dictionary<string, object> body)
        {
            try
            {
                using (WebClient wc = new WebClient())
                {
                    wc.Encoding = Encoding.UTF8;
                    wc.Headers[HttpRequestHeader.ContentType] = "application/json; charset=utf-8";
                    wc.UploadString("http://127.0.0.1:" + Port + path, "POST", new JavaScriptSerializer().Serialize(body));
                    return true;
                }
            }
            catch (Exception ex) { Log.Write("warn", "درخواست به سرویس " + path + ": " + ex.Message); return false; }
        }

        public void SetDest(string dest)
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["dest"] = dest;
            d["inbox"] = InboxDir;
            PostJson("/api/config", d);
        }

        public void Stop()
        {
            try
            {
                if (proc != null && !proc.HasExited)
                {
                    proc.Kill();
                    proc.WaitForExit(3000);
                }
            }
            catch (Exception) { }
            proc = null;
            if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
        }

        public void Dispose() { Stop(); }

        /* ---- Job Object: پایان پردازهٔ Node (و فرزندانش) همراه با پوسته، حتی اگر پوسته ناگهان بسته شود ---- */

        void AttachToJob(Process p)
        {
            try
            {
                job = CreateJobObject(IntPtr.Zero, null);
                if (job == IntPtr.Zero) return;
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                int len = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr ptr = Marshal.AllocHGlobal(len);
                try
                {
                    Marshal.StructureToPtr(info, ptr, false);
                    SetInformationJobObject(job, 9, ptr, (uint)len); // JobObjectExtendedLimitInformation
                }
                finally { Marshal.FreeHGlobal(ptr); }
                AssignProcessToJobObject(job, p.Handle);
            }
            catch (Exception ex) { Log.Write("warn", "Job Object: " + ex.Message); }
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr a, string lpName);
        [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr hJob, int infoType, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential)]
        struct IO_COUNTERS { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }
    }
}
