# AirPrintWin

AirPrint / IPP Everywhere сервер для Windows. Превращает любой Windows-принтер
в AirPrint-совместимый для iPhone, iPad, Mac — без покупки нового принтера.

## Возможности

- ✅ **AirPrint / IPP Everywhere** — нативная печать с iOS/macOS
- ✅ **mDNS / Bonjour** — автоматическое обнаружение в сети
- ✅ **PDF, URF, JPEG, PNG, PWG-Raster**
- ✅ **Простой UI** — выбор принтера, имя в сети, лог
- ✅ **Минимальные зависимости** — только Node.js

## Требования

- Windows 10/11
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
npm run dist
#### Результат: dist/AirPrintBridge-Setup.exe
````
⚠️ .exe не подписан — Windows SmartScreen может блокировать.
Используй npm start, если не доверяешь.
````
## Лицензия MIT
