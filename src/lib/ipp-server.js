// src/lib/ipp-server.js
const http = require('http');
const { parseIppRequest, buildIppResponse, OP, STATUS } = require('./ipp-parser');
const { printPdf } = require('./printer');
const {
    PRINTER_UUID,
    PRINTER_NAME,
    SERVICE_PORT,
    HOSTNAME,      // ← импорт
    HOST_FQDN,     // ← импорт
} = require('./mdns');
const { detectLocalIp } = require('./net');

// Debugger if you need!
function logRawResponse(label, buf) {
    console.log(`\n========== RAW RESPONSE (${label}) ==========`);
    console.log('[IPP] length:', buf.length, 'bytes');
    console.log('[IPP] hex:');
    console.log(buf.toString('hex').match(/.{1,64}/g)?.join('\n') || '(empty)');
    console.log('==============================================\n');
}

function buildPrinterAttrs(localIp, port = SERVICE_PORT) {
    return {
        // === URI — ДОЛЖЕН совпадать с mDNS (rp=ipp/print + hostname из mDNS) ===
        'printer-uri-supported': { tag: 0x45, value: `ipp://${localIp}:${port}/ipp/print` },
        'uri-security-supported': 'none',
        'uri-authentication-supported': 'none',

        // === Identity ===
        'printer-name': { tag: 0x42, value: PRINTER_NAME },
        'printer-info': { tag: 0x41, value: 'AirPrintWin virtual printer' },
        'printer-location': { tag: 0x41, value: 'Local' },
        'printer-make-and-model': { tag: 0x41, value: 'AirPrintWin IPP Everywhere' },

        // === AirPrint ===
        'ipp-features-supported': 'airprint-1.8',

        // === State (ENUM!) ===
        'printer-state': { tag: 0x23, value: 3 },
        'printer-state-reasons': 'none',
        'printer-is-accepting-jobs': true,

        // === UUID ===
        'printer-uuid': { tag: 0x45, value: `urn:uuid:${PRINTER_UUID}` },
        'printer-more-info': { tag: 0x45, value: `http://${localIp}:${port}/` },

        // === Formats ===
        'document-format-supported': [
            { tag: 0x49, value: 'application/pdf' },
            { tag: 0x49, value: 'image/urf' },
            { tag: 0x49, value: 'image/jpeg' },
            { tag: 0x49, value: 'image/png' },
            { tag: 0x49, value: 'image/pwg-raster' },
            { tag: 0x49, value: 'application/octet-stream' },
        ],
        'document-format-default': { tag: 0x49, value: 'application/pdf' },

        // === Color (boolean) ===
        'color-supported': false,

        // === Sides ===
        'sides-supported': 'one-sided',
        'sides-default': 'one-sided',

        // === Media ===
        'media-supported': [
            { tag: 0x44, value: 'iso_a4_210x297mm' },
            { tag: 0x44, value: 'na_letter_8.5x11in' },
            { tag: 0x44, value: 'iso_a5_148x210mm' },
            { tag: 0x44, value: 'iso_a6_105x148mm' },
        ],
        'media-default': 'iso_a4_210x297mm',
        'media-ready': [
            { tag: 0x44, value: 'iso_a4_210x297mm' },
            { tag: 0x44, value: 'na_letter_8.5x11in' },
        ],
        'media-col-supported': [
            { tag: 0x44, value: 'media-size' },
            { tag: 0x44, value: 'media-type' },
            { tag: 0x44, value: 'media-source' },
        ],

        // === Copies ===
        'copies-supported': { tag: 0x33, value: { lower: 1, upper: 99 } },
        'copies-default': { tag: 0x21, value: 1 },

        // === URF ===
        'urf-supported': [
            { tag: 0x44, value: 'W8' },
            { tag: 0x44, value: 'SRGB24' },
            { tag: 0x44, value: 'V1.4' },
            { tag: 0x44, value: 'RS300-600' },
            { tag: 0x44, value: 'DM1' },
        ],

        // === IPP versions ===
        'ipp-versions-supported': [
            { tag: 0x44, value: '1.1' },
            { tag: 0x44, value: '2.0' },
        ],

        // === Operations (ENUM!) ===
        'operations-supported': [
            { tag: 0x23, value: 0x0002 },  // Print-Job
            { tag: 0x23, value: 0x0004 },  // Validate-Job
            { tag: 0x23, value: 0x000b },  // Get-Printer-Attributes
            { tag: 0x23, value: 0x000a },  // Get-Jobs
        ],

        // === Charset / Language ===
        'charset-configured': { tag: 0x47, value: 'utf-8' },
        'charset-supported': [{ tag: 0x47, value: 'utf-8' }],
        'natural-language-configured': { tag: 0x48, value: 'en-us' },
        'generated-natural-language-supported': [{ tag: 0x48, value: 'en-us' }],

        // === Job state ===
        'queued-job-count': { tag: 0x21, value: 0 },
        'multiple-document-jobs-supported': false,   // boolean!
        'pdl-override-supported': 'not-attempted',
        'compression-supported': 'none',

        // === Print quality (ENUM!) ===
        'print-quality-default': { tag: 0x23, value: 4 },
        'print-quality-supported': [
            { tag: 0x23, value: 3 },
            { tag: 0x23, value: 4 },
            { tag: 0x23, value: 5 },
        ],

        // === Info ===
        'pages-per-minute': { tag: 0x21, value: 10 },

        // === printer-type (ENUM!) ===
        'printer-type': { tag: 0x23, value: 0x00000005 },
    };
}

