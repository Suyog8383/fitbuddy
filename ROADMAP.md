# FitBuddy — Full-Stack Learning Roadmap

A fitness/health app built step by step to learn backend development with Node.js
and become a full-stack developer.

## Context (for me and for AI assistants)

- **Background:** React Native / Expo developer, learning backend.
- **Pace:** ~6 hours/week. One phase (or sub-phase) per session.
- **Style:** short explanations, no deep theory. I write the code; AI reviews and fixes.
- **Platform:** macOS. iOS simulator + Android emulator. Docker Desktop for databases.
- **Rule:** Stage 2 (system design) topics stay out of Stage 1. Build simple first, scale later.

## The App

- Sign up / login, biometric unlock (Face ID / fingerprint)
- Sync steps, heart rate, sleep from Android Health Connect / Apple HealthKit
- Dashboard with stats, goals, streaks
- Real-time chat (users / coach)
- AI coach chatbot that uses the user's health data
- Push notifications (reminders, messages, streaks)
- Premium subscription (unlocks AI coach + advanced stats)
- Admin role: manage users, view metrics

## Tech Stack

| Layer      | Tech                                              |
|------------|---------------------------------------------------|
| Mobile     | Expo (dev build), React Query, expo-secure-store  |
| Backend    | Node.js 24, Express, TypeScript (native type stripping) |
| Database   | PostgreSQL + Prisma                               |
| Cache/Jobs | Redis, BullMQ                                     |
| Realtime   | Socket.io                                         |
| Validation | Zod                                               |
| Testing    | Vitest + Supertest                                |
| Logging    | pino                                              |
| Email      | Resend (verification, password reset)             |
| API docs   | OpenAPI (Swagger UI)                              |
| Payments   | RevenueCat (in-app subscriptions) + Stripe        |
| AI         | Claude API (streaming, tool use)                  |
| DevOps     | Docker, GitHub Actions, Railway/Fly, Sentry, EAS  |

## Repo Structure

```
fitbuddy/
├── mobile/      # Expo app
├── server/      # Node + Express API
└── ROADMAP.md
```

---

## Stage 1 — Build the Full-Stack App (~7 months)

| #  | Phase              | Key concepts                                                        | Weeks | Done |
|----|--------------------|---------------------------------------------------------------------|-------|------|
| 0  | Setup              | Monorepo, git, Node native TS, env files, ESLint, Prettier          | 1     | [x]  |
| 1  | HTTP + Express     | Request/response, routing, middleware, REST design, status codes, env validation, logging (pino), Vitest + Supertest basics | 1 | [x] |
| 2  | Database           | Postgres in Docker, schema design, Prisma, migrations, relations    | 2     | [x]  |
| 3  | Authentication     | bcrypt, JWT access + refresh tokens, rotation, logout, email verification, password reset | 2 | [x] |
| 4  | User management    | Profiles, roles (RBAC), admin routes, Zod validation, error handling, account deletion, OpenAPI docs | 2 | [ ] |
| 5  | Mobile ↔ API       | Axios, React Query, secure-store, Expo SDK upgrade + dev build, biometric unlock, Google + Apple sign-in | 2 | [ ] |
| 6  | Testing            | Test database, integration test patterns, mocking external services, coverage | 1 | [ ] |
| 7  | File uploads       | Avatars, multer, S3/Cloudinary, signed URLs                         | 1     | [ ]  |
| 8  | Health data        | Health Connect / HealthKit, sync API, bulk inserts, time-series queries, indexes | 3 | [ ] |
| 9  | Real-time chat     | Socket.io, rooms, socket auth, message storage, presence, typing    | 3     | [ ]  |
| 10 | Push notifications | Expo push, device tokens, background jobs (BullMQ + Redis), scheduling | 2  | [ ]  |
| 11 | Caching basics     | Redis cache, rate limiting, pagination, N+1 queries                 | 1     | [ ]  |
| 12 | Payments           | RevenueCat + Stripe, webhooks, idempotency, subscription state      | 2     | [ ]  |
| 13 | AI coach           | Claude API, streaming, prompts with user data, tool use, cost limits| 2     | [ ]  |
| 14 | Security           | Helmet, CORS, OWASP basics, encryption at rest, audit logs, data deletion | 1 | [ ] |
| 15 | Deploy + DevOps    | Docker, GitHub Actions CI, cloud deploy, managed Postgres, Sentry   | 2     | [ ]  |
| 16 | Release            | EAS Build, Play internal testing, TestFlight                        | 1     | [ ]  |

