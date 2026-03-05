# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Medusa v2** (>= 2.13.x) headless commerce backend for Lounj Studio. It runs as a Node.js server exposing a REST API, with a built-in admin dashboard. Production deployment targets Hetzner Cloud via Docker + Caddy reverse proxy (admin.lounjstudio.com).

## Commands

```bash
# Development
yarn dev                      # Start with hot-reload (medusa develop)
yarn build                    # Build for production (medusa build → .medusa/)
yarn start                    # Start built production server
yarn seed                     # Run src/scripts/seed.ts

# Database
yarn medusa db:migrate        # Run pending migrations

# Tests
yarn test:unit                # Unit tests in src/**/__tests__/**/*.unit.spec.ts
yarn test:integration:http    # HTTP integration tests in integration-tests/http/
yarn test:integration:modules # Module integration tests in src/modules/*/__tests__/

# Docker
yarn docker:up                # docker compose up --build -d (dev)
yarn docker:down              # docker compose down (dev)
docker compose -f docker-compose.production.yml up -d --build  # Production deploy
```

## Architecture

Medusa v2 uses a **file-system-based convention** where directory structure determines behavior. All customization lives under `src/`:

| Directory | Purpose |
|---|---|
| `src/api/` | Custom API routes. `admin/` routes require admin auth; `store/` routes are public. File path maps to URL: `src/api/store/foo/route.ts` → `GET /store/foo` |
| `src/modules/` | Custom Medusa modules (data models, services, migrations). Each module has its own `__tests__/` subfolder for integration tests. |
| `src/workflows/` | Medusa workflows (saga-style business logic composed of steps) |
| `src/subscribers/` | Event subscribers (react to domain events) |
| `src/jobs/` | Scheduled jobs |
| `src/links/` | Module link definitions (foreign keys between modules) |
| `src/admin/` | Admin dashboard UI extensions (React components injected into the Medusa admin) |
| `src/scripts/` | One-off scripts run via `medusa exec` (e.g., `seed.ts`) |

**Route handlers** export named HTTP method functions (`GET`, `POST`, etc.) using `MedusaRequest`/`MedusaResponse` from `@medusajs/framework/http`.

**Config** is in `medusa-config.ts` — reads env vars via `loadEnv()`, configures CORS, JWT/cookie secrets, and database connection. SSL is disabled (`sslmode: "disable"`), so DATABASE_URL must point to a local/internal Postgres.

## Environment

Dev docker-compose provides Postgres on `5432` and Redis on `6379`. The Medusa container mounts the repo at `/server` with a volume exclusion for `node_modules`.

Required env vars: `DATABASE_URL`, `REDIS_URL`, `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET`.

Copy `.env.production.template` → `.env.production` for production secrets (never commit).

## Build Output

`yarn build` compiles everything into `.medusa/` (gitignored). Production Docker copies `.medusa/` from the builder stage.
