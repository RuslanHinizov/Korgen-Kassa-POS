const { contextBridge, ipcRenderer } = require("electron");

/** What the till screen may ask of the program around it (the web page has no other access to the computer). */
contextBridge.exposeInMainWorld("korgenShell", {
  minimize: () => ipcRenderer.send("shell:minimize"),
  quit: () => ipcRenderer.send("shell:quit"),
  onCloseRequested: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("shell:close-requested", listener);
    return () => ipcRenderer.removeListener("shell:close-requested", listener);
  },
  deferClose: () => ipcRenderer.send("shell:defer-close"),
  cancelClose: () => ipcRenderer.send("shell:cancel-close"),
  confirmClose: () => ipcRenderer.send("shell:confirm-close"),
  info: () => ipcRenderer.invoke("shell:info"),
  printerStatus: () => ipcRenderer.invoke("print:status"),
  printReceipt: (html) => ipcRenderer.invoke("print:receipt", html),
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  updateStatus: () => ipcRenderer.invoke("update:status"),
  installUpdate: () => ipcRenderer.send("update:install"),
});
