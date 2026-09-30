param([string]$Printer, [string]$File)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] bytes, int count, out int written);
  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "OpenPrinter failed " + Marshal.GetLastWin32Error();
    var di = new DOCINFO { pDocName = "Korgen Kassa receipt", pDataType = "RAW" };
    string err = null;
    if (!StartDocPrinter(h, 1, di)) err = "StartDoc failed " + Marshal.GetLastWin32Error();
    else {
      StartPagePrinter(h);
      int written;
      if (!WritePrinter(h, data, data.Length, out written) || written != data.Length) err = "WritePrinter failed " + Marshal.GetLastWin32Error();
      EndPagePrinter(h);
      EndDocPrinter(h);
    }
    ClosePrinter(h);
    return err;
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes($File)
$err = [RawPrinter]::Send($Printer, $bytes)
if ($err) { Write-Error $err; exit 2 }
