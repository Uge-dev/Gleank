# Gleank Waitlist Landing Site

This is a **separate Gleank landing page project** with:

- React + Vite landing page
- Waitlist form: name, email, WhatsApp number, campus, and user type
- Express backend API
- MongoDB storage with Mongoose
- Admin login and dashboard to view waitlist entries
- CSV export for waitlist data
- Optional Tekagon Admin integration component

## Folder structure

```txt
gleank-waitlist-site
├── backend
├── frontend
└── tekagon-admin-integration
```

## 1. Setup backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Edit `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/gleank_waitlist
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
JWT_SECRET=change-this-to-a-long-random-secret
ADMIN_EMAIL=admin@gleank.com
ADMIN_PASSWORD=change-this-password
```

For MongoDB Atlas, replace `MONGODB_URI` with your Atlas connection string.

## 2. Setup frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Edit `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

Open:

```txt
http://localhost:5173
```

## 3. Admin dashboard

Open:

```txt
http://localhost:5173/admin-login
```

Login with the email and password from `backend/.env`:

```env
ADMIN_EMAIL=admin@gleank.com
ADMIN_PASSWORD=change-this-password
```

After login, open:

```txt
http://localhost:5173/admin
```

## 4. API endpoints

### Public waitlist

```http
POST /api/waitlist
```

Body:

```json
{
  "name": "Test User",
  "email": "test@example.com",
  "whatsapp": "08012345678",
  "campus": "FUPRE",
  "userType": "buyer"
}
```

### Admin login

```http
POST /api/admin/login
```

### Admin waitlist data

```http
GET /api/admin/waitlist
Authorization: Bearer <token>
```

### CSV export

```http
GET /api/admin/waitlist/export
Authorization: Bearer <token>
```

## 5. Tekagon Admin integration

The folder `tekagon-admin-integration` contains a reusable React component you can copy into Tekagon Admin. It calls the same backend admin API and displays waitlist entries.

## 6. Production deployment notes

Backend can be deployed to Render/Railway/Fly.io. Frontend can be deployed to Vercel/Netlify.

Set backend environment variables in production:

```env
PORT=5000
MONGODB_URI=your-mongodb-atlas-uri
FRONTEND_URL=https://your-landing-site-domain.com
CORS_ORIGINS=https://your-landing-site-domain.com,https://your-tekagon-admin-domain.com
JWT_SECRET=very-long-random-secret
ADMIN_EMAIL=your-admin-email
ADMIN_PASSWORD=strong-admin-password
```

Set frontend environment variable:

```env
VITE_API_URL=https://your-backend-domain.com/api
```
