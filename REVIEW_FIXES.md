# Gleank review fixes

This ZIP contains the corrected code after reviewing the uploaded project.

## Main fixes

1. Restored the real backend app boot process.
   - `Backend/src/server.js` now imports the existing `app` from `Backend/src/app.js`.
   - This fixes broken signup/login because `/api/auth/register` and `/api/auth/login` are now mounted again.

2. Added admin routes to the real backend app instead of starting a second admin-only Express server.
   - `Backend/src/app.js` now mounts `app.use("/api/admin", adminRoutes)` before the 404 handler.

3. Fixed admin backend data folder casing.
   - Admin routes import `../data/adminStore.js`.
   - The file now exists at `Backend/src/data/adminStore.js` instead of `Backend/src/Data/adminStore.js`.
   - This matters for Linux deployment platforms like Render.

4. Restored admin frontend routing.
   - `Frontend/src/App.tsx` now imports `AdminDashboard`.
   - `/admin/*` renders as a full standalone admin page without the buyer/seller navbar and cart drawer.

5. Fixed admin frontend API paths.
   - `Frontend/src/admin/adminApi.ts` now respects `VITE_API_URL=/api`.
   - Admin calls now go to `/api/admin/...`, not the broken `/api/api/admin/...`.

6. Cleaned frontend lint warnings.
   - Fixed hook dependency issues in `SubmitUsedProduct.tsx` and `UsedMessages.tsx`.

## Checks run

From `Frontend`:

```bash
npm run lint
npm run build
```

Both passed.

From `Backend`:

```bash
node --check` was run across backend source files
```

The backend JavaScript syntax check passed.

I could not fully run backend tests in this sandbox because `better-sqlite3` is a native module and this environment could not download/build its native binary. On your system, run with Node.js 24+ and a normal `npm install`, then run:

```bash
cd Backend
npm install
npm test
```

## Important local note

Signup may still send you to `/verify-email` after creating an account. That is expected because `AUTO_VERIFY_AUTH` is false in local development unless you set it. The verification page shows the development token/link locally.

For easier development, you can add this to `Backend/.env`:

```dotenv
AUTO_VERIFY_AUTH=true
```

Then restart the backend.
