# Backend (Express)

Local HTTP server. Binds to `127.0.0.1` only.

| File | Role |
|------|------|
| `index.ts` | App entry, static files in production |
| `db.ts` | SQLite path + schema (`data/database/app.db`) |
| `routes.ts` | REST API |
| `auth.ts` / `authRoutes.ts` | Login, sessions, profile |
| `importService.ts` / `excelParser.ts` | Excel import |
| `analytics.ts` / `periodReport.ts` | Dashboard numbers |
| `pptxExport.ts` / `pdfExport.ts` / `excelExport.ts` | Reports |
| `updater.ts` | In-app update from GitHub |

User data is **not** stored here — see `data/`.
