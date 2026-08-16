# İştirak Nakit Akış Dashboard

Local web app: turns subsidiary Excel files into a dashboard; exports PPTX / PDF / Excel.  
**All data stays on this computer** — no external API, telemetry, or cloud.

## End user (not a developer)

1. Install [Node.js LTS](https://nodejs.org) (once).  
2. Copy this folder to the computer.  
3. **One file:** `Start.bat` (Windows) or `Start.command` (Mac) → double-click.  
4. Double-click the Desktop shortcut → [http://127.0.0.1:8787](http://127.0.0.1:8787)

Details: **`SETUP.txt`** · First login: `admin` / `Admin123!`  
A GitHub clone starts **empty** (no companies). Your existing `data/` folder is never overwritten by an update.

In-app updates: **Account → Güncelle**. The GitHub repo is public, so users do not need a token. `data/` is never overwritten.

## Folder map

```
.
├── Start.bat / Start.command   Launch the app (double-click)
├── SETUP.txt                   Setup for non-developers
├── data/                       ★ ALL user data (this PC only)
│   ├── database/app.db         SQLite: companies, cash flow, users, logs
│   ├── uploads/                Imported Excel copies
│   ├── avatars/                Profile photos
│   ├── samples/                Example Excel templates
│   ├── secrets/                Optional GitHub token for updates
│   └── tmp/                    Temporary update files
├── templates/                  PPTX layout references (not user data)
├── src/                        Frontend (React)
├── server/                     Backend (Express + SQLite)
├── scripts/                    Start / demo / sample helpers
├── dist/                       Built frontend (generated)
└── dist-server/                Built backend (generated)
```

In the app: **Account → Local data** shows these paths and can open the folders.

## Developer

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run build && npm start   # production: http://127.0.0.1:8787
```

## Demo data (client presentation)

Loads / removes a high-value sample holding + 4 subsidiaries and 2026 cash flow:

```bash
npm run seed:demo    # Nova Teknoloji Holding + subsidiaries
npm run seed:clear   # Deletes demo companies only
```

- `seed:demo` clears any previous demo first, then re-adds it.
- `seed:clear` only deletes; real (non-demo) companies are untouched.
- Demo subsidiary names start with `[DEMO]`; parent: **Nova Teknoloji Holding A.Ş.**
- Login stays: `admin` / `Admin123!`

## Usage flow

1. **Companies** — Parent holding + subsidiaries and profiles.  
2. **Excel upload** — Pick subsidiary + year/month, upload `.xlsx`.  
3. **Dashboard** — Period KPIs and charts.  
4. **Report** — Download PPTX / PDF / Excel.  
5. **Activity logs** — Who did what, when.  
6. **Account** — Name, email, photo, updates, **local data paths**.

## Data location

| Path | Contents |
|------|----------|
| `data/database/app.db` | SQLite database |
| `data/uploads/` | Imported Excel files |
| `data/avatars/` | Profile photos |
| `data/samples/` | Example templates |
| `data/secrets/` | Optional update token |

The server binds to `127.0.0.1` only. See `data/README.md`.

## Excel rules

- Source sheet: **NAKİT AKIŞ-Haftalık**
- Row codes: `F-A.01`, `F-B.01`, … (categories A–J)

## Stack

React + Vite · Express · SQLite · ExcelJS · Recharts · PptxGenJS · PDFKit
