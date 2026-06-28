# Gleank

Gleank is a campus marketplace for buyers, verified sellers, service providers,
used-item sellers, dispatch riders, and platform administrators.

This repository contains:

- `Frontend/` — React, TypeScript, React Router, and Vite.
- `Backend/` — Express REST API, SQLite persistence, authentication, uploads,
  stores, products, services, saved items, and Used Market listings.
- `scripts/` — one-command local setup and development startup.

Home, global search, product details, public stores, account-synced saved items,
and the Used Market all use the same backend database.

## Quick start

Requirements:

- macOS, Linux, or Windows
- Node.js 24 or newer
- npm 11 or newer

From the `Gleank` folder:

```bash
npm run setup
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Demo seller:

```text
Email: seller@gleank.local
Password: Gleank123!
```

See [SETUP.md](./SETUP.md) for the complete local-development guide and
[ARCHITECTURE.md](./ARCHITECTURE.md) for the project structure.
