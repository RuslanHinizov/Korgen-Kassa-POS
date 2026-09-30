const { contextBridge, ipcRenderer } = require("electron");

/** What the till screen may ask of the program around it (the web page has no other access to the computer). */
contextBridge.exposeInMainWorld("korgenShell", {
  minimize: () => ipcRenderer.send("shell:minimize"),
  quit: () => ipcRenderer.send("shell:quit"),
  info: () => ipcRenderer.invoke("shell:info"),
  printReceipt: (html) => ipcRenderer.invoke("print:receipt", html),
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  updateStatus: () => ipcRenderer.invoke("update:status"),
  installUpdate: () => ipcRenderer.send("update:install"),
});
