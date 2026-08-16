# Local data — this computer only

Everything the app stores lives in **this `data/` folder**.  
Nothing here is uploaded to the cloud, an API, or another machine.

A **new copy** of the app (GitHub clone / zip) starts with an **empty database**:
no companies, no Excel imports. Only the default login exists (`admin` / `Admin123!`).
Demo data is optional: `npm run seed:demo`.

```
data/
├── database/app.db     SQLite database (created on first launch)
├── uploads/            Excel files you imported
├── avatars/            Account profile photos
├── samples/            Example Excel templates (safe to copy / delete)
├── secrets/            Optional GitHub token for in-app updates
└── tmp/                Temporary files during an update (safe to delete)
```

Open these folders from the app: **Account → Local data**.

Updates replace application code only. This `data/` folder is preserved.

```
data/
├── database/app.db     SQLite database (companies, cash flow, users, logs)
├── uploads/            Excel files you imported
├── avatars/            Account profile photos
├── samples/            Example Excel templates (safe to copy / delete)
├── secrets/            Optional GitHub token for in-app updates
└── tmp/                Temporary files during an update (safe to delete)
```

Open these folders from the app: **Account → Local data**.

Updates replace application code only. This `data/` folder is preserved.
