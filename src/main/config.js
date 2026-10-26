// src/main/config.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
    displayName: 'AirPrintWin',
    printerName: '',
    port: 631,
};

function getConfigPath() {
    return path.join(app.getPath('userData'), 'config.json');
}

function load() {
    try {
        const p = getConfigPath();
        console.log('[config] Loading from:', p);
        if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf8');
            const parsed = JSON.parse(raw);
            const merged = { ...DEFAULTS, ...parsed };
            console.log('[config] Loaded:', merged);
            return merged;
        }
    } catch (e) {
        console.warn('[config] Load failed:', e.message);
    }
    console.log('[config] Using defaults');
    return { ...DEFAULTS };
}

function save(patch) {
    try {
        const current = load();
        const merged = { ...current, ...patch };
        const p = getConfigPath();
        console.log('[config] Saving to:', p);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(merged, null, 2), 'utf8');
        console.log('[config] File exists after write:', fs.existsSync(p));
        console.log('[config] Saved:', merged);
        return merged;
    } catch (e) {
        console.warn('[config] Save failed:', e.message);
        console.warn('[config] Stack:', e.stack);
        return null;
    }
}

module.exports = { load, save, DEFAULTS, getConfigPath };