## Stage 2 — System Design & Architecture (~2–3 months)

Scale the same FitBuddy app. Use k6 to generate real load, watch it break, fix it.

| #  | Topic                        | Applied to FitBuddy                                         | Done |
|----|------------------------------|-------------------------------------------------------------|------|
| 1  | HLD & LLD                    | Architecture diagrams, layered code design, design patterns | [ ]  |
| 2  | Load testing (k6)            | Baseline every major endpoint                               | [ ]  |
| 3  | Vertical vs horizontal scaling | Bigger server vs multiple stateless API instances         | [ ]  |
| 4  | Single points of failure     | Identify and remove SPOFs (DB, Redis, server)               | [ ]  |
| 5  | Load balancing (NGINX)       | Round robin, weighted, least connections, IP hash           | [ ]  |
| 6  | Scaling WebSockets           | Sticky sessions + Socket.io Redis adapter                   | [ ]  |
| 7  | Replication                  | Postgres primary + read replica                             | [ ]  |
| 8  | Partitioning & sharding      | Health data partitioned by month, shard by user ID          | [ ]  |
| 9  | Advanced caching             | Cache strategies, invalidation, leaderboards (sorted sets)  | [ ]  |
| 10 | Event streaming (Kafka)      | health.synced, message.sent, payment.succeeded events       | [ ]  |
| 11 | SQL vs NoSQL (MongoDB)       | Chat messages in MongoDB                                    | [ ]  |
| 12 | Probabilistic filters        | Bloom filter for username checks; Cuckoo/Xor/Binary Fuse benchmark | [ ] |
| 13 | Search (Typesense)           | Fuzzy, multilingual (Hinglish) exercise & user search       | [ ]  |
| 14 | Observability                | Prometheus metrics + Grafana dashboards                     | [ ]  |
| 15 | Cloud (AWS)                  | EC2 sizing from k6 results, VPC, regions, network latency   | [ ]  |
| 16 | Other frameworks (optional)  | Compare Express vs Fastify vs NestJS                        | [ ]  |
| 17 | Geo search (optional)        | "Gyms / trainers near me" with PostGIS or Typesense geo     | [ ]  |

---

## Notes

