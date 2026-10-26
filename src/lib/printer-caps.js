// src/lib/printer-caps.js
// Автоопределение возможностей принтера через Win32 DeviceCapabilities
// https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-devicecapabilitiesw
const { execSync } = require('child_process');

// Win32 DeviceCapabilities constants
const DC_DUPLEX = 0x0001;
const DC_COLORDEVICE = 0x0008;
const DC_PAPERNAMES = 0x0010;

// IPP media keyword -> (width_mm, height_mm)
const PAPER_SIZES = {
    'A4': 'iso_a4_210x297mm',
    'A5': 'iso_a5_148x210mm',
    'A6': 'iso_a6_105x148mm',
    'A3': 'iso_a3_297x420mm',
    'Letter': 'na_letter_8.5x11in',
    'Legal': 'na_legal_8.5x14in',
    'Executive': 'na_executive_7.25x10.5in',
    '4x6': 'na_index-4x6_4x6in',
    '100x150': 'om_small-photo_100x150mm',
};

/**
 * Определяет возможности принтера.
 * @param {string} printerName — имя Windows-принтера
 * @returns {{color: boolean, duplex: boolean, mediaDefault: string, detected: boolean}}
 */
function detectCapabilities(printerName) {
    const caps = {
        color: false,
        duplex: false,
        mediaDefault: 'iso_a4_210x297mm',
        detected: false,
    };

    if (!printerName) {
        console.warn('[caps] No printer name, using defaults');
        return caps;
    }

    const safeName = String(printerName).replace(/'/g, "''");

    // Единственный источник правды: Get-PrintConfiguration (Windows 8+)
    // Возвращает Color, DuplexingMode, PaperSize за один вызов.
    try {
        const ps = `
                            $p = Get-Printer -Name '${safeName}' -ErrorAction Stop
                            $cfg = $p | Get-PrintConfiguration -ErrorAction Stop
                            @{
                                Color = [bool]$cfg.Color
                                Duplex = ($cfg.DuplexingMode -ne 'OneSided')
                                PaperSize = [string]$cfg.PaperSize
                            } | ConvertTo-Json -Compress
                            `;
        const out = runPowerShell(ps);
        const result = JSON.parse(out.trim());

        caps.color = result.Color === true;
        caps.duplex = result.Duplex === true;
        caps.detected = true;

        if (result.PaperSize && PAPER_SIZES[result.PaperSize]) {
            caps.mediaDefault = PAPER_SIZES[result.PaperSize];
        }

        console.log(
            `[caps] Config: color=${caps.color}, duplex=${caps.duplex}, paper=${result.PaperSize} -> ${caps.mediaDefault}`
        );
    } catch (e) {
        console.warn('[caps] Get-PrintConfiguration failed:', e.message);

        // Fallback по локали
        const locale = process.env.LANG || process.env.LC_ALL || Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
        caps.mediaDefault = locale.startsWith('en-US') || locale.startsWith('en-CA')
            ? 'na_letter_8.5x11in'
            : 'iso_a4_210x297mm';
        console.log(`[caps] Fallback by locale (${locale}): media=${caps.mediaDefault}`);
    }

    return caps;
}

// Запуск PowerShell-скрипта через -EncodedCommand (base64 UTF-16LE)
function runPowerShell(script) {
    // Отключаем progress-сообщения (иначе PowerShell пишет CLIXML в stderr)
    const fullScript = `$ProgressPreference = 'SilentlyContinue'\n${script}`;
    const encoded = Buffer.from(fullScript, 'utf16le').toString('base64');
    const out = execSync(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        {
            encoding: 'utf8',
            timeout: 8000,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],   // stderr отдельно
        }
    );
    return out;
}

module.exports = { detectCapabilities, PAPER_SIZES };