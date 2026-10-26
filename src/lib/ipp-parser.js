// src/lib/ipp-parser.js
const OP = {
    PRINT_JOB: 0x0002,
    VALIDATE_JOB: 0x0004,
    CREATE_JOB: 0x0005,
    SEND_DOCUMENT: 0x0006,
    CANCEL_JOB: 0x0008,
    GET_JOB_ATTRIBUTES: 0x0009,
    GET_JOBS: 0x000a,
    GET_PRINTER_ATTRIBUTES: 0x000b
};

const STATUS = {
    OK: 0x0000,
    CLIENT_BAD_REQUEST: 0x0400,
    CLIENT_NOT_FOUND: 0x0406,
    SERVER_INTERNAL_ERROR: 0x0500
};

function parseIppRequest(buf) {
    if (buf.length < 8) throw new Error('IPP: слишком короткий пакет');

    const version = { major: buf.readUInt8(0), minor: buf.readUInt8(1) };
    const op = buf.readUInt16BE(2);
    const requestId = buf.readUInt32BE(4);

    let offset = 8;
    const attributes = {};

    while (offset < buf.length) {
        const tag = buf.readUInt8(offset);
        offset += 1;

        if (tag === 0x03) break;
        if (tag <= 0x0f) continue;

        if (offset + 2 > buf.length) break;
        const nameLen = buf.readUInt16BE(offset);
        offset += 2;
        const name = buf.slice(offset, offset + nameLen).toString('utf8');
        offset += nameLen;

        if (offset + 2 > buf.length) break;
        const valueLen = buf.readUInt16BE(offset);
        offset += 2;

        let value;
        if (tag === 0x21) {
            value =
                valueLen === 1
                    ? buf.readUInt8(offset)
                    : valueLen === 2
                        ? buf.readInt16BE(offset)
                        : buf.readInt32BE(offset);
        } else if (tag === 0x22) {
            value = buf.readUInt8(offset) === 1;
        } else if (tag === 0x23) {
            value = buf.readInt32BE(offset);
        } else if (tag === 0x41 || tag === 0x42 || tag === 0x44 || tag === 0x45 || tag === 0x47 || tag === 0x48 || tag === 0x49) {
            value = buf.slice(offset, offset + valueLen).toString('utf8');
        } else {
            value = buf.slice(offset, offset + valueLen);
        }
        offset += valueLen;

        if (name) {
            // если атрибут уже есть — превращаем в массив (несколько значений)
            if (Object.prototype.hasOwnProperty.call(attributes, name)) {
                if (!Array.isArray(attributes[name])) {
                    attributes[name] = [attributes[name]];
                }
                attributes[name].push(value);
            } else {
                attributes[name] = value;
            }
        }
    }

    const document = offset < buf.length ? buf.slice(offset) : null;
    return { version, op, requestId, attributes, document };
}

function buildIppResponse({
                              requestId,
                              status = STATUS.OK,
                              attributes = {},
                              version = { major: 1, minor: 1 }
                          }) {
    const parts = [];

    const attr = (tag, name, value, extra) => {
        const n = Buffer.from(name, 'utf8');
        let v;

        if (tag === 0x21) {
            // IPP integer ВСЕГДА 32-bit (RFC 8011 §3.1.5)
            v = Buffer.alloc(4);
            v.writeInt32BE(value);
        } else if (tag === 0x22) {
            v = Buffer.alloc(1);
            v.writeUInt8(value ? 1 : 0);
        } else if (tag === 0x23) {
            v = Buffer.alloc(4);
            v.writeInt32BE(value);
        } else if (tag === 0x31) {
            const d = new Date(value);
            v = Buffer.alloc(11);
            v.writeUInt16BE(d.getUTCFullYear(), 0);
            v.writeUInt8(d.getUTCMonth() + 1, 2);
            v.writeUInt8(d.getUTCDate(), 3);
            v.writeUInt8(d.getUTCHours(), 4);
            v.writeUInt8(d.getUTCMinutes(), 5);
            v.writeUInt8(d.getUTCSeconds(), 6);
            v.writeUInt8(0, 7);
            v.writeUInt8(0x2b, 8);
            v.writeUInt8(0, 9);
            v.writeUInt8(0, 10);
        } else if (tag === 0x32) {
            // resolution: 9 байт
            v = Buffer.alloc(9);
            v.writeInt32BE(value.crossFeed || 300, 0);
            v.writeInt32BE(value.feed || 300, 4);
            v.writeUInt8(value.units || 3, 8);
        } else if (tag === 0x33) {
            // rangeOfInteger: 8 байт
            v = Buffer.alloc(8);
            v.writeInt32BE(value.lower || 1, 0);
            v.writeInt32BE(value.upper || 99, 4);
        } else if (tag === 0x34) {
            // collection: пока не поддерживаем — пустая строка
            v = Buffer.alloc(0);
        } else {
            // строка: keyword, mimeMediaType, uri, text, name
            v = Buffer.from(String(value), 'utf8');
        }

        const head = Buffer.alloc(3);
        head.writeUInt8(tag, 0);
        head.writeUInt16BE(n.length, 1);
        const mid = Buffer.alloc(2);
        mid.writeUInt16BE(v.length, 0);
        parts.push(head, n, mid, v);
    };

    parts.push(Buffer.from([0x01]));
    attr(0x47, 'attributes-charset', 'utf-8');
    attr(0x48, 'attributes-natural-language', 'en-us');

    if (Object.keys(attributes).length) {
        parts.push(Buffer.from([0x04]));
        for (const [k, v] of Object.entries(attributes)) {
            if (Array.isArray(v)) {
                v.forEach((item, i) => {
                    const nm = i === 0 ? k : '';
                    if (typeof item === 'boolean') attr(0x22, nm, item);
                    else if (typeof item === 'number') attr(0x23, nm, item);
                    else if (item instanceof Date) attr(0x31, nm, item);
                    else if (typeof item === 'object' && item.tag) attr(item.tag, nm, item.value, item.extra);
                    else if (typeof item === 'string' && item.startsWith('urn:uuid:')) attr(0x45, nm, item);
                    else attr(0x49, nm, item); // mimeMediaType по умолчанию для строк в массиве
                });
            } else if (typeof v === 'boolean') {
                attr(0x22, k, v);
            } else if (typeof v === 'number') {
                attr(0x21, k, v);
            } else if (v instanceof Date) {
                attr(0x31, k, v);
            } else if (typeof v === 'object' && v !== null && v.tag) {
                attr(v.tag, k, v.value, v.extra);
            } else if (typeof v === 'string' && v.startsWith('urn:uuid:')) {
                attr(0x45, k, v);
            } else {
                attr(0x44, k, v); // keyword по умолчанию
            }
        }
    }

    parts.push(Buffer.from([0x03]));

    const body = Buffer.concat(parts);
    const header = Buffer.alloc(8);
    header.writeUInt8(version.major, 0);
    header.writeUInt8(version.minor, 1);
    header.writeUInt16BE(status, 2);
    header.writeUInt32BE(requestId, 4);

    return Buffer.concat([header, body]);
}

module.exports = { parseIppRequest, buildIppResponse, OP, STATUS };