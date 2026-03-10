const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApi", {
  readAssetFile: (relativeAssetPath) =>
    ipcRenderer.invoke("read-asset-file", relativeAssetPath),
  saveExportFile: (fileName, binary) =>
    ipcRenderer.invoke("save-export-file", fileName, binary),
  openExportFile: (filePath) => ipcRenderer.invoke("open-export-file", filePath),
});
