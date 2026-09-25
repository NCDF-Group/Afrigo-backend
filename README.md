# AfriGoOS Backend

The one backend for AfriGoOS, the Africa wide trade and market access platform by NCDF Group. The responsive website, the installable web app and the AfriGoOS administration console all use this API.

> Find opportunities. Prepare for trade. Manage execution.

It is written in plain Node.js (Express and TypeScript), stores everything in PostgreSQL, and deploys to Render.

## How this maps to the developer brief

| Brief requirement | Where it lives | Status |
| --- | --- | --- |
| Account creation | `auth` module | Built |
| Secure login, administrator MFA | `auth` module, TOTP MFA required for every AfriGoOS administrator | Built |
| Business profiles and business details | `organisations` module | Built |
| Colleague invitations | `organisations` invitations | Built |
| A business can be both buyer and seller | Organisations carry several business types, not one fixed role | Built |
| Business administrator, business team member | Organisation roles `administrator` and `member` | Built |
| Service partner | Organisation kind `service_partner` | Built (assigned work comes with Service requests) |
| AfriGoOS administrator | Staff roles with scoped capabilities | Built |
| Review businesses | Admin organisation review queue | Built |
| Configure countries and currencies | `config` module, 55 African countries | Built |
| Activity logs | `audit_events`, written for every sensitive action | Built |
| English first, ready for French | `locale` on every account (`en`, `fr`) | Built |
| Low data pages | gzip compression, pagination, cached reference data | Built |
| Document uploads and document protection | Documents module | Next |
| Products and buyer requests, search, enquiries, quotations | Listings and Enquiries modules | Planned |
| Trade cases with documents, tasks and shipment milestones | Trade cases module | Planned |
| Logistics, inspection and trade readiness requests | Service requests module | Planned |
| ETLS and AfCFTA guidance with evidence and escalation | Market access module | Planned |
| Dashboard and notifications | Dashboard and Notifications modules | Planned |
| Configure products and trade requirements | Config module extensions | Planned |
| Backups | Render managed Postgres backups | At deployment |

Live carrier tracking and payments are not part of the first release in the brief, so they are not built. Shipment progress is tracked as milestones inside a trade case.

## Tech stack

| Concern | Choice |
| --- | --- |
| Runtime | Node.js 20+ |
| HTTP | Express 5 |
| Language | TypeScript, ES modules |
| Database | PostgreSQL 17 with Drizzle ORM and generated migrations |
| Validation | Zod |
| Tokens | jose (HS256 JWT) |
| Passwords | Node `scrypt` |
| MFA | TOTP (RFC 6238), secrets encrypted with AES-256-GCM |
| Logging | pino with request ids |
| Security | helmet, strict CORS, express-rate-limit, compression |
| Tests | Vitest and Supertest against a real Postgres database |
| Hosting | Render web service and managed Postgres |

## Project structure

```
.
├── drizzle/                     SQL migrations (0001 seeds the 55 African countries)
├── src/
│   ├── app.ts                   Express app and route mounting
│   ├── server.ts                HTTP server and graceful shutdown
│   ├── config/env.ts            Validated environment variables
│   ├── db/                      Schema, client, migrate and seed scripts
│   ├── lib/                     crypto, encryption, totp, jwt, mailer, audit, roles, errors
│   ├── middleware/              authentication, rate limits, errors
│   └── modules/
│       ├── auth/                Accounts, sign in, sessions, MFA, passwords
│       ├── users/               Personal profile and admin member management
│       ├── organisations/       Businesses, service partners, colleagues, invitations, review
│       ├── staff/               AfriGoOS administrators and the audit log
│       ├── config/              Countries and currencies
│       └── health/              Liveness and readiness
└── test/                        End to end tests
```

Every module has the same three files: `*.schemas.ts` for input, `*.service.ts` for rules and queries, and `*.routes.ts` for HTTP.

## Getting started

