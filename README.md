# AirPrintWin

AirPrint / IPP Everywhere сервер для Windows. Превращает любой Windows-принтер
в AirPrint-совместимый для iPhone, iPad, Mac — без покупки нового принтера.

## Возможности

- ✅ **AirPrint / IPP Everywhere** — нативная печать с iOS/macOS
- ✅ **mDNS / Bonjour** — автоматическое обнаружение в сети
- ✅ **Автоопределение возможностей принтера** — цвет, duplex, размер бумаги
  (через `Get-PrintConfiguration`, работает для USB-HP, Brother, Canon, Epson, PDF24)
- ✅ **PDF, URF, JPEG, PNG, PWG-Raster**
- ✅ **Простой UI** — выбор принтера, имя в сети, badge возможностей, лог
- ✅ **Валидация имени в сети** — 1-63 символа, без `\ / . " @`
- ✅ **Сохранение настроек** — `%APPDATA%\airprint-win\config.json`
- ✅ **Минимальные зависимости** — только Node.js

## Требования

- Windows 10/11 (для `Get-PrintConfiguration` — Windows 8+)
- [Node.js 18+](https://nodejs.org/) (LTS)
- Принтер, установленный в Windows

## Установка

### Из исходников (рекомендуется)

```bash
git clone https://github.com/crock-2024/airprint-win.git
cd airprint-win
npm install
npm start
```
## Сборка .exe (для разработчиков)

```bash
npm run dist
# Результат: dist/AirPrintWin-Setup-1.0.0.exe
```
```angular2html
⚠️ .exe не подписан — Windows SmartScreen может блокировать.
Используй npm start, если не доверяешь.
```
## Использование

- Запусти npm start

- Выбери принтер Windows в списке — под ним появятся badge возможностей
(Цвет: да/нет, Duplex: да/нет, Бумага: A4/Letter/…)

- Введи имя в сети (как увидит iPhone) — например, Home Printer
(1-63 символа, без \ / . " @)

- Нажми ▶ Запустить

- На iPhone: Настройки → Wi-Fi → (i) → Забыть сеть → Подключиться заново

- В любом приложении: Печать → выбери своё имя

Настройки сохраняются автоматически в %APPDATA%\airprint-win\config.json
и загружаются при следующем запуске.

## Решение проблем
### iPhone не видит принтер
1. Firewall: разреши порты 631 (TCP), 5353 (UDP)
```bash
New-NetFirewallRule -DisplayName "AirPrint IPP 631" -Direction Inbound -Protocol TCP -LocalPort 631 -Action Allow -Profile Private,Domain
New-NetFirewallRule -DisplayName "AirPrint mDNS 5353" -Direction Inbound -Protocol UDP -LocalPort 5353 -Action Allow -Profile Private,Domain
```
2. Профиль сети: должен быть «Частная», не «Общественная»
```bash
Get-NetConnectionProfile
# NetworkCategory: Private
```
3. Bonjour и AirPrint службы не должны конфликтовать:
```bash
Get-Service -Name "AirPrint", "Bonjour Service"
# AirPrint — должно быть Stopped
```
4. Переподключи iPhone к Wi-Fi (Забыть сеть → подключиться заново),
   подожди 30-60 секунд.

### Принтер «Offline»
- Открой в Safari на iPhone: http://<hostname>.local.:631/
- Должна открыться HTML-страница. Если не открывается — проверь firewall.
- Проверь, что printer-more-info в IPP-ответе указывает на тот же hostname, что mDNS.

### Не печатает
- Проверь, что принтер работает в Windows (Печать → Тестовая страница).
- Проверь, что имя в сети = часть SERVICE_INSTANCE в mDNS

### A4 vs Letter
- media-default в IPP = размер из Windows (Get-PrintConfiguration).
- iOS показывает свой default (A4 для России/Европы) — это баг iOS, не приложения.
- Если нужно Letter — выбери его в диалоге печати iPhone.

### Не работает Color: да на цветном принтере
- Проверь в Windows: Устройства и принтеры → принтер → Свойства → Цвет → Цветная печать включена.
- Проверь Get-PrintConfiguration:
```bash
Get-Printer -Name "HP Photosmart 7510 series" | Get-PrintConfiguration | Format-List Color, DuplexingMode, PaperSize
# Color: True
```
## Известные ограничения
- PDF — основной формат (URF/JPEG/PNG поддерживаются, но PDF предпочтительнее).

- A4 vs Letter — iOS показывает свой default (см. выше).

- IPv6 — не поддерживается (используется IPv4 mDNS).

- HTTPS / _ipps._tcp — не поддерживается (только _ipp._tcp).

- Автоопределение Duplex — работает не на всех драйверах (Get-PrintConfiguration).

- USB-принтеры — работают через Windows-очередь, не напрямую.

## Разработка
```bash
npm install
npm start        # запуск
npm run dist     # сборка .exe
```
## Структура проекта
```
src/
├── main/
│   ├── main.js          # Electron main process
│   ├── preload.js       # IPC bridge
│   ├── server.js        # AirPrintService (mDNS + IPP)
│   └── config.js        # config.json persistence
├── lib/
│   ├── ipp-parser.js    # IPP binary protocol
│   ├── ipp-server.js    # IPP HTTP server
│   ├── mdns.js          # mDNS/Bonjour advertisement
│   ├── net.js           # local IP detection
│   ├── printer.js       # Windows printing (pdf-to-printer)
│   └── printer-caps.js  # Get-PrintConfiguration detection
└── renderer/
    ├── index.html       # UI
    ├── renderer.js      # UI logic
    └── styles.css       # styles
```

## Лицензия
MIT — см. LICENSE.
