// audiocap.exe — captura o som do Windows SEM o som de um processo (e dos filhos dele).
// Uso: audiocap.exe <pid-para-excluir>          (tela inteira: tudo menos o Perfumolandia)
//      audiocap.exe w<hwnd> include              (janela: só o som do programa dessa janela)
// Saída (stdout): PCM 16 bits, 48000 Hz, estéreo, intercalado. Termina quando o stdin fecha.
// Usado na transmissão de tela: quem assiste ouve o jogo, mas não as vozes da própria chamada (que saem do Perfumolandia).
// Requer Windows 10 2004 (build 19041) ou mais novo. Compila com o csc do .NET Framework 4 (vem no Windows).
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

[ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivateAudioInterfaceCompletionHandler { void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op); }

[ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivateAudioInterfaceAsyncOperation { void GetActivateResult(out int hr, [MarshalAs(UnmanagedType.IUnknown)] out object iface); }

[ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAgileObject { }

[ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClient {
  void Initialize(int shareMode, uint flags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
  void GetBufferSize(out uint frames);
  void GetStreamLatency(out long latency);
  void GetCurrentPadding(out uint padding);
  void IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
  void GetMixFormat(out IntPtr format);
  void GetDevicePeriod(out long def, out long min);
  void Start();
  void Stop();
  void Reset();
  void SetEventHandle(IntPtr handle);
  void GetService([In] ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}

[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioCaptureClient {
  void GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devPos, out ulong qpcPos);
  void ReleaseBuffer(uint frames);
  void GetNextPacketSize(out uint frames);
}

[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
class Handler : IActivateAudioInterfaceCompletionHandler, IAgileObject {
  public readonly ManualResetEvent Done = new ManualResetEvent(false);
  public object Client; public int Hr;
  public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op) {
    object o; op.GetActivateResult(out Hr, out o); Client = o; Done.Set();
  }
}

static class Program {
  [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
  static extern void ActivateAudioInterfaceAsync([MarshalAs(UnmanagedType.LPWStr)] string path, [In] ref Guid riid, IntPtr activationParams,
    IActivateAudioInterfaceCompletionHandler handler, out IActivateAudioInterfaceAsyncOperation op);

  const int SAMPLE_RATE = 48000, CHANNELS = 2, BITS = 16;

  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);

  [MTAThread]
  static int Main(string[] args) {
    int pid;
    long hwnd;
    if (args.Length > 0 && args[0].StartsWith("w") && long.TryParse(args[0].Substring(1), out hwnd)) {
      GetWindowThreadProcessId(new IntPtr(hwnd), out pid);
      if (pid == 0) { Console.Error.WriteLine("janela não encontrada"); return 3; }
    } else if (args.Length < 1 || !int.TryParse(args[0], out pid)) { Console.Error.WriteLine("uso: audiocap <pid>"); return 2; }
    try { return Run(pid, args.Length > 1 && args[1] == "include"); } catch (Exception e) { Console.Error.WriteLine("erro: " + e.Message); return 1; }
  }

  static int Run(int pid, bool include) {
    // AUDIOCLIENT_ACTIVATION_PARAMS { ActivationType = PROCESS_LOOPBACK, { TargetProcessId, EXCLUDE_TARGET_PROCESS_TREE } }
    IntPtr p = Marshal.AllocHGlobal(12);
    Marshal.WriteInt32(p, 0, 1);
    Marshal.WriteInt32(p, 4, pid);
    Marshal.WriteInt32(p, 8, include ? 0 : 1);
    // PROPVARIANT VT_BLOB
    IntPtr pv = Marshal.AllocHGlobal(24);
    for (int i = 0; i < 24; i++) Marshal.WriteByte(pv, i, 0);
    Marshal.WriteInt16(pv, 0, 65);
    Marshal.WriteInt32(pv, 8, 12);
    Marshal.WriteIntPtr(pv, 16, p);

    Guid iidClient = typeof(IAudioClient).GUID;
    var h = new Handler();
    IActivateAudioInterfaceAsyncOperation op;
    ActivateAudioInterfaceAsync("VAD\\Process_Loopback", ref iidClient, pv, h, out op);
    if (!h.Done.WaitOne(10000)) throw new Exception("ativação demorou");
    if (h.Hr != 0) throw new Exception("ativação falhou 0x" + h.Hr.ToString("X8"));
    var client = (IAudioClient)h.Client;

    // WAVEFORMATEX PCM
    IntPtr fmt = Marshal.AllocHGlobal(18);
    Marshal.WriteInt16(fmt, 0, 1);
    Marshal.WriteInt16(fmt, 2, CHANNELS);
    Marshal.WriteInt32(fmt, 4, SAMPLE_RATE);
    Marshal.WriteInt32(fmt, 8, SAMPLE_RATE * CHANNELS * BITS / 8);
    Marshal.WriteInt16(fmt, 12, (short)(CHANNELS * BITS / 8));
    Marshal.WriteInt16(fmt, 14, BITS);
    Marshal.WriteInt16(fmt, 16, 0);
    const uint LOOPBACK = 0x00020000, EVENTCALLBACK = 0x00040000, AUTOCONVERT = 0x80000000, SRC_QUALITY = 0x08000000;
    client.Initialize(0, LOOPBACK | EVENTCALLBACK | AUTOCONVERT | SRC_QUALITY, 200000, 0, fmt, IntPtr.Zero);
    var ready = new AutoResetEvent(false);
    client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle());
    Guid iidCap = typeof(IAudioCaptureClient).GUID;
    object capObj; client.GetService(ref iidCap, out capObj);
    var cap = (IAudioCaptureClient)capObj;

    var stdout = Console.OpenStandardOutput();
    bool running = true;
    // stdin fechado = o app terminou a transmissão (ou fechou): encerra
    new Thread(() => { try { var s = Console.OpenStandardInput(); var b = new byte[64]; while (s.Read(b, 0, b.Length) > 0) { } } catch { } running = false; ready.Set(); }) { IsBackground = true }.Start();

    client.Start();
    byte[] buf = new byte[0];
    const int FRAME = CHANNELS * BITS / 8;
    while (running) {
      ready.WaitOne(200);
      uint n;
      cap.GetNextPacketSize(out n);
      while (n > 0 && running) {
        IntPtr data; uint frames, flags; ulong a, b;
        cap.GetBuffer(out data, out frames, out flags, out a, out b);
        int bytes = (int)frames * FRAME;
        if (buf.Length < bytes) buf = new byte[bytes];
        if ((flags & 2) != 0) Array.Clear(buf, 0, bytes); else Marshal.Copy(data, buf, 0, bytes);
        cap.ReleaseBuffer(frames);
        try { stdout.Write(buf, 0, bytes); } catch { running = false; break; }
        cap.GetNextPacketSize(out n);
      }
      try { stdout.Flush(); } catch { running = false; }
    }
    client.Stop();
    return 0;
  }
}
