// src/lib/net.js
const os = require('os');

/**
 * Возвращает IPv4-адрес активного не-loopback интерфейса.
 * Приоритет: Wi-Fi → Ethernet → любой не внутренний.
 * @returns {string|null}
 */
function detectLocalIp() {
    const interfaces = os.networkInterfaces();

    const candidates = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
            if (addr.family !== 'IPv4') continue;
            if (addr.internal) continue; // пропускаем 127.0.0.1
            candidates.push({ name, address: addr.address });
        }
    }
    console.log('[net] All IPv4 candidates:', candidates);

    if (candidates.length === 0) return null;

    // Приоритет 1: Wi-Fi
    const wifi = candidates.find((c) => /wi-?fi|wireless|беспровод/i.test(c.name));
    if (wifi) return wifi.address;

    // Приоритет 2: Ethernet
    const eth = candidates.find((c) => /ethernet|realtek|intel/i.test(c.name));
    if (eth) return eth.address;

    // Приоритет 3: любой первый
    return candidates[0].address;
}

module.exports = { detectLocalIp };