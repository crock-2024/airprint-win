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

    const safeName = String(printerName).replace(/'/g, "''"); // escape single quotes for PS

    // --- 1. Color + Duplex ---
    try {
        const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinSpool {
    [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern int DeviceCapabilities(string pDevice, string pPort, short fwCapability, IntPtr pOutput, IntPtr pDevMode);
}
"@
$color  = [WinSpool]::DeviceCapabilities('${safeName}', $null, ${DC_COLORDEVICE}, [IntPtr]::Zero, [IntPtr]::Zero)
$duplex = [WinSpool]::DeviceCapabilities('${safeName}', $null, ${DC_DUPLEX}, [IntPtr]::Zero, [IntPtr]::Zero)
@{ Color = $color; Duplex = $duplex } | ConvertTo-Json -Compress
`;
        const out = runPowerShell(psScript);
        const result = JSON.parse(out.trim());
        caps.color = result.Color === 1;
        caps.duplex = result.Duplex === 1;
        caps.detected = true;
        console.log(`[caps] Win32: color=${caps.color}, duplex=${caps.duplex}`);
    } catch (e) {
        console.warn('[caps] Win32 detection failed:', e.message);
    }

    // --- 2. mediaDefault ---
    try {
        const psScript = `
$p = Get-Printer -Name '${safeName}' -ErrorAction Stop
$cfg = $p | Get-PrintConfiguration -ErrorAction Stop
$cfg.PaperSize
`;
        const paperSize = runPowerShell(psScript).trim();

        if (paperSize && PAPER_SIZES[paperSize]) {
            caps.mediaDefault = PAPER_SIZES[paperSize];
            console.log(`[caps] PaperSize="${paperSize}" -> ${caps.mediaDefault}`);
        } else if (paperSize) {
            console.log(`[caps] Unknown PaperSize "${paperSize}", keeping default`);
        }
    } catch (e) {
        console.warn('[caps] PaperSize detection failed:', e.message);
    }

    // --- 3. Fallback ---
    if (!caps.detected) {
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