// kbhook.exe — durante o acesso remoto, manda TODO o teclado (inclusive Alt+Tab, tecla Windows, Ctrl+Esc)
// para o PC do amigo enquanto a janela do Perfumolandia estiver em foco. Clicou fora (sua barra de tarefas,
// outra janela): o teclado volta a ser seu na hora.
// Uso: kbhook.exe <hwnd-da-janela>   stdin: "on" / "off"   stdout: "k <scan> <ext 0|1> <down 0|1>"
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

static class Program {
  delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);

  static IntPtr target, hook;
  static volatile bool active;
  static HookProc proc = Hook; // mantém vivo (o GC não pode coletar)
  static Stream stdout;

  static IntPtr Hook(int code, IntPtr wParam, IntPtr lParam) {
    if (code >= 0 && active && GetAncestor(GetForegroundWindow(), 2) == target) {
      var k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
      if ((k.flags & 0x10) == 0) { // ignora teclas injetadas por programas
        int msg = wParam.ToInt32();
        bool down = msg == 0x100 || msg == 0x104;
        uint scan = k.scanCode;
        bool ext = (k.flags & 1) != 0;
        if (k.vkCode == 0x5B || k.vkCode == 0x5C) { scan = k.vkCode == 0x5B ? 0x5Bu : 0x5Cu; ext = true; } // Win esquerda/direita
        var line = System.Text.Encoding.ASCII.GetBytes("k " + scan + " " + (ext ? 1 : 0) + " " + (down ? 1 : 0) + "\n");
        try { stdout.Write(line, 0, line.Length); stdout.Flush(); } catch { }
        return new IntPtr(1); // engole: não chega no seu PC
      }
    }
    return CallNextHookEx(hook, code, wParam, lParam);
  }

  static int Main(string[] args) {
    long h;
    if (args.Length < 1 || !long.TryParse(args[0], out h)) return 2;
    target = new IntPtr(h);
    stdout = Console.OpenStandardOutput();
    new Thread(() => {
      try {
        var r = new StreamReader(Console.OpenStandardInput());
        string l;
        while ((l = r.ReadLine()) != null) active = l.Trim() == "on";
      } catch { }
      Environment.Exit(0); // o Perfumolandia fechou
    }) { IsBackground = true }.Start();
    hook = SetWindowsHookEx(13, proc, GetModuleHandle(null), 0); // WH_KEYBOARD_LL
    MSG m;
    while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
    UnhookWindowsHookEx(hook);
    return 0;
  }
}