Prerequisites: Node.js 20+ and PostgreSQL 17 (`brew install postgresql@17 && brew services start postgresql@17`, or `docker compose up -d`).

First time only:

```bash
npm install
cp -n .env.example .env
createdb afrigo
createdb afrigo_test
```

Open `.env` and set `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY` and the three `SEED_ADMIN_*` values. Generate each secret separately with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`DATABASE_URL=postgres://localhost:5432/afrigo` connects as your computer's user, which is how a Homebrew Postgres is set up. With `docker compose` use `postgres://postgres:postgres@localhost:5432/afrigo`.

Then:

```bash
npm run db:migrate
npm run db:seed:admin
npm run dev
```

Day to day, only `npm run dev` is needed. Run `npm run db:migrate` again after pulling new migrations. `cp -n` never overwrites an existing `.env`; do not copy the example over a working one, or your secrets are replaced with placeholders.

The API runs on http://localhost:4000. Check http://localhost:4000/api/v1/health/ready.

The first time the seeded administrator signs in, the API asks them to set up MFA with an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.

Run the tests with `npm test`. They rebuild the `afrigo_test` database each run.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled API |
| `npm run typecheck` | Type check |
| `npm test` | Run the test suite |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed:admin` | Create or reset the first super administrator |
| `npm run db:studio` | Browse the database |
| `npm run start:render` | Apply migrations then start (Render) |

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection. Render fills it in |
| `JWT_ACCESS_SECRET` | Yes | Signs access and MFA tokens. 32+ characters. Render generates it |
| `ENCRYPTION_KEY` | Yes | Encrypts MFA secrets at rest. 32+ characters, different from the JWT secret. Render generates it. Never change it after launch, or enrolled authenticators stop working |
| `CORS_ORIGINS` | Production | Browser origins allowed to call the API, comma separated |
| `WEB_APP_URL` | Production | Base for verification, reset and colleague invitation links |
| `ADMIN_APP_URL` | Production | Base for administrator invitation and reset links |
| `RESEND_API_KEY` | Production | Sends email. Without it, development prints emails to the log |
| `EMAIL_FROM` | No | Sender, default `AfriGoOS <no-reply@afrigo.africa>` |
| `GOOGLE_CLIENT_IDS` | Optional | Enables Google sign in |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | Once | First super administrator. Password 12+ characters |
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | No | Runtime settings |
| `DATABASE_SSL`, `DATABASE_POOL_SIZE` | No | Connection tuning |
| `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS` | No | Default 15 minutes and 30 days |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Documents module | Private document storage |
| `REDIS_URL` | Later | Background jobs and shared rate limits when running several instances |
| `SENTRY_DSN` | Before launch | Error tracking |

## Access model

This follows slide 7 of the brief.

| Brief role | How it works here |
| --- | --- |
| Business administrator | `administrator` member of an organisation. Manages the profile, colleagues, invitations and verification |
| Business team member | `member` of an organisation. Works on the business's enquiries, documents and trade cases |
| Service partner | A user in an organisation of kind `service_partner`. Will see only the service requests assigned to that partner |
| AfriGoOS administrator | A user with a staff role. Reviews businesses, manages guidance and oversees operations. MFA is mandatory |

A person can belong to several organisations. An organisation lists several business types (`exporter`, `importer`, `manufacturer`, `cooperative`, `aggregator`, `trade_service_provider`), so one business can buy and sell. Private records are only visible to members of the owning organisation: anyone else gets `404`.

Administrator duties are split into staff roles so each person only gets what they need:

| Staff role | Capabilities |
| --- | --- |
| `support_agent` | support cases, members (read), inbox, activity |
| `dispute_officer` | support cases, case decisions, members (read), activity |
| `finance_operator` | finance, members (read), activity |
| `risk_officer` | business review, compliance, member management, listing moderation, activity |
| `admin` | all operations except staff management |
| `super_admin` | everything |

The API returns them as `user.capabilities`, the same names the AfriGoOS Admin console uses.

## Authentication

1. Sign in returns an **access token** (15 minutes) and a **refresh token** (30 days).
2. Send `Authorization: Bearer <accessToken>` on every request.
3. Before the access token expires, call `POST /auth/refresh`. Each refresh token works once. Reusing an old one revokes every session in that chain, which catches stolen tokens.
4. Access tokens are checked against the database on every request, so suspensions, password changes and revoked sessions apply immediately.

### Two step verification (MFA)

When MFA applies, sign in returns an `mfaToken` instead of tokens:

- `{ "mfaSetupRequired": true, "mfaToken": "..." }`: an administrator who has not enrolled yet. Call `POST /auth/mfa/setup` with the `mfaToken` to get a secret and an `otpauth://` link (show it as a QR code), then `POST /auth/mfa/enable` with the `mfaToken` and the first 6 digit code. The response signs them in and includes 10 single use recovery codes to store safely.
- `{ "mfaRequired": true, "mfaToken": "..." }`: call `POST /auth/mfa/challenge` with the `mfaToken` and either `code` or `recoveryCode`.

