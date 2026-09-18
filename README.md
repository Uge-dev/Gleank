# Gleenc

Gleenc is a social-commerce marketplace built around one member account for
shopping, actual selling, dropshipping and digital marketing. Only administrators
use a separate control dashboard.

The current implementation milestone adds shared profile completion, seller-owned
product listings, prepaid checkout, seller-managed fulfillment, and buyer QR/code
delivery confirmation. Supplier-linked dropshipping and affiliate commission
tracking are planned next; onboarding captures interest without claiming those
transactions are already supported.

See [the commerce MVP implementation and rollout notes](docs/commerce-mvp.md) for
current behavior, configuration, test coverage and remaining work. Older sections
below describe historical integrations; rider, Local Market and Used Market
entry points have been retired in this milestone. Historical records remain intact.

This repository contains:

- `Frontend/` — React, TypeScript, React Router, and Vite.
- `Backend/` — Express API with SQLite locally and PostgreSQL support.
- `scripts/` — local setup and development startup.

## Quick start

Requirements:

- macOS, Linux, or Windows
- Node.js 24 or newer
- npm 11 or newer

From the `Gleenc` folder:

```bash
npm run setup
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Demo seller:

```text
Email: seller@gleenc.local
Password: Gleenc123!
```

See [SETUP.md](./SETUP.md) for the complete local-development guide and
[ARCHITECTURE.md](./ARCHITECTURE.md) for the project structure.
