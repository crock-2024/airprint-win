// src/main/main.js
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { listPrinters } = require('../lib/printer');
const { AirPrintService } = require('./server');
const config = require('./config');

const service = new AirPrintService();
let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 760,
        height: 620,
        minWidth: 640,
        minHeight: 520,
        title: 'AirPrintWin',
        backgroundColor: '#0f172a',
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
});

app.on('window-all-closed', () => {
    service.stop();
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC ---

ipcMain.handle('printers:list', async () => listPrinters());

ipcMain.handle('config:get', () => config.load());

ipcMain.handle('config:set', (_e, patch) => config.save(patch));

ipcMain.handle('printer:caps', async (_e, printerName) => {
    try {
        const { detectCapabilities } = require('../lib/printer-caps');
        return detectCapabilities(printerName);
    } catch (e) {
        return { color: false, duplex: false, mediaDefault: 'iso_a4_210x297mm', detected: false, error: e.message };
    }
});

ipcMain.handle('server:state', () => ({ state: service.state }));

ipcMain.handle('server:start', async (_e, opts) => {
    try {
        const forward = (payload) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('server:event', payload);
            }
        };
        const result = await service.start({ ...opts, onEvent: forward });
        return { ok: true, ...result };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('server:stop', async () => {
    service.stop();
    return { ok: true };
});