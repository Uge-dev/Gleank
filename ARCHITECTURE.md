# Gleank Architecture

## Frontend

```text
Frontend/src/
├── components/       Shared visual and route-protection components
├── context/          Authentication, saved-item, and cart application state
├── data/             Legacy demo data retained for unconverted future modules
├── lib/              Shared API transport and errors
├── pages/            Route-level screens
├── services/         Auth, seller, catalog, saved-item, and Used Market APIs
├── types/            Shared TypeScript domain models
└── utils/            Formatting and theme utilities
```

### Authentication

`AuthProvider` is the frontend source of truth for:

- current user
- seller store
- session loading state
- login
- registration
- logout
- session refresh
- role checks

`SavedProvider` synchronizes products, stores, services, and Used Market
bookmarks with the signed-in account rather than browser-only storage.

### API transport

All new backend calls use `src/lib/api.ts`. It:

- sends cookies with every request
- handles JSON and `FormData`
- normalizes API errors
- supports a configurable API base path

## Backend

```text
Backend/src/
├── config/           Environment configuration
├── db/               Database connection and schema initialization
├── lib/              IDs, sessions, errors, and serializers
├── middleware/       Auth, validation, uploads, and error handling
├── repositories/     Database access
├── routes/           HTTP route definitions
├── schemas/          Zod request validation
├── scripts/          Local data seeding
├── services/         Business logic
├── app.js            Express application
└── server.js         HTTP server lifecycle
```

Marketplace services cover:

- catalog search and public product details
- seller stores, products, services, inventory, and uploads
- account-scoped saved items
- Used Market submission, search, detail, status, and ownership evidence
- cleanup of replaced, deleted, or failed-request upload files

## Request flow

```text
React page
  → frontend service
  → shared API client
  → Express route
  → validation/auth middleware
  → business service
  → repository/database
  → serialized JSON response
```

## Security foundation

- bcrypt password hashing
- HTTP-only session cookies
- database-backed session revocation
- role authorization
- Zod input validation
- upload MIME and size validation
- Helmet security headers
- CORS configuration
- authentication rate limiting
- centralized safe error responses

## Existing workflow preservation

The existing cart, checkout, order, message, notification, and theme screens
remain available. Home, search, public product details, seller stores, saved
items, and the Used Market now share the backend database. A compatibility user
cache remains only for older UI checks and is never trusted for authorization.
