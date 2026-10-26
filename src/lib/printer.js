const { print, getPrinters } = require('pdf-to-printer');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function listPrinters() {
    try {
        const printers = await getPrinters();
        return printers.map((p) => ({
            name: p.name,
            displayName: p.displayName || p.name,
            isDefault: !!p.isDefault
        }));
    } catch (err) {
        console.error('[printer] getPrinters failed:', err.message);
        return [];
    }
}

async function printPdf(pdfBuffer, printerName) {
    if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('Пустой документ');
    }
    const tmpFile = path.join(
        os.tmpdir(),
        `airprint-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
    );
    fs.writeFileSync(tmpFile, pdfBuffer);
    try {
        await print(tmpFile, { printer: printerName });
        console.log(`[printer] ${pdfBuffer.length} байт → "${printerName}"`);
    } finally {
        fs.unlink(tmpFile, () => {});
    }
}

function printRaw(host, data, port = 9100) {
    return new Promise((resolve, reject) => {
        const net = require('net');
        const sock = net.connect(port, host, () => {
            sock.write(data, () => {
                sock.end();
                resolve();
            });
        });
        sock.on('error', reject);
        sock.setTimeout(15000, () => sock.destroy(new Error('Timeout')));
    });
}

module.exports = { listPrinters, printPdf, printRaw };