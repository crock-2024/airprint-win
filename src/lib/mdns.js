// src/lib/mdns.js
const os = require('os');
const { detectLocalIp } = require('./net');

const SERVICE_PORT = 631;
const crypto = require('crypto');
const PRINTER_NAME = 'AirPrintWin';

// UUID = детерминированный хэш от displayName (RFC 4122 v5-подобный)
// Разные имена → разные UUID → iOS воспринимает как новый принтер
function uuidFromName(name) {
    const hash = crypto.createHash('sha1').update(`airprintwin:${name}`).digest('hex');
    // Формат UUID v5: xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        '5' + hash.slice(13, 16),
        ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
        hash.slice(20, 32),
    ].join('-');
}

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
//const SERVICE_INSTANCE = `${PRINTER_NAME}.${SERVICE_TYPE}`;
const SUBTYPE_UNIVERSAL = '_universal._sub._ipp._tcp.local';

function buildRecords(port, instance, displayName) {
    const uuid = uuidFromName(displayName);
    const txt = [
        'txtvers=1',
        'qtotal=1',
        'rp=ipp/print',
        `ty=${displayName}`,
        `product=(${displayName})`,
        `note=${displayName}`,
        `UUID=${uuid}`,
        'TLS=none',
        `adminurl=http://${HOST_FQDN}:${port}/`,
        'priority=50',
        'pdl=application/pdf,image/urf,image/jpeg,image/png,image/pwg-raster',
        'URF=W8,SRGB24,V1.4,RS300-600,DM1',
        'Color=F',        // пока фиксировано
        'Duplex=F',
    ].map((s) => Buffer.from(s));

    return [
        { name: SERVICE_TYPE, type: 'PTR', ttl: 120, data: instance },
        { name: SUBTYPE_UNIVERSAL, type: 'PTR', ttl: 120, data: instance },
        { name: instance, type: 'SRV', ttl: 120, data: { priority: 0, weight: 0, port, target: HOST_FQDN } },
        { name: instance, type: 'TXT', ttl: 120, data: txt },
        { name: HOST_FQDN, type: 'A', ttl: 120, data: LOCAL_IP },
    ];
}

function publishPrinter({ name = PRINTER_NAME, port = SERVICE_PORT } = {}) {
    const instance = `${name}.${SERVICE_TYPE}`;     // ← вычисляется из name
    const records = buildRecords(port, instance, name);

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
                (q) => q.name === instance || q.name === HOST_FQDN   // ← instance, не SERVICE_INSTANCE
            );

        if (!relevant) return;

        if (hasIpps && !hasIpp) {
            return;
        }

        respond('query');
    };
    mdns.on('query', onQuery);

    console.log(`[mDNS] Published "${name}" via multicast-dns on ${LOCAL_IP} (bound interface), hostname ${HOST_FQDN}`);

    return {
        stop() {
            clearInterval(interval);
            mdns.off('query', onQuery);
            mdns.destroy();
            console.log('[mDNS] Announcement stopped');
        }
    };
}

module.exports = { publishPrinter, SERVICE_PORT, PRINTER_NAME, HOSTNAME, HOST_FQDN, uuidFromName };