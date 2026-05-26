# Presnt

**Presnt** is a chapter management platform for Greek-letter and other membership organizations. It handles attendance tracking, event management, member dues, compliance status, roles, excuses, announcements, and more — across chapters, councils, and national HQ organizations.

The project is a **pnpm monorepo** with two runnable applications:

| App | Description |
|-----|-------------|
| `artifacts/presnt` | React Native / Expo mobile + web app |
| `artifacts/api-server` | Express 5 REST API server |

---

## Requirements

- **Node.js** 20+ (22+ recommended)
- **pnpm** 9+ — install with `npm i -g pnpm`
- **Expo Go** (iOS/Android) or a simulator for running the mobile app
- A **Supabase** project (database + auth)

---

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

Run this once from the repo root. It installs everything across all workspace packages.

---

### 2. Set up environment variables

#### API server — `artifacts/api-server/.env`

```env
PORT=3000
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

> **Note:** `SUPABASE_ANON_KEY` is used by the API server to validate user JWTs via the Supabase auth API. You can find these values in your Supabase dashboard under **Settings → API**.

#### Mobile app — `artifacts/presnt/.env.local`

```env
EXPO_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> `EXPO_PUBLIC_` prefix is required for Expo to expose variables to the client bundle. Never put the service role key here.

---

### 3. Start the API server

```bash
cd artifacts/api-server
pnpm run dev
```

This builds the server and starts it on the port defined in `.env` (default `3000`).

---

### 4. Start the mobile app

```bash
cd artifacts/presnt
pnpm run dev
```

This launches Expo. You'll see a QR code in the terminal:

- **Physical device:** Scan with the **Expo Go** app (iOS App Store / Google Play)
- **iOS Simulator:** Press `i`
- **Android Emulator:** Press `a`
- **Web browser:** Press `w`

---

## Workspace Structure

```
presnt/
├── artifacts/
│   ├── presnt/               # Mobile + web app (Expo / React Native)
│   │   ├── app/              # Expo Router screens (file-based routing)
│   │   │   ├── (auth)/       # Login, register, onboarding, create org/chapter
│   │   │   ├── (member)/     # Member portal
│   │   │   ├── (officer)/    # Officer portal
│   │   │   ├── (admin)/      # Chapter admin portal
│   │   │   ├── (org-admin)/  # Organization admin portal
│   │   │   └── (superuser)/  # Platform superuser portal
│   │   ├── components/       # Shared UI components
│   │   ├── stores/           # Zustand state (auth, theme, demo)
│   │   ├── lib/              # Supabase client, geofence, notifications
│   │   └── types/            # Generated database types
│   │
│   └── api-server/           # Express REST API
│       └── src/
│           ├── routes/       # Route handlers (orgs, members, events, etc.)
│           └── middlewares/  # Auth (JWT), superuser guards
│
├── lib/
│   ├── db/                   # Drizzle ORM schema + database client
│   │   └── src/schema/       # Table definitions (organizations, chapters, memberships…)
│   ├── api-client-react/     # Generated React Query hooks (from OpenAPI spec)
│   └── api-zod/              # Generated Zod types (from OpenAPI spec)
│
├── supabase/
│   └── migrations/           # SQL migration history
│
├── package.json              # Root workspace scripts
└── pnpm-workspace.yaml       # Workspace package paths
```

---

## All Commands

| Command | What it does |
|---------|-------------|
| `pnpm install` | Install all dependencies (run from repo root) |
| `cd artifacts/presnt && pnpm run dev` | Start the Expo app |
| `cd artifacts/api-server && pnpm run dev` | Start the API server |
| `pnpm run typecheck` | Full TypeScript check across all packages (run from root) |
| `pnpm run typecheck:libs` | Build type declarations for shared libs only (run from root) |
| `pnpm run build` | Typecheck + build all packages (run from root) |
| `cd lib/api-spec && pnpm run codegen` | Regenerate API hooks and Zod schemas from OpenAPI spec |
| `cd lib/db && pnpm run push` | Push Drizzle schema changes to DB (dev only) |

---

## Data Model Overview

```
organizations           ← national HQ, councils (umbrella entities)
  └── chapters          ← chapters belonging to one org (FK: org_id → organizations)
        └── memberships ← a user's membership in a chapter or org
              └── events, event_attendance, excuses, dues, status_snapshots…
```

- **Organizations** are umbrella entities (type: `national_hq`, `council`).
- **Chapters** are the leaf-level entities members actually join. Each chapter belongs to exactly one organization. Chapters are stored in the `chapters` table and mirrored to `organizations` via a database trigger so all FK-linked tables continue to work.
- **Memberships** link a user profile to a chapter (or org), with a role (`member`, `officer`, `admin`, `org_admin`).
- All deletes are soft: `is_deleted = true` + `deleted_at`. Nothing is hard-deleted.

---

## User Roles

| Role | Portal | Description |
|------|--------|-------------|
| `member` | `(member)` | Regular chapter member |
| `new_member` | `(member)` | Pledging / associate member |
| `officer` | `(officer)` | Chapter officer with custom permissions |
| `admin` | `(admin)` | Chapter administrator |
| `org_admin` | `(org-admin)` | Manages all chapters under an organization |
| superuser | `(superuser)` | Platform-level staff access |

---

## Auth Flow

1. User signs in via Supabase Auth (email + password).
2. On session start, `_layout.tsx` loads the user's **profile** and most-recent active **membership** (preferring `org_admin` if present).
3. The auth store (`stores/authStore.ts`) holds `session`, `profile`, `membership`, and `organization`.
4. `RootLayoutNav` redirects to the appropriate portal based on `membership.role`.

The API server validates every request with a **Supabase JWT** passed as a `Bearer` token. The `requireAuth` middleware verifies the token and attaches `req.user`.

---

## Key Gotchas

- **Use `pnpm`, not `npm` or `yarn`** — a preinstall script enforces this.
- Run `pnpm run typecheck:libs` before typechecking the API server — it builds the `lib/db` and `lib/api-zod` declarations that the server imports.
- Drizzle schema files must use `import { z } from 'zod/v4'` (not `'zod'`).
- `SUPABASE_ANON_KEY` (not the service role key) goes in the mobile app env — the service role key is **never** exposed to the client.
- Never hard-delete rows — always soft-delete with `is_deleted = true`.
- When creating chapters, insert into the `chapters` table — a trigger automatically syncs the row into `organizations` so all FK-dependent tables (memberships, events, etc.) work without changes.

---

## Production

The live app is deployed at **[www.presnt.link](https://www.presnt.link)**.
