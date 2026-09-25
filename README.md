# Afrigo Backend

The API behind Afrigo: the public web app, the iOS and Android apps, and the Afrigo Admin console all talk to this one service. It is written in plain Node.js (Express and TypeScript), stores everything in PostgreSQL, and is designed to run on Render.

## Status

| Area | State |
| --- | --- |
| Authentication | Built and tested: email and password, Google sign in, refresh token rotation, email verification, password reset, lockout, session management |
| Members | Built and tested: profile, trade role selection, account deletion |
| Admin: members | Built and tested: search, filter, suspend, reactivate, sign out everywhere, verify email, change role |
| Admin: staff and audit | Built and tested: invite staff, change or revoke roles, audit log |
| Trade, payments, logistics, notifications | Planned, see [Roadmap](#roadmap) |

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 20+ | Long term support, native `fetch`, `--env-file` |
| HTTP | Express 5 | Familiar, stable, async errors handled natively |
| Language | TypeScript (ES modules) | Type safety across routes, services and the database |
| Database | PostgreSQL 17 | Relational data for trades, payments and audit |
| ORM | Drizzle | SQL first, fully typed, generated migrations |
| Validation | Zod | One schema validates input and produces field level errors |
| Tokens | jose (HS256 JWT) | Small, standards compliant, no native bindings |
| Passwords | Node `scrypt` | Built in, memory hard, no native dependency |
| Logging | pino | Structured JSON logs with request ids |
| Security | helmet, cors, express-rate-limit | Secure headers, origin allow list, brute force protection |
| Tests | Vitest and Supertest | Real HTTP requests against a real Postgres test database |
| Hosting | Render (web service and managed Postgres) | One `render.yaml` provisions everything |

## Project structure

```
.
├── drizzle/                 Generated SQL migrations (commit these)
├── src/
│   ├── app.ts               Express app: middleware, routers, error handling
│   ├── server.ts            Starts the HTTP server, graceful shutdown
│   ├── config/env.ts        Validated environment variables
│   ├── db/
│   │   ├── schema.ts        Tables and enums
│   │   ├── client.ts        Postgres connection and Drizzle instance
│   │   ├── migrate.ts       Applies migrations
│   │   └── seed-admin.ts    Creates the first super administrator
│   ├── lib/                 Shared helpers: crypto, JWT, mailer, audit, roles, errors
│   ├── middleware/          Authentication, rate limits, error handler
│   └── modules/
│       ├── auth/            Registration, sign in, tokens, verification, passwords
│       ├── users/           Member profile and admin member management
│       ├── staff/           Staff invites, roles and the audit log
│       └── health/          Liveness and readiness checks
├── test/                    End to end tests
├── render.yaml              Render blueprint
└── docker-compose.yml       Optional local Postgres
```

Each module keeps the same shape: `*.schemas.ts` (Zod input), `*.service.ts` (business logic and queries) and `*.routes.ts` (HTTP only).

## Getting started

### Prerequisites

- Node.js 20 or later
- PostgreSQL 17 running locally. On macOS: `brew install postgresql@17 && brew services start postgresql@17`. Or run `docker compose up -d`.

### Setup

```bash
npm install
cp .env.example .env
createdb afrigo
createdb afrigo_test
npm run db:migrate
npm run db:seed:admin
npm run dev
```

Before running `db:seed:admin`, fill in `DATABASE_URL`, `JWT_ACCESS_SECRET` and the three `SEED_ADMIN_*` values in `.env`. Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The API runs on http://localhost:4000. Check it with http://localhost:4000/api/v1/health/ready.

### Tests

```bash
npm test
```

Tests reset and migrate the `afrigo_test` database before running. Point them elsewhere with `TEST_DATABASE_URL`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled API |
| `npm run typecheck` | Type check without emitting |
| `npm test` | Run the test suite |
| `npm run db:generate` | Create a new migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (development) |
| `npm run db:seed:admin` | Create or reset the first super administrator |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run start:render` | Apply migrations then start (used by Render) |

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string. Render fills this in automatically |
| `JWT_ACCESS_SECRET` | Yes | Signs access tokens. At least 32 random characters. Render generates it |
| `NODE_ENV` | No | `development`, `test` or `production` |
| `PORT` | No | Defaults to 4000. Render sets its own |
| `LOG_LEVEL` | No | `info` in production, `debug` locally |
| `DATABASE_SSL` | No | Force SSL on or off. SSL is enabled automatically for Render external URLs |
| `DATABASE_POOL_SIZE` | No | Connections per instance, default 10 |
| `ACCESS_TOKEN_TTL_MINUTES` | No | Access token lifetime, default 15 |
| `REFRESH_TOKEN_TTL_DAYS` | No | Refresh token lifetime, default 30 |
| `CORS_ORIGINS` | Production | Comma separated browser origins, for example the web app and admin console URLs |
| `WEB_APP_URL` | Production | Used in verification and reset links for members |
| `ADMIN_APP_URL` | Production | Used in staff invite and staff reset links |
| `EMAIL_FROM` | No | Sender shown on emails |
| `RESEND_API_KEY` | Production | Sends transactional email. Without it, emails are written to the log in development |
| `GOOGLE_CLIENT_IDS` | For Google sign in | Comma separated OAuth client ids for web, iOS and Android |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | Once | Used by `db:seed:admin`. Password must be at least 12 characters |
| `PAYSTACK_SECRET_KEY`, `S3_*`, `FIREBASE_*`, `DHL_API_KEY`, `REDIS_URL`, `SENTRY_DSN` | Later | Reserved for the modules in the roadmap |

## Authentication

### How it works

1. A client signs in and receives an **access token** (JWT, 15 minutes) and a **refresh token** (random, 30 days).
2. Every request sends `Authorization: Bearer <accessToken>`.
3. When the access token expires, the client calls `POST /auth/refresh` with the refresh token and receives a new pair. The old refresh token stops working immediately.
4. If an old refresh token is ever used again, the whole session family is revoked. This detects stolen tokens.

Access tokens are checked against the database on every request, so suspending an account, changing a password, revoking a session or changing a staff role takes effect at once rather than when the token expires.

### Security measures

- Passwords hashed with scrypt and a unique salt. Minimum 8 characters with a letter and a number.
- Five wrong passwords lock the account for 15 minutes.
- Sign in failures use one message whether or not the email exists, and take the same time.
- Refresh tokens, verification links and reset links are stored only as SHA-256 hashes, are single use and expire.
- Rate limits: 300 requests a minute per IP overall, 20 sign in attempts per 10 minutes, 5 sensitive actions (password reset, resend verification, change password, delete account) per 15 minutes.
- Password reset and sign out everywhere revoke every session.
- Every sign in, failure, password change, role change and admin action is written to `audit_events` with IP and user agent.
- Secure headers via helmet, a strict CORS allow list, and a 1 MB request body limit.

### Client headers

| Header | Values | Purpose |
| --- | --- | --- |
| `Authorization` | `Bearer <accessToken>` | Authenticated requests |
| `X-Client-Platform` | `web`, `ios`, `android`, `admin` | Records which app a member uses, powering web versus mobile statistics |
| `X-App-Version` | `2.5.0` | Records the installed mobile app version |

The admin console must sign in with `"platform": "admin"`. Members without a staff role are refused there.

### Roles

Members choose one trade role: `Buyer`, `Seller` or `Exporter`.

Staff roles and what they can do:

| Staff role | Capabilities |
| --- | --- |
| `support_agent` | cases, members (read), inbox, analytics |
| `dispute_officer` | cases, dispute decisions, members (read), analytics |
| `finance_operator` | finance, payouts, refunds, members (read), analytics |
| `risk_officer` | verification, compliance, member management, marketplace moderation, analytics |
| `admin` | everything except finance execution and staff management |
| `super_admin` | everything |

These match the capabilities used by Afrigo Admin, and are returned on the user object as `capabilities`.

## API reference

Base URL: `/api/v1`. All bodies are JSON.

### Errors

Every error has the same shape:

```json
{
  "error": { "code": "VALIDATION_FAILED", "message": "Some fields are missing or invalid.", "details": [{ "field": "password", "message": "Include at least one number." }] },
  "requestId": "0b6c2f9e-..."
}
```

Clients should branch on `code` and can show `message` directly to users.

### Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health/live` | None | Process is running |
| GET | `/health/ready` | None | Database is reachable. Used by Render |

### Auth

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | None | `firstName, lastName, email, password, phone?, country?, platform?` | `201 { user, tokens }` and sends a verification email |
| POST | `/auth/login` | None | `email, password, platform?` | `{ user, tokens }` |
| POST | `/auth/google` | None | `idToken, platform?` | `{ user, tokens }` |
| POST | `/auth/refresh` | None | `refreshToken` | `{ user, tokens }` |
| POST | `/auth/logout` | None | `refreshToken` | `204` |
| POST | `/auth/logout-all` | Member | | `204`, every device signed out |
| GET | `/auth/me` | Member | | `{ user }` |
| POST | `/auth/email/verify` | None | `token` | `{ user }` |
| POST | `/auth/email/resend` | Member | | `202` |
| POST | `/auth/password/forgot` | None | `email` | `202` always |
| POST | `/auth/password/reset` | None | `token, password` | `204`, also accepts staff invite tokens |
| POST | `/auth/password/change` | Member | `currentPassword?, newPassword` | `204`, other devices signed out |
| GET | `/auth/sessions` | Member | | `{ items }` with the current session marked |
| DELETE | `/auth/sessions/:id` | Member | | `204` |

`tokens` looks like:

```json
{ "accessToken": "eyJ...", "accessTokenExpiresIn": 900, "refreshToken": "q3V...", "refreshTokenExpiresAt": "2026-10-25T11:40:43.774Z", "tokenType": "Bearer" }
```

Email links point to `WEB_APP_URL/verify-email?token=...` and `WEB_APP_URL/reset-password?token=...`. Staff links point to `ADMIN_APP_URL/reset-password?token=...`. The web app and admin console need those two pages to post the token back.

### Members

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| PATCH | `/users/me` | Member | any of `firstName, lastName, phone, country, avatarUrl` | `{ user }` |
| PUT | `/users/me/role` | Member | `role` | `{ user }`. The role can be chosen once |
| DELETE | `/users/me` | Member | `password?, confirm: "DELETE"` | `204`. Anonymises the account, as required by the App Store and Google Play |

### Admin

| Method | Path | Capability | Body or query | Returns |
| --- | --- | --- | --- | --- |
| GET | `/admin/users` | `users:read` | `q, role, country, status, platform, verified, page, pageSize` | Paged members |
| GET | `/admin/users/:id` | `users:read` | | `{ user, sessions }` |
| POST | `/admin/users/:id/actions` | `users:manage` | `{ action: "suspend", reason }`, `reactivate`, `revoke-sessions`, `verify-email`, `{ action: "set-role", role }` | `{ user, sessions }` |
| GET | `/admin/staff` | `staff:manage` | | `{ items }` |
| POST | `/admin/staff` | `staff:manage` | `email, firstName, lastName, role` | `201 { staff }`, emails an invite |
| PATCH | `/admin/staff/:id` | `staff:manage` | `role` (or `null` to revoke) | `{ staff }` |
| GET | `/admin/audit` | `staff:manage` | `action?, page, pageSize` | Paged audit events |

Paged responses look like `{ items, page, pageSize, total, totalPages }`.

## Deploying to Render

1. Push this repository to GitHub.
2. In Render, choose **New**, then **Blueprint**, and select the repository. Render reads `render.yaml` and creates the `afrigo-db` Postgres database and the `afrigo-api` web service.
3. When prompted, fill in the values marked `sync: false`. At minimum: `CORS_ORIGINS`, `WEB_APP_URL`, `ADMIN_APP_URL`, `RESEND_API_KEY` and the three `SEED_ADMIN_*` values.
4. Deploy. Every start runs `npm run db:migrate:prod` first, so the schema is always current.
5. Create the first super administrator once, from the web service **Shell** tab:

   ```bash
   npm run db:seed:admin:prod
   ```

6. Sign in to Afrigo Admin with that email and password, then remove `SEED_ADMIN_PASSWORD` from the environment.
7. Add your custom domain, for example `api.afrigo.africa`, under the service **Settings**.

The blueprint uses the Starter web plan and the Basic Postgres plan in Frankfurt, the closest Render region to West Africa. Render's free plans also work for testing, but free web services sleep when idle and free databases expire after 30 days.

## What else you need

| Service | Why | When | Setting |
| --- | --- | --- | --- |
| Render account | Hosts the API and Postgres | Now | `render.yaml` |
| Domain and DNS | `api.afrigo.africa` for the API, and sending domain for email | Now | Render custom domain |
| Resend | Verification, password reset and staff invite emails. Verify the sending domain first | Now | `RESEND_API_KEY`, `EMAIL_FROM` |
| Google Cloud OAuth client ids | Google sign in on web, iOS and Android | Now, if Google sign in is kept | `GOOGLE_CLIENT_IDS` |
| Paystack | Trade payments, escrow, seller payouts and refunds | Payments module | `PAYSTACK_SECRET_KEY` |
| Object storage (Cloudflare R2 or AWS S3) | KYC documents, product images, chat attachments | Documents module | `S3_*` |
| Firebase Cloud Messaging | Push notifications to Android, iOS and the web | Notifications module | `FIREBASE_*` |
| DHL API | Live shipment tracking | Logistics module | `DHL_API_KEY` |
| Redis (Render Key Value) | Background jobs, shared rate limits across instances, real time fan out | When running more than one instance | `REDIS_URL` |
| Sentry | Error tracking and alerts | Before launch | `SENTRY_DSN` |
| Postgres backups | Point in time recovery | Before launch | Included on paid Render Postgres plans |

## Roadmap

Built in this order, each module following the same schemas, service and routes pattern, with tests:

1. **Companies and verification.** Company profile, KYC document upload to object storage, review queue for Afrigo Admin Verification.
2. **Marketplace.** Listings (lots), buyer requests (RFQs) and bids, with moderation for Afrigo Admin Marketplace.
3. **Trades.** Contracts created from awarded bids or direct purchases, status history, cancellation and disputes.
4. **Payments.** Paystack checkout, webhooks, escrow balances, payout requests with two person approval, refunds.
5. **Logistics.** Exporter assignment, shipment milestones, DHL tracking.
6. **Messaging.** Trade conversations and attachments.
7. **Notifications.** Device token registration, push broadcasts, in app notifications.
8. **App configuration.** Per platform versions, force update, maintenance mode, banners and feature flags for Afrigo Admin App control.
9. **Analytics.** Activity events and the live per country statistics feed for Afrigo Admin.
10. **Support.** Contact form inbox and support cases.

## Connecting the apps

- **Web app and mobile apps:** replace Firebase Authentication with `/auth/register`, `/auth/login`, `/auth/google` and `/auth/refresh`. Store the refresh token securely (Keychain on iOS, EncryptedSharedPreferences on Android, an httpOnly cookie set by the web app's own server on the web). Send `X-Client-Platform` and `X-App-Version` on every request.
- **Afrigo Admin:** sign in with `platform: "admin"` and use `user.capabilities` to show or hide sections, the same way the console does today.
