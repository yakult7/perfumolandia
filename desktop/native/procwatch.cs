// procwatch.exe — lista as janelas visíveis (processo, caminho, título) a cada N segundos, em JSON (uma linha por rodada).
// Substitui chamar o PowerShell a cada 6 s (que gastava CPU só para abrir). Consumo: praticamente zero.
// Uso: procwatch.exe [segundos]   — termina quando o stdin fecha (o Perfumolandia fechou).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class Program {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lp);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder s, ref int size);

  static string Esc(string s) {
    var b = new StringBuilder();
    foreach (var c in s ?? "") {
      if (c == '"' || c == '\\') { b.Append('\\').Append(c); }
      else if (c < 32) b.Append(' ');
      else b.Append(c);
    }
    return b.ToString();
  }
  static string PathOf(int pid) {
    IntPtr h = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (h == IntPtr.Zero) return "";
    try { var sb = new StringBuilder(1024); int n = sb.Capacity; return QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString() : ""; }
    finally { CloseHandle(h); }
  }

  static int Main(string[] args) {
    int sec = 5;
    if (args.Length > 0) int.TryParse(args[0], out sec);
    if (sec < 1) sec = 5;
    bool running = true;
    new Thread(() => { try { var s = Console.OpenStandardInput(); var b = new byte[16]; while (s.Read(b, 0, 16) > 0) { } } catch { } running = false; }) { IsBackground = true }.Start();
    var stdout = Console.OpenStandardOutput();
    var paths = new Dictionary<int, string>();
    while (running) {
      var seen = new HashSet<int>();
      var items = new List<string>();
      EnumWindows((h, lp) => {
        if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true; // só janelas principais (sem dono)
        int len = GetWindowTextLength(h);
        if (len <= 0) return true;
        int pid; GetWindowThreadProcessId(h, out pid);
        if (pid == 0 || seen.Contains(pid)) return true;
        seen.Add(pid);
        var t = new StringBuilder(len + 1); GetWindowText(h, t, t.Capacity);
        string path;
        if (!paths.TryGetValue(pid, out path)) { path = PathOf(pid); paths[pid] = path; }
        if (string.IsNullOrEmpty(path)) return true;
        string name = System.IO.Path.GetFileNameWithoutExtension(path);
        items.Add("{\"n\":\"" + Esc(name) + "\",\"i\":" + pid + ",\"p\":\"" + Esc(path) + "\",\"t\":\"" + Esc(t.ToString()) + "\"}");
        return true;
      }, IntPtr.Zero);
      // esquece caminhos de processos que fecharam
      var gone = new List<int>(); foreach (var k in paths.Keys) if (!seen.Contains(k)) gone.Add(k); foreach (var k in gone) paths.Remove(k);
      var line = Encoding.UTF8.GetBytes("[" + string.Join(",", items.ToArray()) + "]\n");
      try { stdout.Write(line, 0, line.Length); stdout.Flush(); } catch { break; }
      for (int i = 0; i < sec * 10 && running; i++) Thread.Sleep(100);
    }
    return 0;
  }
}
