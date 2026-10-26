// src/main/server.js
const { publishPrinter } = require('../lib/mdns');
const { startIppServer } = require('../lib/ipp-server');
const { detectLocalIp } = require('../lib/net');
const { detectCapabilities } = require('../lib/printer-caps');

// Валидация displayName (defense in depth — UI уже валидирует)
function validateDisplayName(raw) {
    const name = String(raw || '').trim();

    if (name.length === 0) {
        throw new Error('Имя в сети не может быть пустым');
    }
    if (name.length > 63) {
        throw new Error('Имя в сети не может быть длиннее 63 символов');
    }
    if (/[\\/.\0@"\x00-\x1f]/.test(name)) {
        throw new Error('Имя в сети не может содержать \\ / . " @ или управляющие символы');
    }

    return name;
}

class AirPrintService {
    constructor() {
        this.ippServer = null;
        this.mdnsHandle = null;
        this.state = 'stopped';
        this.localIp = null;
    }

    isRunning() {
        return this.state === 'running';
    }

    async start({ printerName, displayName, port = 631, onEvent }) {
        if (this.isRunning()) {
            this.stop();
        }

        this.state = 'starting';

        const rawName = displayName || printerName || 'AirPrintWin';
        const name = validateDisplayName(rawName);

        const localIp = detectLocalIp();
        if (!localIp) {
            this.state = 'error';
            throw new Error('Не удалось определить IPv4-адрес активного интерфейса');
        }
        this.localIp = localIp;

        const caps = detectCapabilities(printerName);
        this.caps = caps;

        return new Promise((resolve, reject) => {
            try {
                this.ippServer = startIppServer({
                    port,
                    targetPrinter: printerName,
                    displayName: name,
                    localIp,
                    caps,
                    onEvent
                });

                this.ippServer.on('error', (err) => {
                    this.state = 'error';
                    reject(err);
                });

                this.ippServer.once('listening', () => {
                    try {
                        this.mdnsHandle = publishPrinter({ name, port, localIp, caps });
                        this.state = 'running';
                        resolve({ printerName, displayName: name, port, localIp, caps });
                    } catch (e) {
                        this.state = 'error';
                        reject(e);
                    }
                });
            } catch (e) {
                this.state = 'error';
                reject(e);
            }
        });
    }

    stop() {
        if (this.mdnsHandle) {
            this.mdnsHandle.stop();
            this.mdnsHandle = null;
        }
        if (this.ippServer) {
            try {
                this.ippServer.close();
            } catch (e) {
                console.warn('[server] close error:', e.message);
            }
            this.ippServer = null;
        }
        this.state = 'stopped';
        this.localIp = null;
    }
}

module.exports = { AirPrintService };