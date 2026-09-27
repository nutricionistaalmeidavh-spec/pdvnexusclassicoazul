const { contextBridge, ipcRenderer } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RAW_LABEL_MAX_BYTES = 1024 * 1024;

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      { encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr || error.message || "Falha ao executar PowerShell.").trim()));
          return;
        }
        resolve(String(stdout || ""));
      }
    );
  });
}

async function listWindowsPrinters() {
  if (process.platform !== "win32") return [];
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding",
    "Get-WmiObject Win32_Printer | ForEach-Object {",
    "  $flag = '0'; if ($_.Default) { $flag = '1' }",
    "  [Console]::Out.WriteLine($flag + \"`t\" + [string]$_.Name)",
    "}"
  ].join("; ");
  const output = await runPowerShell(command);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("\t");
      if (separator < 0) return { name: line, isDefault: false };
      return { name: line.slice(separator + 1).trim(), isDefault: line.slice(0, separator) === "1" };
    })
    .filter((printer) => printer.name);
}

async function printRawLabel(options) {
  if (process.platform !== "win32") return { success: false, failureReason: "Impressão RAW de etiqueta está disponível somente no Windows." };
  const printerName = String(options?.printerName || "").trim();
  const data = String(options?.data || "");
  const jobName = String(options?.jobName || "PDV Nexus - Etiqueta").slice(0, 120);
  if (!printerName) return { success: false, failureReason: "Selecione uma etiquetadora instalada no Windows." };
  const bytes = Buffer.from(data, "utf8");
  if (!bytes.length) return { success: false, failureReason: "O trabalho de etiqueta está vazio." };
  if (bytes.length > RAW_LABEL_MAX_BYTES) return { success: false, failureReason: "O trabalho de etiqueta excede 1 MB." };

  const tempFile = path.join(os.tmpdir(), `pdv-nexus-label-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.prn`);
  fs.writeFileSync(tempFile, bytes);
  const printer64 = Buffer.from(printerName, "utf8").toString("base64");
  const file64 = Buffer.from(tempFile, "utf8").toString("base64");
  const job64 = Buffer.from(jobName, "utf8").toString("base64");
  const command = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public static class NexusRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    public string pDocName;
    public string pOutputFile;
    public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern bool OpenPrinter(string printerName, out IntPtr printerHandle, IntPtr defaults);

  [DllImport("winspool.Drv", SetLastError = true)]
  private static extern bool ClosePrinter(IntPtr printerHandle);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern int StartDocPrinter(IntPtr printerHandle, int level, [In] DOCINFO docInfo);

  [DllImport("winspool.Drv", SetLastError = true)]
  private static extern bool EndDocPrinter(IntPtr printerHandle);

  [DllImport("winspool.Drv", SetLastError = true)]
  private static extern bool StartPagePrinter(IntPtr printerHandle);

  [DllImport("winspool.Drv", SetLastError = true)]
  private static extern bool EndPagePrinter(IntPtr printerHandle);

  [DllImport("winspool.Drv", SetLastError = true)]
  private static extern bool WritePrinter(IntPtr printerHandle, IntPtr bytes, int count, out int written);

  public static void Send(string printerName, string fileName, string documentName) {
    IntPtr printerHandle;
    if (!OpenPrinter(printerName, out printerHandle, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      DOCINFO doc = new DOCINFO();
      doc.pDocName = documentName;
      doc.pDataType = "RAW";
      if (StartDocPrinter(printerHandle, 1, doc) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(printerHandle)) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
          byte[] content = File.ReadAllBytes(fileName);
          IntPtr unmanaged = Marshal.AllocCoTaskMem(content.Length);
          try {
            Marshal.Copy(content, 0, unmanaged, content.Length);
            int written;
            if (!WritePrinter(printerHandle, unmanaged, content.Length, out written) || written != content.Length) throw new Win32Exception(Marshal.GetLastWin32Error());
          } finally {
            Marshal.FreeCoTaskMem(unmanaged);
          }
        } finally {
          EndPagePrinter(printerHandle);
        }
      } finally {
        EndDocPrinter(printerHandle);
      }
    } finally {
      ClosePrinter(printerHandle);
    }
  }
}
'@
$printer = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${printer64}'))
$file = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${file64}'))
$job = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${job64}'))
[NexusRawPrinter]::Send($printer, $file, $job)
`;

  try {
    await runPowerShell(command);
    return { success: true, failureReason: "" };
  } catch (error) {
    return { success: false, failureReason: error instanceof Error ? error.message : String(error) };
  } finally {
    try { fs.unlinkSync(tempFile); } catch { /* best effort */ }
  }
}

contextBridge.exposeInMainWorld("nexusDesktop", {
  secrets: {
    get: (key) => ipcRenderer.invoke("nexus-secret:get", key),
    set: (key, value) => ipcRenderer.invoke("nexus-secret:set", key, value),
    remove: (key) => ipcRenderer.invoke("nexus-secret:remove", key),
    isEncryptionAvailable: () => ipcRenderer.invoke("nexus-secret:encryption-available")
  },
  serial: {
    list: () => ipcRenderer.invoke("nexus-serial:list"),
    open: (options) => ipcRenderer.invoke("nexus-serial:open", options),
    write: (path, value) => ipcRenderer.invoke("nexus-serial:write", path, value),
    close: (path) => ipcRenderer.invoke("nexus-serial:close", path),
    onData: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("nexus-serial:data", listener);
      return () => ipcRenderer.removeListener("nexus-serial:data", listener);
    },
    onError: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("nexus-serial:error", listener);
      return () => ipcRenderer.removeListener("nexus-serial:error", listener);
    }
  },
  pdvStore: {
    status: () => ipcRenderer.invoke("nexus-pdv-store:status"),
    load: (storeKey) => ipcRenderer.invoke("nexus-pdv-store:load", storeKey),
    save: (storeKey, snapshotJson) => ipcRenderer.invoke("nexus-pdv-store:save", storeKey, snapshotJson)
  },
  store: {
    status: () => ipcRenderer.invoke("app-store:status"),
    load: (storeKey) => ipcRenderer.invoke("app-store:load", storeKey),
    save: (storeKey, snapshotJson) => ipcRenderer.invoke("app-store:save", storeKey, snapshotJson)
  },
  backup: {
    list: (scope) => ipcRenderer.invoke("app-backup:list", scope),
    write: (options) => ipcRenderer.invoke("app-backup:write", options)
  },
  pdvSync: {
    status: () => ipcRenderer.invoke("nexus-pdv-sync:status"),
    start: (options) => ipcRenderer.invoke("nexus-pdv-sync:start", options),
    stop: () => ipcRenderer.invoke("nexus-pdv-sync:stop")
  },
  pdvBackup: {
    list: () => ipcRenderer.invoke("nexus-pdv-backup:list"),
    write: (options) => ipcRenderer.invoke("nexus-pdv-backup:write", options)
  },
  printing: {
    receipt: (options) => ipcRenderer.invoke("nexus-print:receipt", options),
    printers: () => listWindowsPrinters(),
    rawLabel: (options) => printRawLabel(options)
  }
});