MFA is mandatory for AfriGoOS administrators and optional for everyone else. Codes cannot be reused, secrets are encrypted in the database, and failed codes count toward the account lockout. A super administrator can reset another administrator's MFA if they lose their device.

### Other protections

- scrypt password hashing. Passwords need 8+ characters with a letter and a number.
- 5 wrong passwords or codes lock the account for 15 minutes.
- One error message for unknown email and wrong password.
- Verification, reset and invitation links are stored hashed, single use and short lived.
- Rate limits: 300 requests a minute per IP, 20 sign in attempts per 10 minutes, 5 sensitive actions per 15 minutes.
- Every sign in, failure, MFA change, invitation, review and admin action is recorded in the activity log.

### Client headers

| Header | Example | Purpose |
| --- | --- | --- |
| `Authorization` | `Bearer eyJ...` | Signed in requests |
| `X-Client-Platform` | `web`, `ios`, `android`, `admin` | Which app is calling |
| `X-App-Version` | `1.0.0` | Installed app version |

The administration console signs in with `"platform": "admin"`. Accounts without a staff role are refused there.

## API reference

Base path `/api/v1`. JSON in and out. Errors always look like:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Some fields are missing or invalid.", "details": [{ "field": "types", "message": "Choose at least one business type." }] }, "requestId": "..." }
```

Branch on `code`; `message` is safe to show to users. Paged lists return `{ items, page, pageSize, total, totalPages }`.

### Health and configuration

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health/live` | None | Process is up |
| GET | `/health/ready` | None | Database reachable (Render health check) |
| GET | `/config/countries?enabled=true` | None | Countries with region, currency, ECOWAS and AfCFTA flags |

### Accounts and sign in

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| POST | `/auth/register` | None | `firstName, lastName, email, password, phone?, country?, locale?, platform?` |
| POST | `/auth/login` | None | `email, password, platform?` |
| POST | `/auth/google` | None | `idToken, platform?` |
| POST | `/auth/mfa/challenge` | None | `mfaToken, code` or `mfaToken, recoveryCode` |
| POST | `/auth/mfa/setup` | `mfaToken` or signed in | `mfaToken?` |
| POST | `/auth/mfa/enable` | `mfaToken` or signed in | `mfaToken?, code` |
| POST | `/auth/mfa/disable` | Signed in | `code` (not allowed for administrators) |
| POST | `/auth/mfa/recovery-codes` | Signed in | `code` |
| POST | `/auth/refresh` | None | `refreshToken` |
| POST | `/auth/logout` | None | `refreshToken` |
| POST | `/auth/logout-all` | Signed in | |
| GET | `/auth/me` | Signed in | Returns `{ user, organisations }` |
| POST | `/auth/email/verify` | None | `token` |
| POST | `/auth/email/resend` | Signed in | |
| POST | `/auth/password/forgot` | None | `email` (always `202`) |
| POST | `/auth/password/reset` | None | `token, password` (also accepts administrator invitations) |
| POST | `/auth/password/change` | Signed in | `currentPassword?, newPassword` |
| GET | `/auth/sessions` | Signed in | |
| DELETE | `/auth/sessions/:id` | Signed in | |
| PATCH | `/users/me` | Signed in | any of `firstName, lastName, phone, country, avatarUrl, locale` |
| DELETE | `/users/me` | Signed in | `password?, confirm: "DELETE"` |

