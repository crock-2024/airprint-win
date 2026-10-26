// src/renderer/renderer.js

const els = {
    select: document.getElementById('printerSelect'),
    displayName: document.getElementById('displayName'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    clearLogBtn: document.getElementById('clearLogBtn'),
    statusBadge: document.getElementById('statusBadge'),
    log: document.getElementById('log')
};

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
    } catch (e) {
        log(`Ошибка получения принтеров: ${e.message}`, 'err');
    } finally {
        els.select.disabled = false;
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
    const displayName = els.displayName.value.trim() || 'AirPrintWin';

    setStatus('starting', 'Запуск…');
    log(`Запуск: принтер="${printer}", имя в сети="${displayName}"`);

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

setRunning(false);
refreshPrinters();