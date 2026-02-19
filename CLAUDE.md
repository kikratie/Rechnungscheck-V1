# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Referenzdokumente

- **CONCEPT.md** — Vollständiges Produktkonzept, DB-Schema, API-Endpunkte, Feature-Katalog, Regel-Engine. **VOR jeder Implementierung gegen CONCEPT.md abgleichen.**
- **PROGRESS.md** — Fortschritt, offene Aufgaben, Konzept-Abweichungen, Verbesserungsvorschläge. **Nach jeder Session aktualisieren.**

## Project

**Ki2Go Accounting** (Arbeitstitel im Code: BuchungsAI) — KI-gestützte Buchhaltungs-Automatisierung für österreichische Einzelunternehmer (E/A-Rechner). Multi-tenant SaaS: GPT-4 Vision OCR für Rechnungen, Matching gegen Banktransaktionen, Regel-Engine (§11 UStG), UID-Validierung, BMD-Export. Sprache im Code ist Englisch, Domain-Begriffe teils Deutsch.

**USP:** Automatischer Bankabgleich + tiefe Rechnungsprüfung nach §11 UStG + importfertiger BMD-Export.

**UX-Prinzip:** Komplexität unter der Haube. Der Unternehmer sieht nur die Ampel (Grün/Gelb/Rot). Details bei Klick.

## Commands

```bash
# Infrastructure (PostgreSQL 16, Redis 7, MinIO)
npm run docker:up           # start containers
npm run docker:down         # stop containers

# Development (runs both server + client)
npm run dev
npm run dev:server          # tsx watch on port 3001
npm run dev:client          # vite on port 5173 (proxies /api → :3001)

# Build (order: shared → server → client)
npm run build

# Database (Prisma)
npm run db:migrate          # prisma migrate dev
npm run db:seed             # seed demo data
npm run db:clean            # alle Rechnungen/Lieferanten/Validierungen löschen (frisch testen)
npm run db:studio           # Prisma Studio on port 5555

# From server/ workspace
npm run db:generate         # regenerate Prisma client after schema changes
npm run db:migrate:prod     # prisma migrate deploy (no prompts)

# Test & Lint
npm run test                # vitest run (server) in parallel
npm run lint                # eslint on server + client
```

## Architecture

```
shared/          @buchungsai/shared — types, Zod schemas, constants (must build first)
server/          @buchungsai/server — Express API (ESM, tsx in dev, tsc for prod)
client/          @buchungsai/client — React SPA (Vite, TailwindCSS, Zustand, React Query)
prisma/          Schema + seed (root-level, server calls prisma CLI)
```

npm workspaces link all three packages. Pure ESM everywhere (`"type": "module"`).

### Server Request Flow

```
helmet → cors → rateLimit → express.json
  → /api/v1/health (no auth)
  → /api/v1/auth/* (public + JWT where needed)
  → authenticate → requireTenant → [requireRole(...)] → route handler
  → 404 handler → errorHandler (must be last)
```

**Pattern:** Routes → Controllers (thin try/catch) → Services (business logic + Prisma) → `writeAuditLog()` (fire-and-forget)

Some simpler routes (tenant, dashboard, auditLog) use inline handlers without separate controller/service files.

### Multi-Tenancy

Every JWT contains `tenantId`. The `authenticate` middleware sets `req.userId`, `req.tenantId`, `req.userRole`. **All Prisma queries must manually filter by `tenantId`** — there is no automatic row-level security.

Registration creates Tenant + ADMIN User atomically via `prisma.$transaction`.

### Auth Flow

Access tokens: 15min signed JWT. Refresh tokens: 7-day random hex stored in DB with rotation (old token deleted on refresh). Client Axios interceptor auto-refreshes on 401 and retries the request.

### Validation

Zod schemas defined once in `shared/src/validation.ts`, used by both server (`validateBody(schema)` middleware) and client. `validateBody` replaces `req.body` with parsed output; validation errors flow through `errorHandler` as 422.

### API Response Shape

All endpoints return `ApiResponse<T>` from shared: `{ success, data, pagination? }` or `{ success: false, error: { code, message, details? } }`.

### Error Hierarchy

`AppError` base class with subclasses: `NotFoundError`(404), `UnauthorizedError`(401), `ForbiddenError`(403), `ConflictError`(409), `ValidationError`(422). Central `errorHandler` catches ZodError, AppError, Multer errors, and unknowns.

### Client Patterns

- **Zustand** for auth state (persisted to localStorage key `buchungsai-auth`)
- **TanStack Query** for server data (staleTime 30s, retry 1)
- **Vite proxy**: `/api` → `http://localhost:3001`
- **Path alias**: `@` → `client/src/` (configured in vite.config.ts)
- **Tailwind** custom colors: `primary-*` (blue), `traffic-green/yellow/red/gray` for status indicators
- CSS component classes in `index.css`: `.btn-primary`, `.btn-secondary`, `.input-field`, `.card`

## Database

PostgreSQL via Prisma. Schema at `prisma/schema.prisma`.

Key design: UUIDs for all PKs. `@@unique([tenantId, email])` on User (same email allowed across tenants). Monetary values use `Decimal @db.Decimal(12,2)` (never Float). Confidence scores use `Decimal(5,4)`. Compound indexes on `(tenantId, ...)` for multi-tenant query performance.

**Seed accounts** (tenant slug: `demo-gmbh`):
- `admin@demo.at` / `Admin123!`
- `buchhalter@demo.at` / `Buchhalter123!`
- `steuerberater@demo.at` / `Steuerberater123!`

## Environment

Copy `.env.example` → `server/.env`. Server validates env with Zod on startup (exits on invalid config). Required: `DATABASE_URL`, `JWT_SECRET` (min 32 chars). Optional: `OPENAI_API_KEY` (Phase 2+).

## Austrian Domain

- UID format: `ATU` + 8 digits
- VAT rates: 20% (standard), 13%, 10%, 0%
- BMD tax codes: V20, V13, V10, V00 (in `shared/src/constants.ts`)
- BMD export: semicolon delimiter, comma decimal, `dd.MM.yyyy` dates, ISO-8859-1 encoding
