# ADR-0001: Modular monolith in a pnpm TypeScript monorepo (Next.js + worker)

Status: accepted (2026-10-24)

## Context
Empty repository; PLAN §4 recommends TypeScript, Next.js, PostgreSQL, async workers, and warns against premature microservices.

## Decision
- pnpm workspaces; `apps/web` (Next.js 15 App Router) and `apps/worker` (tsx/Node).
- Internal packages are consumed as TypeScript source (`exports` → `src/index.ts`), transpiled by Next (`transpilePackages`) and tsx. No per-package build step.
- Business logic (authorization, intake services, pipeline stages) lives in packages, so it is testable without HTTP and reused by the worker and scripts.
- Native/binary packages (`sharp`, `ffmpeg-static`, `pg`, `@electric-sql/pglite`, Anthropic SDK) are `serverExternalPackages` and **direct dependencies of apps/web** (pnpm's strict layout otherwise hides them from Next's runtime resolver).

## Consequences
+ One deploy unit for web; workers scale independently by process count.
− Packages must stay Node-free when imported by client components; `@mb/domain` exposes browser-safe subpaths (`/enums`, `/questions`).