### Businesses and colleagues

| Method | Path | Who | Body |
| --- | --- | --- | --- |
| POST | `/organisations` | Signed in | `name, types[], country, kind?, tradingName?, registrationNumber?, taxId?, city?, address?, description?, website?, email?, phone?, logoUrl?` |
| GET | `/organisations/mine` | Signed in | |
| GET | `/organisations/:id` | Member | |
| PATCH | `/organisations/:id` | Administrator | Any profile field. Changing name, registration, tax id or country clears a verified badge |
| POST | `/organisations/:id/verification` | Administrator | Submits for review. Needs a registration number |
| GET | `/organisations/:id/members` | Member | |
| PATCH | `/organisations/:id/members/:userId` | Administrator | `role` |
| DELETE | `/organisations/:id/members/:userId` | Administrator, or yourself to leave | |
| GET | `/organisations/:id/invitations` | Administrator | |
| POST | `/organisations/:id/invitations` | Administrator | `email, role?` |
| DELETE | `/organisations/:id/invitations/:invitationId` | Administrator | |
| POST | `/organisations/invitations/accept` | Signed in with the invited email | `token` |

A business must always keep one administrator. Businesses can only register in countries that are enabled.

### Administration

| Method | Path | Capability | Body or query |
| --- | --- | --- | --- |
| GET | `/admin/organisations` | `risk:read` | `q, kind, country, verificationStatus, status, page, pageSize` |
| GET | `/admin/organisations/:id` | `risk:read` | |
| POST | `/admin/organisations/:id/review` | `compliance:review` | `decision: "verify"` or `decision: "reject", note` |
| POST | `/admin/organisations/:id/status` | `users:manage` | `action: "suspend", reason` or `action: "reactivate"` |
| GET | `/admin/users` | `users:read` | `q, country, status, platform, verified, page, pageSize` |
| GET | `/admin/users/:id` | `users:read` | |
| POST | `/admin/users/:id/actions` | `users:manage` | `suspend` with `reason`, `reactivate`, `revoke-sessions`, `verify-email`, `reset-mfa` |
| GET | `/admin/staff` | `staff:manage` | |
| POST | `/admin/staff` | `staff:manage` | `email, firstName, lastName, role` |
| PATCH | `/admin/staff/:id` | `staff:manage` | `role`, or `null` to revoke |
| POST | `/admin/staff/:id/reset-mfa` | `staff:manage` | |
| GET | `/admin/audit` | `staff:manage` | `action?, page, pageSize` |
| PATCH | `/admin/config/countries/:iso2` | `apps:manage` | `enabled?, pilot?, currency?` |

### Links in emails

The website and console need these pages, each posting the `token` query value back to the API:

| Page | Posts to |
| --- | --- |
| `WEB_APP_URL/verify-email?token=` | `/auth/email/verify` |
| `WEB_APP_URL/reset-password?token=` | `/auth/password/reset` |
| `WEB_APP_URL/invitations/accept?token=` | `/organisations/invitations/accept` (after sign in) |
| `ADMIN_APP_URL/reset-password?token=` | `/auth/password/reset` (also used for administrator invitations) |

## Deploying to Render

