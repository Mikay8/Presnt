# presnt

A blank Expo mobile app with a companion API server in the same pnpm workspace.

## Run & Operate

- `pnpm --filter @workspace/presnt run dev` — run the Expo app locally
- `pnpm --filter @workspace/api-server run dev` — run the API server locally
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Local setup

### Install

- Run `pnpm install` from the project root once.

### Run the backend

- Start the API server with `pnpm --filter @workspace/api-server run dev`
- It uses the workspace-managed port from the workflow

### Run the mobile app

- Start the Expo app with `pnpm --filter @workspace/presnt run dev`
- Open the Expo preview URL shown in the workflow output

### Local secrets and environment variables

**API server** — set these in your environment before running `dev`:

| Variable | Description |
|---|---|
| `PORT` | Port for the Express server (e.g. `3000`) |
| `DATABASE_URL` | Postgres connection string (Supabase direct URL) |
| `SUPABASE_URL` | Your Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key from Supabase dashboard → Settings → API |

**Mobile app** — set these in `.env.local` at `artifacts/presnt/`:

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` above |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key from Supabase dashboard → Settings → API |

- Do not commit `.env.local` or any secrets to the repo
- `SUPABASE_SERVICE_ROLE_KEY` is server-only — never expose it to the mobile client

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

| What | Path |
|---|---|
| Mobile app screens | `artifacts/presnt/app/` |
| Mobile Supabase client | `artifacts/presnt/lib/supabase.ts` |
| Mobile auth + theme stores | `artifacts/presnt/stores/` |
| API server routes | `artifacts/api-server/src/routes/` |
| API auth middleware | `artifacts/api-server/src/middlewares/auth.ts` |
| DB schema (Drizzle) | `lib/db/src/schema/` |
| Supabase migrations | Applied via MCP — check Supabase dashboard for history |

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- Keep the mobile app blank unless the user asks for UI
- Add setup notes when the user asks for local run instructions or secrets

## Gotchas

- Run `pnpm run typecheck:libs` from the root before typechecking the API server — it builds the `lib/db` and `lib/api-zod` type declarations that the server imports.
- Drizzle schema files must use `import { z } from 'zod/v4'` (not `'zod'`) — `drizzle-zod@0.8.x` requires the Zod v4 API.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS — only used in the Express server, never in the mobile app.
- Never hard-delete rows — use `is_deleted = true` + `deleted_at`. Audit logs and transaction ledgers are append-only (no UPDATE/DELETE).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
