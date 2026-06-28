# Gleank Local Development Setup

This guide prepares the frontend, backend, database, authentication, store
management, product management, service management, and local image uploads.

## 1. Requirements

Install:

- Node.js 24 or newer
- npm 11 or newer
- Visual Studio Code
- Git

Confirm the versions:

```bash
node -v
npm -v
git --version
```

## 2. Open the correct folder

In Visual Studio Code, choose **File → Open Folder** and open:

```text
/Users/apple/Documents/Gleank
```

Do not open only `Frontend` when you need to run the complete application.

## 3. First-time setup

Open the VS Code terminal in the root `Gleank` folder and run:

```bash
npm run setup
```

The setup command:

1. Creates `Backend/.env` with a random local authentication secret.
2. Creates `Frontend/.env.local`.
3. Installs backend dependencies.
4. Installs frontend dependencies.
5. Creates the SQLite database automatically.
6. Creates a local demo seller account.

The generated `.env`, database files, uploaded images, and `node_modules`
folders are excluded from Git.

## 4. Run frontend and backend together

```bash
npm run dev
```

Local services:

- Frontend: `http://localhost:5173`
- Backend health check: `http://localhost:4000/api/health`
- Uploaded images: `http://localhost:4000/uploads/<filename>`

Stop both services with `Control + C`.

If port `5173` is already in use, stop the old Vite terminal before running the
command again.

## 5. Demo seller account

Use this account to test the seller workflow:

```text
Email: seller@gleank.local
Password: Gleank123!
```

The demo account is created only for local development.

You can also create new buyer and seller accounts from `/signup`.

## 6. Environment configuration

### Backend

`Backend/.env` is generated automatically:

```dotenv
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:5173
DATABASE_PATH=./data/gleank.sqlite
UPLOADS_PATH=./uploads
JWT_SECRET=<randomly-generated-secret>
SESSION_DAYS=7
PASSWORD_RESET_MINUTES=30
AUTO_APPROVE_USED_LISTINGS=true
MAX_UPLOAD_MB=5
```

Important:

- Never commit `Backend/.env`.
- Use a different strong `JWT_SECRET` in production.
- Set `NODE_ENV=production` in production.
- The production frontend origin must replace `FRONTEND_URL`.

### Frontend

`Frontend/.env.local`:

```dotenv
VITE_API_URL=/api
```

Vite proxies `/api` and `/uploads` to the backend during local development.

## 7. Database

The local database is:

```text
Backend/data/gleank.sqlite
```

It is created automatically when the backend starts. Current tables:

- `users`
- `sessions`
- `password_reset_tokens`
- `stores`
- `products`
- `services`
- `used_listings`
- `saved_items`

To reset local development data:

1. Stop the application.
2. Make a backup if the data matters.
3. Delete `Backend/data/gleank.sqlite`.
4. Run:

```bash
npm --prefix Backend run seed
```

Do not delete the database while the backend is running.

## 8. Authentication behavior

Authentication is now server-based:

- Passwords are hashed using bcrypt.
- The browser receives an HTTP-only session cookie.
- Passwords and session tokens are not stored in `localStorage`.
- Sessions are validated against the database.
- Buyer, seller, and admin roles are supported.
- Seller routes reject buyer accounts.
- Logout deletes the server session and clears the cookie.
- Password-reset tokens are hashed, expire after 30 minutes by default, and
  can only be used once.
- Local development displays the recovery step immediately after a valid
  email request. Production should deliver the same token through email.

The frontend keeps a small compatibility cache of the current user so older UI
components continue to behave correctly. That cache is not trusted for backend
authorization.

## 9. Seller workflow

Seller accounts can:

- Open `/dashboard`.
- Edit the public store profile.
- Upload a logo and cover image.
- Create products.
- Edit products.
- Set product stock.
- Publish, draft, or mark products out of stock.
- Delete products.
- Create and edit services.
- Set service duration.
- Publish, draft, or pause services.
- View the database-backed public store.

All authenticated accounts can:

- Save products, stores, services, and Used Market listings.
- Open the same saved collection on another signed-in device.
- Submit a used item with images and ownership proof.
- Mark their own active Used Market listing as sold or list it again.

Marketplace discovery now reads from the same database on Home, Search,
product details, public stores, Saved Items, and the Used Market.

Supported image types:

- JPEG
- PNG
- WebP
- GIF

Limits:

- Maximum 5 MB per image by default.
- Maximum 6 images per product or service.
- Store profile accepts one logo and one cover image per update.
- Used items accept up to 6 public images, one ownership proof image, and one
  optional receipt image.
- Replaced, deleted, and failed-request uploads are cleaned from local storage.

`AUTO_APPROVE_USED_LISTINGS=true` is intended only for local development. Set
it to `false` in production so new submissions remain pending until reviewed.

## 10. Quality checks

Run all backend tests:

```bash
npm test
```

Build the frontend:

```bash
npm run build
```

Run only backend tests:

```bash
npm --prefix Backend test
```

Run only the frontend:

```bash
npm --prefix Frontend run dev
```

Run only the backend:

```bash
npm --prefix Backend run dev
```

## 11. VS Code workflow

Recommended terminal layout:

- Terminal 1: `npm run dev`
- Terminal 2: tests, builds, and Git commands

Before committing:

```bash
npm test
npm run build
git status
```

Then:

```bash
git add .
git commit -m "Describe the completed change"
git push
```

## 12. Production requirements later

Before production deployment:

- Replace local SQLite with managed PostgreSQL.
- Move uploads to object storage such as Cloudinary, S3, or Supabase Storage.
- Add email verification and password-reset delivery.
- Add CSRF protection if the frontend/backend deployment topology requires it.
- Configure secure HTTPS cookies.
- Add a production reverse proxy.
- Configure backup and database migration automation.
- Add monitoring, structured logs, and error reporting.
- Add payment gateway keys only through deployment secrets.
- Add admin approval, order, payment, delivery, dispute, and payout modules.

The current architecture separates routes, services, repositories, schemas,
middleware, and frontend API services so these production upgrades can be added
without rebuilding the application from scratch.