- Google Fit API is deprecated — use **Health Connect** on Android.
- HealthKit / Health Connect need native code → **Expo dev build**, not Expo Go.
- Digital subscriptions must use App Store / Play billing → **RevenueCat**. Stripe for non-digital or web.
- Health data is sensitive: consent, encryption, and user data deletion are required.
- App Store and Play Store require in-app **account deletion**.
- Apple requires **Sign in with Apple** if the app offers other social logins (e.g. Google).
- Security is practiced in every phase (validation, auth checks, no secrets in git); Phase 14 is the hardening pass.
- Node native TypeScript only strips types. If a tool needs non-erasable syntax, fall back to `tsx`. (Prisma 7's generated client works natively with `importFileExtension = "ts"`.)
- Type stripping: no `enum`, `namespace`, or constructor parameter properties. Use `as const` objects instead of enums. Imports need the `.ts` extension; type-only imports use `import type`.
- TypeScript 6+ no longer auto-loads `@types/*` — list them in tsconfig (`"types": ["node"]`).
- TypeScript pinned to `~6.0`: typescript-eslint doesn't support TS 7 yet. Upgrade when it does.
- Mobile started on Expo SDK 57 (Expo Go). Upgrade the SDK before creating the dev build in Phase 5.
- Git: one branch per phase → one PR at the end of the phase → squash and merge into `main`. If you squash mid-phase, start a new branch from the updated `main`.
- Config: read env only through `src/env.ts` (Zod, fail fast). Secrets get no default. `NODE_ENV` = development | test | production; deploy target (staging/prod) goes in a separate `APP_ENV` (Phase 15).
- Logging: use `logger` / `req.log` (pino), never `console.*` (except `env.ts`, which runs before the logger exists). Log IDs, not contents — never passwords, tokens, or health data.
- API docs (OpenAPI + Swagger UI) come in Phase 4, generated from the Zod schemas.
- Prisma pinned to `7.10.1` (exact). npm's `latest` tag for `prisma` pointed at an 8.0 release candidate — always check what `latest` is before installing.
- Migrations: edit `schema.prisma` → `npm run db:migrate -- --name x` → read the SQL → commit it. Never edit an applied migration or change the DB by hand (drift). Prod uses `migrate deploy` only. Adding a required column to a table with data: dev = clear the data; prod = expand → backfill → contract.
- Every query on user-owned data filters by owner (`where: { id, userId }`) — no IDOR. Someone else's row returns the same 404 as a missing one.
- Let DB constraints decide races: catch Prisma `P2025` (not found → 404), `P2002` (unique → 409), `P2003` (foreign key → 404, or 401 when the missing row is the token's user) instead of checking first. For multi-step changes use a conditional `updateMany` (`WHERE … AND used_at IS NULL`) and check `count` — never read-then-write.
- Auth: access token = JWT HS256, 15 min, only `sub` in the payload, verified with fixed `algorithms`/`iss`/`aud`. Refresh token = 32 random bytes, stored as SHA-256 hash, 30-day sliding expiry, single use (rotation); reuse of a used token revokes its whole family. Refresh tokens go only to `/auth/refresh` and `/auth/logout`, in the body. Logout = revoke family; logout-all / password reset = revoke all of the user's tokens. Access tokens stay valid up to 15 min after logout (accepted; denylist is Stage 2).
- Passwords: bcrypt cost 12, 8 chars min / 72 bytes max, `passwordHash` omitted from every query by default (`src/db.ts`). Login always runs bcrypt (`DUMMY_HASH`) and gives one 401 for wrong email or password.
- Email codes: 6 digits from `crypto.randomInt`, SHA-256 hashed, 15 min, 5 attempts (spent before comparing, atomically), single use, a new code kills the old one. Purpose enum keeps verification and reset codes apart. Forgot-password always 204 and doesn't await the send (timing). Unverified users can still log in (app shows a banner).
- Email: `sendEmail()` picks a sender at startup — memory in tests (`sentEmails`), console in dev without `RESEND_API_KEY` (prints codes, dev only), Resend otherwise. Production refuses to start without the key. `onboarding@resend.dev` only delivers to the Resend account's own email until a domain is added.
- Prisma `enum` in `schema.prisma` is fine with type stripping — the generated client turns it into an `as const` object.
- Pin new dependencies to a release that's at least ~2 weeks old (e.g. `resend@6.34.1`, not a 3-day-old `latest`) — fresh releases are where supply-chain attacks land.
- Tests use a separate `fitbuddy_test` database (created + migrated by `src/test/globalSetup.ts`, emptied before each test).
- Agent safety hooks block `DROP`/destructive DB commands — run those yourself.
- Every phase ends with something working, tested, and committed. Write a few Vitest/Supertest tests in every phase from Phase 1 on.

## Progress Log

| Date | Phase | Notes |
|------|-------|-------|
| 2026-10-29 | 0 | Setup done: server (Node 24 native TS, env, ESLint, Prettier) + mobile (Expo SDK 57) on iOS + Android. TS pinned to 6.0 for typescript-eslint. Learned: embedded git repo (160000) fix, enum vs `as const`, squash merge. |
| 2026-10-30 | 1 | Express workouts CRUD (in-memory), validation, 404 + error middleware, Zod env validation, pino logging (request IDs, redact, LOG_LEVEL), Vitest + Supertest (33 tests). Switched to "theory → I do → you do → review". Learned: type guards with `unknown`, middleware order, `ERR_HTTP_HEADERS_SENT`, fail-fast config, structured logs, one PR per phase. |
| 2026-10-30 | 2 | Postgres 18 in Docker Compose (volume, healthcheck), SQL by hand in psql, Prisma 7 (schema, 2 migrations, pg adapter, singleton client), workouts in Postgres, User 1→N Workout (FK index, cascade delete), nested routes `/users/:userId/workouts`, test DB (60 tests incl. IDOR + cascade). Learned: SQL CRUD + constraints, `;` in psql, ORDER BY tie-breakers, normalization, foreign keys, ON DELETE options, indexes, SQL injection, P2025/P2002/P2003, IDOR. |
| 2026-10-30 | 3 | Own auth, no Auth0/Firebase. 3A bcrypt register/login (timing-safe, no enumeration). 3B JWT access tokens (jose), `requireAuth`, `/users/me`, workouts owned via token. 3C refresh tokens: hashed, rotation, reuse detection → family revoke, logout + logout-all. 3D email verification + password reset with 6-digit codes, Resend behind a swappable sender. 184 tests. Learned: hashing vs bcrypt, JWT claims + `alg` attacks, stateless vs revocable tokens, transactions (array + callback form), conditional updates for races, mutation testing, enumeration + timing leaks, fire-and-forget with `.catch`, Zod `.refine`, `satisfies`. |
