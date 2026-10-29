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
| 0  | Setup              | Monorepo, git, Node native TS, env files, ESLint, Prettier          | 1     | [ ]  |
| 1  | HTTP + Express     | Request/response, routing, middleware, REST design, status codes, env validation, logging (pino) | 1 | [ ] |
| 2  | Database           | Postgres in Docker, schema design, Prisma, migrations, relations    | 2     | [ ]  |
| 3  | Authentication     | bcrypt, JWT access + refresh tokens, rotation, logout, email verification, password reset, Google + Apple sign-in | 3 | [ ] |
| 4  | User management    | Profiles, roles (RBAC), admin routes, Zod validation, error handling, account deletion, OpenAPI docs | 2 | [ ] |
| 5  | Mobile ↔ API       | Axios, React Query, secure-store, biometric unlock                  | 1     | [ ]  |
| 6  | Testing            | Unit + integration tests (Vitest), Supertest, test database         | 1     | [ ]  |
| 7  | File uploads       | Avatars, multer, S3/Cloudinary, signed URLs                         | 1     | [ ]  |
| 8  | Health data        | Dev build, Health Connect / HealthKit, sync API, bulk inserts, time-series queries, indexes | 3 | [ ] |
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
- Node native TypeScript only strips types. If a tool (e.g. generated Prisma client) needs non-erasable syntax, fall back to `tsx`.
- Every phase ends with something working, tested, and committed.

## Progress Log

| Date | Phase | Notes |
|------|-------|-------|
|      |       |       |
