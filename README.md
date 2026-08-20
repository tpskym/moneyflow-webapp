# MoneyFlow (локально)

Для удобной работы на ходу:

1. Установите зависимости (пока не требуется, проект без внешних библиотек).
2. Из корня проекта:

```bash
npm run dev
```

Сервер запустится на `http://127.0.0.1:4173`.

Что будет работать:
- Статика обслуживается самим dev-сервером.
- Изменения `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js` перезагружают страницу автоматически.

По желанию для публикации создайте архив:

```bash
Compress-Archive -Path index.html,styles.css,app.js,manifest.webmanifest,sw.js,package.json,dev-server.js -DestinationPath moneyflow-webapp.zip -Force
```
