// src/lib/mdns.js
const os = require('os');
const { detectLocalIp } = require('./net');

const SERVICE_PORT = 631;
const PRINTER_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PRINTER_NAME = 'AirPrintWin';

const LOCAL_IP = detectLocalIp();
if (!LOCAL_IP) {
    throw new Error('[mDNS] Не удалось определить IPv4-адрес активного интерфейса');
}

const mdns = require('multicast-dns')({ interface: LOCAL_IP });

function normalizeHostname(raw) {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')   // подчёркивания и прочее → дефис
        .replace(/-+/g, '-')            // несколько дефисов → один
        .replace(/^-+|-+$/g, '')        // убрать дефисы по краям
        .slice(0, 60) || 'airprintwin';
}


const HOSTNAME = normalizeHostname(os.hostname());
const HOST_FQDN = `${HOSTNAME}.local.`;
const SERVICE_TYPE = '_ipp._tcp.local';
const SERVICE_INSTANCE = `${PRINTER_NAME}.${SERVICE_TYPE}`;
const SUBTYPE_UNIVERSAL = '_universal._sub._ipp._tcp.local';

function buildRecords(port) {
    const txt = [
        'txtvers=1',
        'qtotal=1',
        'rp=ipp/print',                              // ← синхронизировано с IPP
        `ty=${PRINTER_NAME}`,
        `product=(${PRINTER_NAME})`,
        `note=${PRINTER_NAME}`,
        'pdl=application/pdf,image/urf,image/jpeg,image/png,image/pwg-raster',
        'URF=W8,SRGB24,V1.4,RS300-600,DM1',
        'Color=F',                                    // ← согласовано с IPP
        'Duplex=F',
        `UUID=${PRINTER_UUID}`,                       // ← КРИТИЧНО для iOS 16+
        'TLS=none',
        `adminurl=http://${HOST_FQDN}:${port}/`,
        'priority=50',
    ].map((s) => Buffer.from(s));

    return [
        { name: SERVICE_TYPE, type: 'PTR', ttl: 120, data: SERVICE_INSTANCE },
        { name: SUBTYPE_UNIVERSAL, type: 'PTR', ttl: 120, data: SERVICE_INSTANCE },
        {
            name: SERVICE_INSTANCE,
            type: 'SRV', ttl: 120,
            data: { priority: 0, weight: 0, port, target: HOST_FQDN },
        },
        { name: SERVICE_INSTANCE, type: 'TXT', ttl: 120, data: txt },
        { name: HOST_FQDN, type: 'A', ttl: 120, data: LOCAL_IP },
    ];
}

function publishPrinter({ name = PRINTER_NAME, port = SERVICE_PORT } = {}) {
    const records = buildRecords(port);

    const respond = (reason) => {
        mdns.respond(records, () => {
            if (reason === 'initial' || reason === 'periodic') {
                console.log(`[mDNS] Responded (${reason})`);
            }
        });
    };

    respond('initial');
    const interval = setInterval(() => respond('periodic'), 60000);

    const onQuery = (query) => {

        const hasIpp = query.questions.some(
            (q) => q.name === SERVICE_TYPE || q.name === SUBTYPE_UNIVERSAL
        );
        const hasIpps = query.questions.some(
            (q) => q.name === '_ipps._tcp.local' || q.name === '_universal._sub._ipps._tcp.local'
        );

        const relevant =
            hasIpp ||
            query.questions.some(
                (q) => q.name === SERVICE_INSTANCE || q.name === HOST_FQDN
            );

        if (!relevant) return;

        if (hasIpps && !hasIpp) {
            return;
        }

        respond(`query: ${names}`);
    };
    mdns.on('query', onQuery);

    console.log(
        `[mDNS] Published "${name}" via multicast-dns on ${LOCAL_IP} (bound interface), hostname ${HOST_FQDN}`
    );

    return {
        stop() {
            clearInterval(interval);
            mdns.off('query', onQuery);
            mdns.destroy();
            console.log('[mDNS] Announcement stopped');
        }
    };
}

module.exports = { publishPrinter, SERVICE_PORT, PRINTER_UUID, PRINTER_NAME, HOSTNAME, HOST_FQDN };