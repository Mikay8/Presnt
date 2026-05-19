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

- Use the Replit secrets/environment panel to set local values for the project
- Store shared non-sensitive config as environment variables
- Store sensitive values as secrets
- The app currently expects `TEST_SECRET` for testing/config checks
- The backend requires `DATABASE_URL`
- Keep secret names consistent between the app and backend
- Do not commit secret values to the repo

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- Keep the mobile app blank unless the user asks for UI
- Add setup notes when the user asks for local run instructions or secrets

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
