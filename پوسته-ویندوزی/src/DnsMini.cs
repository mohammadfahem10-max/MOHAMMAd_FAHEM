// حل نام دامنه با DNSِ انتخابی کاربر (UDP، بی هیچ کتابخانه) — برای «تغییر آی‌پی/DNS» وقتی سامانه بلاک می‌کند.
// هدف C# 5 چارچوب 4.0. فقط رکورد A. هیچ محافظی دور زده نمی‌شود؛ فقط نامِ my.ssaa.ir از راه DNSِ دلخواه حل می‌شود.
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;

namespace SabtMan
{
    public static class DnsMini
    {
        /// <summary>نخستین آی‌پی A رکورد host را با پرس‌وجو از هر یک از serversها برمی‌گرداند؛ اگر هیچ‌کدام نشد، null.</summary>
        public static string ResolveA(string host, string[] servers, int timeoutMs)
        {
            foreach (string server in servers)
            {
                string s = (server ?? "").Trim();
                if (s.Length == 0) continue;
                try
                {
                    string ip = QueryOne(host, s, timeoutMs);
                    if (ip != null) return ip;
                }
                catch (Exception) { /* سرور بعدی */ }
            }
            return null;
        }

        static string QueryOne(string host, string server, int timeoutMs)
        {
            byte[] query = BuildQuery(host);
            using (UdpClient udp = new UdpClient())
            {
                udp.Client.ReceiveTimeout = timeoutMs;
                udp.Client.SendTimeout = timeoutMs;
                IPEndPoint ep = new IPEndPoint(IPAddress.Parse(server), 53);
                udp.Send(query, query.Length, ep);
                IPEndPoint from = new IPEndPoint(IPAddress.Any, 0);
                udp.Client.ReceiveTimeout = timeoutMs;
                byte[] resp = udp.Receive(ref from);
                return ParseFirstA(resp, query);
            }
        }

        static byte[] BuildQuery(string host)
        {
            List<byte> b = new List<byte>();
            Random r = new Random();
            b.Add((byte)r.Next(256)); b.Add((byte)r.Next(256)); // ID
            b.Add(0x01); b.Add(0x00); // flags: RD
            b.Add(0x00); b.Add(0x01); // QDCOUNT = 1
            b.Add(0x00); b.Add(0x00); // ANCOUNT
            b.Add(0x00); b.Add(0x00); // NSCOUNT
            b.Add(0x00); b.Add(0x00); // ARCOUNT
            foreach (string label in host.Split('.'))
            {
                byte[] bytes = System.Text.Encoding.ASCII.GetBytes(label);
                b.Add((byte)bytes.Length);
                b.AddRange(bytes);
            }
            b.Add(0x00);              // پایان نام
            b.Add(0x00); b.Add(0x01); // TYPE A
            b.Add(0x00); b.Add(0x01); // CLASS IN
            return b.ToArray();
        }

        static string ParseFirstA(byte[] resp, byte[] query)
        {
            if (resp == null || resp.Length < 12) return null;
            int qd = (resp[4] << 8) | resp[5];
            int an = (resp[6] << 8) | resp[7];
            if (an <= 0) return null;
            int pos = 12;
            // رد شدن از بخش پرسش
            for (int i = 0; i < qd; i++)
            {
                pos = SkipName(resp, pos);
                pos += 4; // TYPE + CLASS
            }
            for (int i = 0; i < an && pos + 10 <= resp.Length; i++)
            {
                pos = SkipName(resp, pos);
                if (pos + 10 > resp.Length) break;
                int type = (resp[pos] << 8) | resp[pos + 1];
                int rdlen = (resp[pos + 8] << 8) | resp[pos + 9];
                int rd = pos + 10;
                if (type == 1 && rdlen == 4 && rd + 4 <= resp.Length)
                    return resp[rd] + "." + resp[rd + 1] + "." + resp[rd + 2] + "." + resp[rd + 3];
                pos = rd + rdlen;
            }
            return null;
        }

        static int SkipName(byte[] b, int pos)
        {
            while (pos < b.Length)
            {
                int len = b[pos];
                if (len == 0) return pos + 1;
                if ((len & 0xC0) == 0xC0) return pos + 2; // اشاره‌گر فشرده
                pos += len + 1;
            }
            return pos;
        }
    }
}
