// inputctl.exe — aplica no Windows os comandos de mouse e teclado do controle remoto (estilo AnyDesk).
// Só roda enquanto o dono do PC aceitou o pedido; o Perfumolandia fecha este processo ao encerrar.
// Lê do stdin uma linha por comando:
//   m <x> <y>          move o mouse (pixels físicos da tela inteira)
//   d <botão> / u <botão>   aperta/solta (0 esquerdo, 1 meio, 2 direito)
//   w <delta>          roda vertical (120 = um "clique" da roda)   h <delta> roda horizontal
//   k <scan> <ext 0|1> <down 0|1>   tecla pelo código de varredura (independe do idioma do teclado)
using System;
using System.IO;
using System.Runtime.InteropServices;

static class Program {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public int mouseData; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }

  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  static void Send(INPUT i) { SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT))); }
  static void Mouse(uint flags, int data) {
    var i = new INPUT { type = 0 };
    i.u.mi = new MOUSEINPUT { dwFlags = flags, mouseData = data };
    Send(i);
  }
  static void Key(ushort scan, bool ext, bool down) {
    var i = new INPUT { type = 1 };
    uint f = 0x0008; // KEYEVENTF_SCANCODE
    if (ext) f |= 0x0001; // KEYEVENTF_EXTENDEDKEY
    if (!down) f |= 0x0002; // KEYEVENTF_KEYUP
    i.u.ki = new KEYBDINPUT { wScan = scan, dwFlags = f };
    Send(i);
  }

  static int Main() {
    SetProcessDPIAware();
    var input = new StreamReader(Console.OpenStandardInput());
    string line;
    uint[] downF = { 0x0002, 0x0020, 0x0008 }, upF = { 0x0004, 0x0040, 0x0010 };
    while ((line = input.ReadLine()) != null) {
      var a = line.Split(' ');
      try {
        switch (a[0]) {
          case "m": SetCursorPos(int.Parse(a[1]), int.Parse(a[2])); break;
          case "d": Mouse(downF[Math.Min(2, Math.Max(0, int.Parse(a[1])))], 0); break;
          case "u": Mouse(upF[Math.Min(2, Math.Max(0, int.Parse(a[1])))], 0); break;
          case "w": Mouse(0x0800, int.Parse(a[1])); break;
          case "h": Mouse(0x1000, int.Parse(a[1])); break;
          case "k": Key((ushort)int.Parse(a[1]), a[2] == "1", a[3] == "1"); break;
        }
      } catch { }
    }
    return 0;
  }
}