function startIppServer({ port = SERVICE_PORT, targetPrinter, localIp, onEvent } = {}) {
    if (!localIp) localIp = detectLocalIp();
    if (!localIp) {
        throw new Error('[IPP] Не удалось определить IPv4-адрес активного интерфейса');
    }

    const emit = (type, payload = {}) => {
        console.log(`[event] ${type}`, payload);
        if (typeof onEvent === 'function') onEvent({ type, ...payload });
    };

    const server = http.createServer((req, res) => {
        // === GET — iPhone проверяет доступность через этот endpoint ===
        if (req.method === 'GET' || req.method === 'HEAD') {
            const html = `<!doctype html><html><body>
            <h1>AirPrintWin</h1>
            <p>Printer: <b>${PRINTER_NAME}</b></p>
            <p>Status: online</p>
        </body></html>`;
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Length': Buffer.byteLength(html),
            });
            return req.method === 'HEAD' ? res.end() : res.end(html);
        }

        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'text/plain' });
            return res.end('Method Not Allowed');
        }

        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
            const body = Buffer.concat(chunks);

            let parsed;
            try {
                parsed = parseIppRequest(body);
            } catch (e) {
                console.error('[IPP] parse error:', e.message);
                res.writeHead(400);
                return res.end();
            }

            console.log(
                `[IPP] op=0x${parsed.op.toString(16)} requestId=${parsed.requestId} doc=${
                    parsed.document ? parsed.document.length + 'b' : 'none'
                }`
            );

            emit('request', {
                op: `0x${parsed.op.toString(16)}`,
                docBytes: parsed.document ? parsed.document.length : 0
            });

            try {
                switch (parsed.op) {
                    case OP.GET_PRINTER_ATTRIBUTES: {
                        const attrs = buildPrinterAttrs(localIp, port);

                        const resp = buildIppResponse({
                            requestId: parsed.requestId,
                            status: STATUS.OK,
                            attributes: attrs,
                            version: parsed.version
                        });

                        //logRawResponse('Get-Printer-Attributes', resp);

                        res.writeHead(200, {
                            'Content-Type': 'application/ipp',
                            'Content-Length': resp.length
                        });
                        return res.end(resp);
                    }

                    case OP.VALIDATE_JOB: {
                        const resp = buildIppResponse({
                            requestId: parsed.requestId,
                            status: STATUS.OK,
                            attributes: { 'status-message': 'Job valid' },
                            version: parsed.version
                        });
                        //logRawResponse('Get-Printer-Attributes', resp);
                        res.writeHead(200, {
                            'Content-Type': 'application/ipp',
                            'Content-Length': resp.length
                        });
                        return res.end(resp);
                    }

                    case 0x0005: { // Create-Job
                        const jobId = Date.now() % 100000;
                        const resp = buildIppResponse({
                            requestId: parsed.requestId,
                            status: STATUS.OK,
                            attributes: {
                                'job-id': jobId,
                                'job-uri': `ipp://${localIp}:${port}/printers/${PRINTER_NAME}/jobs/${jobId}`,
                                'job-state': 3,
                                'job-state-reasons': 'none'
                            },
                            version: parsed.version
                        });
                        //logRawResponse('Get-Printer-Attributes', resp);
                        res.writeHead(200, {
                            'Content-Type': 'application/ipp',
                            'Content-Length': resp.length
                        });
                        return res.end(resp);
                    }

                    case 0x0006: { // Send-Document
                        const jobId = parsed.attributes['job-id'] || 0;
                        if (parsed.document && parsed.document.length > 0) {
                            const fmt = parsed.attributes['document-format'] || 'application/pdf';
                            if (fmt.includes('pdf')) {
                                printPdf(parsed.document, targetPrinter)
                                    .then(() => emit('job-printed', { jobId, format: fmt, size: parsed.document.length }))
                                    .catch((e) => emit('job-error', { jobId, error: e.message }));
                            } else {
                                emit('job-skipped', { jobId, format: fmt, reason: 'unsupported format' });
                            }
                        }
                        const resp = buildIppResponse({
                            requestId: parsed.requestId,
                            status: STATUS.OK,
                            attributes: {
                                'job-id': jobId,
                                'job-state': 5,
                                'job-state-reasons': 'none'
                            },
                            version: parsed.version
                        });
                       // logRawResponse('Get-Printer-Attributes', resp);
                        res.writeHead(200, {
                            'Content-Type': 'application/ipp',
                            'Content-Length': resp.length
                        });
                        return res.end(resp);
                    }

                    case OP.GET_JOBS: {
                        const resp = buildIppResponse({
                            requestId: parsed.requestId,
                            status: STATUS.OK,
                            attributes: {},
                            version: parsed.version
                        });
                       // logRawResponse('Get-Printer-Attributes', resp);
                        res.writeHead(200, {
                            'Content-Type': 'application/ipp',
                            'Content-Length': resp.length
                        });
                        return res.end(resp);
                    }

                    case OP.GET_JOB_ATTRIBUTES: {
                        const jobId = parsed.attributes['job-id'] || 0;
                        const resp = buildIppResponse({
                            requestId: parsed.requestId,
                            status: STATUS.OK,
                            attributes: {
                                'job-id': jobId,
                                'job-state': 9,
                                'job-state-reasons': 'none'
                            },
                            version: parsed.version
                        });
                       // logRawResponse('Get-Printer-Attributes', resp);
                        res.writeHead(200, {
                            'Content-Type': 'application/ipp',
                            'Content-Length': resp.length
                        });
                        return res.end(resp);
                    }

                    case OP.CANCEL_JOB: {
                        const jobId = parsed.attributes['job-id'] || 0;
                        const resp = buildIppResponse({
                            requestId: parsed.requestId,
                            status: STATUS.OK,
                            attributes: {
                                'job-id': jobId,
                                'job-state': 7,
                                'job-state-reasons': 'job-canceled-by-user'
                            },
                            version: parsed.version
                        });
                       // logRawResponse('Get-Printer-Attributes', resp);
                        res.writeHead(200, {
                            'Content-Type': 'application/ipp',
                            'Content-Length': resp.length
                        });
                        return res.end(resp);
                    }

                    case OP.PRINT_JOB: {
                        if (!parsed.document || parsed.document.length === 0) {
                            const resp = buildIppResponse({
                                requestId: parsed.requestId,
                                status: STATUS.CLIENT_BAD_REQUEST,
                                attributes: { 'status-message': 'No document' },
                                version: parsed.version
                            });
                          //  logRawResponse('Get-Printer-Attributes', resp);
                            res.writeHead(200, {
                                'Content-Type': 'application/ipp',
                                'Content-Length': resp.length
                            });
                            return res.end(resp);
                        }

                        const fmt = parsed.attributes['document-format'] || 'application/pdf';
                        const jobId = Date.now() % 100000;

                        const resp = buildIppResponse({
                            requestId: parsed.requestId,
                            status: STATUS.OK,
                            attributes: {
                                'job-id': jobId,
                                'job-uri': `ipp://${localIp}:${port}/printers/${PRINTER_NAME}/jobs/${jobId}`,
                                'job-state': 3,
                                'job-state-reasons': 'none'
                            },
                            version: parsed.version
                        });
                       // logRawResponse('Get-Printer-Attributes', resp);
                        res.writeHead(200, {
                            'Content-Type': 'application/ipp',
                            'Content-Length': resp.length
                        });
                        res.end(resp);

                        emit('job-accepted', { jobId, format: fmt, size: parsed.document.length });

                        await (async () => {
                            try {
                                if (fmt.includes('pdf')) {
                                    await printPdf(parsed.document, targetPrinter);
                                    emit('job-printed', { jobId, format: fmt, size: parsed.document.length });
                                } else {
                                    emit('job-skipped', { jobId, format: fmt, reason: 'unsupported format' });
                                }
                            } catch (e) {
                                emit('job-error', { jobId, error: e.message });
                            }
                        })();
                        return;
                    }

                    default: {
                        const resp = buildIppResponse({
                            requestId: parsed.requestId,
                            status: STATUS.CLIENT_NOT_FOUND,
                            attributes: { 'status-message': 'Unsupported operation' },
                            version: parsed.version
                        });
                      // logRawResponse('Get-Printer-Attributes', resp);
                        res.writeHead(200, {
                            'Content-Type': 'application/ipp',
                            'Content-Length': resp.length
                        });
                        return res.end(resp);
                    }
                }
            } catch (e) {
                console.error('[IPP] handler error:', e);
                res.writeHead(500);
                res.end();
            }
        });
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`[IPP] Listening on port ${port}, target printer: "${targetPrinter}", local IP: ${localIp}`);
        emit('server-started', { port, targetPrinter, localIp });
    });

    server.on('error', (err) => {
        console.error('[IPP] server error:', err.message);
        emit('server-error', { error: err.message });
    });

    return server;
}

module.exports = { startIppServer };