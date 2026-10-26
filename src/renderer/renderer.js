// src/renderer/renderer.js

const els = {
    select: document.getElementById('printerSelect'),
    displayName: document.getElementById('displayName'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    clearLogBtn: document.getElementById('clearLogBtn'),
    statusBadge: document.getElementById('statusBadge'),
    log: document.getElementById('log'),
    capsInfo: document.getElementById('capsInfo'),
    capsColor: document.getElementById('capsColor'),
    capsDuplex: document.getElementById('capsDuplex'),
    capsMedia: document.getElementById('capsMedia')
};

// --- Валидация имени в сети ---
function validateDisplayName(raw) {
    const name = String(raw || '').trim();

    if (name.length === 0) {
        return { ok: false, error: 'Имя не может быть пустым' };
    }
    if (name.length > 63) {
        return { ok: false, error: 'Имя не может быть длиннее 63 символов' };
    }
    if (/[\\/.\0@"\x00-\x1f]/.test(name)) {
        return { ok: false, error: 'Имя не может содержать \\ / . " @ или управляющие символы' };
    }
    if (name.startsWith(' ') || name.endsWith(' ')) {
        return { ok: false, error: 'Имя не может начинаться или заканчиваться пробелом' };
    }

    return { ok: true, name };
}

// --- Утилиты UI ---

function setStatus(kind, text) {
    els.statusBadge.className = `badge badge-${kind}`;
    els.statusBadge.textContent = text;
}

function log(message, kind = 'info') {
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-entry ${kind}`;
    const t = document.createElement('span');
    t.className = 'time';
    t.textContent = `[${time}]`;
    div.appendChild(t);
    div.appendChild(document.createTextNode(message));
    els.log.prepend(div);
    // ограничим журнал 500 записями
    while (els.log.childElementCount > 500) {
        els.log.lastElementChild.remove();
    }
}

function setRunning(running) {
    els.startBtn.disabled = running;
    els.stopBtn.disabled = !running;
    els.select.disabled = running;
    els.displayName.disabled = running;
}

// --- Отображение возможностей принтера ---
function renderCaps(caps) {
    if (!caps) {
        els.capsInfo.style.display = 'none';
        return;
    }

    els.capsInfo.style.display = 'flex';

    // Цвет
    els.capsColor.textContent = `Цвет: ${caps.color ? 'да' : 'нет'}`;
    els.capsColor.className = 'caps-badge ' + (caps.color ? 'ok' : 'off');

    // Duplex
    els.capsDuplex.textContent = `Duplex: ${caps.duplex ? 'да' : 'нет'}`;
    els.capsDuplex.className = 'caps-badge ' + (caps.duplex ? 'ok' : 'off');

    // Бумага
    const mediaMap = {
        'iso_a4_210x297mm': 'A4',
        'na_letter_8.5x11in': 'Letter',
        'iso_a5_148x210mm': 'A5',
        'iso_a6_105x148mm': 'A6',
        'iso_a3_297x420mm': 'A3',
        'na_legal_8.5x14in': 'Legal',
        'na_index-4x6_4x6in': '4×6"',
        'om_small-photo_100x150mm': '100×150',
    };
    const mediaName = mediaMap[caps.mediaDefault] || caps.mediaDefault;
    els.capsMedia.textContent = `Бумага: ${mediaName}`;
    els.capsMedia.className = 'caps-badge ' + (caps.detected ? 'ok' : 'warn');
}

async function refreshCaps() {
    const printer = els.select.value;
    if (!printer) {
        renderCaps(null);
        return;
    }

    els.capsColor.textContent = 'Цвет: …';
    els.capsDuplex.textContent = 'Duplex: …';
    els.capsMedia.textContent = 'Бумага: …';
    els.capsColor.className = 'caps-badge';
    els.capsDuplex.className = 'caps-badge';
    els.capsMedia.className = 'caps-badge';
    els.capsInfo.style.display = 'flex';

    try {
        const caps = await window.api.detectCaps(printer);
        renderCaps(caps);
        log(`Возможности: цвет=${caps.color ? 'да' : 'нет'}, duplex=${caps.duplex ? 'да' : 'нет'}, бумага=${caps.mediaDefault}`);
    } catch (e) {
        renderCaps(null);
        log(`Не удалось определить возможности: ${e.message}`, 'warn');
    }
}

// --- Загрузка принтеров ---

async function refreshPrinters() {
    els.select.innerHTML = '<option>Загрузка…</option>';
    els.select.disabled = true;
    try {
        const printers = await window.api.listPrinters();
        if (!printers.length) {
            els.select.innerHTML = '<option value="">— принтеры не найдены —</option>';
            log('Принтеры Windows не найдены', 'warn');
            return;
        }
        els.select.innerHTML = printers
            .map(
                (p) =>
                    `<option value="${escapeAttr(p.name)}"${p.isDefault ? ' selected' : ''}>${escapeHtml(
                        p.displayName
                    )}${p.isDefault ? ' (по умолчанию)' : ''}</option>`
            )
            .join('');
        log(`Загружено принтеров: ${printers.length}`);

        await applyConfig();
        await refreshCaps();

    } catch (e) {
        log(`Ошибка получения принтеров: ${e.message}`, 'err');
    } finally {
        els.select.disabled = false;
    }
}

// --- Загрузка настроек из config.json ---
async function applyConfig() {
    try {
        const cfg = await window.api.getConfig();
        if (cfg.displayName) {
            els.displayName.value = cfg.displayName;
        }
        if (cfg.printerName) {
            const exists = [...els.select.options].some((o) => o.value === cfg.printerName);
            if (exists) {
                els.select.value = cfg.printerName;
            }
        }
        log(`Настройки загружены: принтер="${cfg.printerName || '—'}", имя="${cfg.displayName}"`);
    } catch (e) {
        log(`Не удалось загрузить настройки: ${e.message}`, 'warn');
    }
}

// --- Сохранение текущих настроек ---
async function saveCurrentConfig() {
    try {
        await window.api.setConfig({
            displayName: els.displayName.value.trim(),
            printerName: els.select.value,
        });
    } catch (e) {
        log(`Не удалось сохранить настройки: ${e.message}`, 'warn');
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
}
function escapeAttr(s) {
    return escapeHtml(s);
}

// --- Действия ---

async function startServer() {
    const printer = els.select.value;
    if (!printer) {
        log('Не выбран принтер', 'warn');
        return;
    }

    const rawName = els.displayName.value;
    const validation = validateDisplayName(rawName);
    if (!validation.ok) {
        setStatus('error', '● Ошибка');
        log(`Некорректное имя в сети: ${validation.error}`, 'err');
        els.displayName.focus();
        return;
    }
    const displayName = validation.name;

    setStatus('starting', 'Запуск…');
    log(`Запуск: принтер="${printer}", имя в сети="${displayName}"`);

    await saveCurrentConfig();
    const res = await window.api.startServer({ printerName: printer, displayName });

    if (res.ok) {
        setStatus('running', '● Работает');
        setRunning(true);
        log(`Сервер запущен на порту ${res.port}`, 'ok');
        log(`С iPhone: Настройки → Принтеры → должен появиться «${displayName}»`, 'info');
    } else {
        setStatus('error', '● Ошибка');
        setRunning(false);
        log(`Не удалось запустить: ${res.error}`, 'err');
    }
}

async function stopServer() {
    await window.api.stopServer();
    setStatus('idle', 'Не запущен');
    setRunning(false);
    log('Сервер остановлен', 'warn');
}

// --- Подписка на события из main ---

window.api.onEvent((ev) => {
    switch (ev.type) {
        case 'server-started':
            log(`IPP слушает порт ${ev.port}, цель: ${ev.targetPrinter}`, 'ok');
            break;
        case 'server-error':
            log(`Ошибка сервера: ${ev.error}`, 'err');
            setStatus('error', '● Ошибка');
            setRunning(false);
            break;
        case 'request':
            log(`IPP запрос: op=${ev.op}, документ=${ev.docBytes} байт`);
            break;
        case 'job-accepted':
            log(`Задание #${ev.jobId} принято (${ev.format}, ${ev.size} байт)`, 'info');
            break;
        case 'job-printed':
            log(`✅ Задание #${ev.jobId} отправлено на печать`, 'ok');
            break;
        case 'job-skipped':
            log(`⚠ Задание #${ev.jobId} пропущено: ${ev.reason} (${ev.format})`, 'warn');
            break;
        case 'job-error':
            log(`❌ Задание #${ev.jobId} — ошибка: ${ev.error}`, 'err');
            break;
        default:
            log(`Событие: ${ev.type} ${JSON.stringify(ev)}`);
    }
});

// --- Инициализация ---

els.startBtn.addEventListener('click', startServer);
els.stopBtn.addEventListener('click', stopServer);
els.refreshBtn.addEventListener('click', refreshPrinters);
els.clearLogBtn.addEventListener('click', () => {
    els.log.innerHTML = '';
});
els.select.addEventListener('change', async () => {
    await refreshCaps();
    await saveCurrentConfig();
});
els.displayName.addEventListener('blur', saveCurrentConfig);

setRunning(false);
refreshPrinters();