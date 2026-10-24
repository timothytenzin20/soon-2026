# Mold Busters, AI preliminary screening (prototype)

Video-first, evidence-linked preliminary mold/moisture screening with a private operations console.
Scope and roadmap: [`PLAN`](docs/ARCHITECTURE.md#source-plan) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Status: [`docs/TASKS.md`](docs/TASKS.md)

> This is **not** a certified inspection tool. Pricing, policies, legal wording and model accuracy are **unapproved placeholders**.

## Quick start (Windows/macOS/Linux)

Requirements: Node ≥ 20.12, pnpm 10, Docker (for Postgres). FFmpeg/ffprobe are bundled via npm.

```bash
pnpm install
cp .env.example .env          # already done in this checkout
pnpm db:up                    # Postgres 16 on localhost:54329
pnpm db:seed                  # migrations + org + 5 demo staff roles + fictional contractors
pnpm dev                      # web on http://localhost:3100 + background worker
```

- Customer flow: http://localhost:3100 → *Start a screening*
- Staff console: http://localhost:3100/admin/login (one-click dev login per role; disabled in production)
- Design primitives: http://localhost:3100/dev/components

### Sample pack demo
Unzip `Mold-Busters-Hackathon-Sample-Pack-v2.zip` into `./reference/` (gitignored), then:

```bash
pnpm demo:sample              # runs the silent walkthrough + 3 stills through the real pipeline
```

The reference report and job findings are **never** used as inputs.

### AI model (OpenAI gpt-4.1)
OpenAI is the default (`AI_PROVIDER=openai`, model `gpt-4.1` for both steps). Put your key in `.env` as `OPENAI_API_KEY=sk-...`, then run `pnpm ai:check` (one tiny live request; if the model isn't available to your key it lists the ones that are) and restart `pnpm dev`.

Switch models with `OPENAI_VISION_MODEL` / `OPENAI_TEXT_MODEL` (for example `gpt-4.1-mini` for lower cost). Claude remains available with `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`. Cost tracking uses `OPENAI_PRICE_*` from `.env`; verify those against current pricing.

Without a key, screenings fail visibly with `ai_not_configured` and the admin console shows a red banner. Nothing silently falls back.

What the model does:
- **Vision**: describes visible evidence per frame (structured JSON, frame-referenced), flags frames showing people or documents, and ranks which approved follow-up questions the media cannot answer.
- **Summary**: writes the plain-language summary from validated facts only. It must pass the same claims gate, otherwise the rule-based summary is used.

`AI_PROVIDER=mock` runs an offline pixel heuristic for demos and tests only. Its results are labelled "Demo mode" and never "qualified".

## Tests

```bash
pnpm test                     # 59 unit + integration tests, incl. the Claude adapter against a simulated API (in-memory Postgres via PGlite; uses sample media if present)
pnpm typecheck
pnpm exec tsx scripts/e2e-browser.ts   # 34 browser checks + screenshots → .data/screens (needs dev servers running; uses system Edge)
```

## Layout

```
apps/web          Next.js 15, customer + admin UI, API routes
apps/worker       Durable job worker (media + model loops)
packages/domain   State machines, RBAC, question bank, claims policy, guidance (pure)
packages/db       Drizzle schema, migrations, job queue, audit
packages/media    Signature sniffing, ffprobe/ffmpeg, frame extraction/selection
packages/storage  Private object store + HMAC-signed short-lived URLs
packages/ai       VisionModel interface, Anthropic adapter, mock
packages/reporting Deterministic synthesis + validation gate
packages/pipeline Stages, intake services (authz-enforced), seed
packages/ui       Design tokens
packages/payments, packages/integrations   Phase 3/4 placeholders
```
