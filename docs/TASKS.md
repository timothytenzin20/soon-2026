# Status & prioritized task list

Updated 2026-10-24. ✅ done · 🟡 partial · ⬜ not started

## Phase 0, Repository & assumptions
- ✅ Monorepo, TS strict, Vitest, env example, Docker Postgres, seed (org, 5 roles, fictional contractors)
- ✅ ADRs 0001 to 0006, architecture, data model, security, AI eval docs
- ⬜ CI pipeline (lint/typecheck/test on push), ESLint config
- ✅ Business unknowns as flags/config: billing off, price unset, referrals off, integrations mock

## Phase 1, Design system & secure substrate
- ✅ Tokens + component CSS, `/dev/components` examples; text wordmark placeholder (official logo needs permission)
- ✅ Schema + migrations, append-only audit, immutable manifests
- ✅ Sessions, RBAC with tests (IDOR, cross-org, re-auth), elevated access grants
- ✅ Private storage, signed media URLs, resumable chunked uploads (pause/resume/retry)
- ✅ Assessment state machine with compare-and-set transitions
- ✅ Screenshot QA at 360/390/1366 + no-overflow checks (`scripts/e2e-browser.ts`)
- 🟡 Accessibility: labels, focus management, skip link, reduced motion, 44 px targets, no screen-reader / axe audit yet

## Phase 2, Evidence processing & agents
- ✅ Media validation, proxy, frame sampling/quality/scenes/selection, manifest
- ✅ VisionModel interface, Anthropic adapter, mock; cost/tokens per run; privacy flag
- ✅ Versioned question bank (9 questions, metric sizes), max 4 per case, Claude ranks within approved set, safety questions always kept
- ✅ Durable jobs, retries, dead-letter, deferral, stale-lock recovery
- ⬜ **Face/document detection + blurring before model and staff display** (top priority)
- ✅ Model adapters for OpenAI (default, gpt-4.1) and Claude: vision + summary, tested against simulated APIs, `pnpm ai:check`
- ⬜ Run gpt-4.1 on the sample pack and record observed quality/cost (needs OPENAI_API_KEY)
- ⬜ Transcription interface behind separate consent
- ⬜ Media cache by hash across re-runs; model escalation on uncertainty

## Phase 3, Reports & monetization
- ✅ Synthesis, validation gate, fail-closed fallback, preview vs full projection, entitlement-gated report page
- ⬜ Checkout (Stripe test mode), signed webhook verification, idempotent entitlement issuance/revocation, duplicate/out-of-order tests
- ⬜ PDF rendering + versioned download
- ⬜ Email magic-link verify/revisit; outbox sender
- ⬜ "Add more evidence" path from inconclusive results

## Phase 4, Admin operations
- ✅ Overview, queue + filters, case workspace (timeline seek, frames, observations, context, report gate, runs, audit), assignment, retry, observation corrections, contractors directory with filters + unverified markings, analytics (measured only), settings (read-only)
- ⬜ Service jobs CRUD + booking; referral proposal → consent → approval workflow
- ⬜ Integration adapters (Close, FreshBooks, Asana, Calendar, Dialpad) with sync state
- ⬜ Settings editing with owner re-auth

## Phase 5, Hardening
- ⬜ Items in SECURITY.md "Known gaps"; load tests; backups; runbooks; staged rollout

## Open business questions (PLAN §15), not blocking the prototype
Pricing/refunds; approved screening criteria and legal wording; who owns follow-up; integration priorities + credentials; retention, residency, consent text, French; model budget and latency targets.
