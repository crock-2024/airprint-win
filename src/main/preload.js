// src/main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    listPrinters: () => ipcRenderer.invoke('printers:list'),
    detectCaps: (printerName) => ipcRenderer.invoke('printer:caps', printerName),
    getConfig: () => ipcRenderer.invoke('config:get'),
    setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
    startServer: (opts) => ipcRenderer.invoke('server:start', opts),
    stopServer: () => ipcRenderer.invoke('server:stop'),
    getState: () => ipcRenderer.invoke('server:state'),
    onEvent: (cb) => {
        const handler = (_e, payload) => cb(payload);
        ipcRenderer.on('server:event', handler);
        return () => ipcRenderer.removeListener('server:event', handler);
    }
});