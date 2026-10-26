// src/main/server.js
const { publishPrinter } = require('../lib/mdns');
const { startIppServer } = require('../lib/ipp-server');
const { detectLocalIp } = require('../lib/net');

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

        const localIp = detectLocalIp();
        if (!localIp) {
            this.state = 'error';
            throw new Error('Не удалось определить IPv4-адрес активного интерфейса');
        }
        this.localIp = localIp;

        return new Promise((resolve, reject) => {
            try {
                this.ippServer = startIppServer({
                    port,
                    targetPrinter: printerName,
                    localIp,
                    onEvent
                });

                this.ippServer.on('error', (err) => {
                    this.state = 'error';
                    reject(err);
                });

                this.ippServer.once('listening', () => {
                    try {
                        this.mdnsHandle = publishPrinter({ name: displayName, port, localIp });
                        this.state = 'running';
                        resolve({ printerName, displayName, port, localIp });
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