1. Push to GitHub.
2. In Render choose **New**, **Blueprint**, and select this repository. `render.yaml` creates the `afrigo-db` database and the `afrigo-api` service.
3. Fill in the prompted values: `CORS_ORIGINS`, `WEB_APP_URL`, `ADMIN_APP_URL`, `RESEND_API_KEY` and the `SEED_ADMIN_*` values.
4. Deploy. Each start applies migrations first.
5. Create the first super administrator once: run `npm run db:seed:admin:prod` from the service **Shell** on paid plans, or the command below from your machine on free plans.
6. Sign in to the console, enrol MFA, then delete `SEED_ADMIN_PASSWORD` from the environment.
7. Add `api.afrigo.africa` as a custom domain.

The blueprint currently uses Render's **free** plans in Frankfurt, the nearest Render region to West Africa, for staging. Free plans have limits: the web service sleeps after 15 minutes idle (the first request then takes about a minute), the database is deleted after 30 days, and there is no Shell or backups. On free plans, run the admin seed from your own machine with the database's External URL:

```bash
DATABASE_URL="<External Database URL from Render>" npm run db:seed:admin
```

Before the pilot, change both `plan: free` lines to `plan: starter` (web) and `plan: basic-256mb` (database) for always on service, Shell access and daily backups.

## Pilot markets

The 12 ECOWAS members are open by default: Benin, Cabo Verde, Côte d'Ivoire, The Gambia, Ghana, Guinea, Guinea-Bissau, Liberia, Nigeria, Senegal, Sierra Leone and Togo. The brief asks to confirm the pilot markets (slide 11). Once agreed, mark them with `pilot: true` and open or close others from the console with `PATCH /admin/config/countries/:iso2`.

## What else you need

| Service | Why | When |
| --- | --- | --- |
| Render account | API and Postgres hosting | Now |
| Domain and DNS | `api.afrigo.africa` and a verified email sending domain | Now |
| Resend | Verification, reset, invitation and review emails | Now |
| Authenticator app for each administrator | Mandatory administrator MFA | Now |
| Google Cloud OAuth client ids | Google sign in, if kept | Optional |
| Object storage (Cloudflare R2 or AWS S3, private bucket) | Business documents, origin evidence, product images | Documents module |
| Web Push keys (VAPID) | Notifications in the installable web app | Notifications module |
| Redis (Render Key Value) | Background jobs, shared rate limits across instances | When scaling out |
| Sentry | Error tracking and alerts | Before pilot |
| Postgres backups and point in time recovery | Required by the brief | Paid Render Postgres plan |

## Roadmap

Following the brief's four stages (confirm and design, build, pilot, launch and expand), the build stage continues in this order:

1. **Documents.** Private uploads for business verification and origin evidence, signed download links, access checks by organisation.
2. **Listings.** Products and buyer requests with specifications, quantities, locations, images and requirements. Admin moderation.
3. **Search and enquiries.** Search products, buyer requests and supply opportunities; enquiries between businesses; quotations and responses.
4. **Trade cases.** Opened from an enquiry. Quotations, documents, tasks and shipment milestones in one workspace shared by the parties.
5. **Service requests.** Logistics, inspection and trade readiness requests assigned to service partners, who only see their assigned work.
6. **Market access guidance.** Separate ETLS and AfCFTA workflows by product, origin and destination, with requirements, official references and last review dates, origin evidence, preparation tasks and escalation. It never promises duty free access or issues certificates.
7. **Dashboard and notifications.** Enquiries, active trade cases, outstanding tasks, in app and email notifications, web push.
8. **Configuration.** Product categories, trade requirements and guidance content managed by administrators.
9. **Support and activity.** Contact enquiries, support assignment and platform activity for the console.

### Launch acceptance (slide 10)

The backend is done for release one when these pass end to end:

1. A business registers and publishes a product or buyer request.
2. Users exchange an enquiry, open a trade case, upload documents and track tasks.
3. Administrators manage the journey securely, with access controls verified.
