# Architecture

<a id="source-plan"></a>Source of scope: `PLAN (2).md` ("Mold Busters, Implementation Plan for Opus", 2026-10-24). This document describes what is **built**, and marks what is not.

## Shape

Modular monolith + async workers (ADR-0001), TypeScript pnpm monorepo.

```
 Browser (customer, 360px+)          Browser (staff)
        │  JSON + chunked PUT              │  server components + server actions
        ▼                                  ▼
 ┌──────────────── apps/web (Next.js 15) ─────────────────┐
 │ API routes: authz → @mb/pipeline intake services       │
 │ /api/media/[token]: HMAC-verified private media (Range) │
 └──────────────┬─────────────────────────────┬───────────┘
                │ enqueue (idempotent)         │ reads
                ▼                              ▼
        ┌──────────── PostgreSQL ──────────────────────┐
        │ jobs (SKIP LOCKED) · outbox · audit (append-  │
        │ only trigger) · assessments · evidence · reports│
        └──────────────┬───────────────────────────────┘
                       │ claim
                       ▼
 ┌──────────────── apps/worker ───────────────────────────┐
 │ media loop (FFmpeg)        model loop (vision + rules) │
 │ media.process              assessment.observe          │
 │                            assessment.synthesize        │
 └──────┬──────────────────────────────┬──────────────────┘
        ▼                              ▼
  Private object store          VisionModel (Anthropic | mock)
  (local FS driver; S3 next)    images + approved enums only
```

## Data flow (vertical slice, implemented)

1. **Intake**, `POST /api/assessments` validates enums + two explicit consents, creates an anonymous customer profile and an httpOnly session cookie. No contact data collected.
2. **Resumable upload**, `POST …/uploads` creates/resumes a session keyed by a browser fingerprint; `PUT /api/uploads/:id?offset=N` appends ≤8 MB chunks (409 returns the server offset); `…/complete` creates a *quarantined* `media_assets` row and enqueues `media.process`.
3. **ValidateMedia + PrepareMedia** (`packages/pipeline/src/media-stage.ts`), size check, magic-byte sniffing (extension and declared MIME are ignored), SHA-256 dedupe, ffprobe duration limit, privacy proxy (H.264, audio stripped, metadata stripped), frame sampling every N s, per-frame quality (sharpness, brightness, average-hash scenes), deterministic frame selection, stills re-encoded (strips EXIF/GPS). Writes an immutable `media_manifests` row.
4. **Submit** → `assessment.observe` (defers without consuming attempts until media is terminal).
5. **ObserveVisuals**, bounded frames (default 12, round-robin across assets) downscaled to ≤1024 px and sent with *only* approved area/concern enums (free-text statements never reach the model, prompt-injection surface). Output is schema-validated; unknown frame IDs dropped; frames flagged `privacyConcern` are tagged `privacy_review` and contribute no observations. Run cost/tokens/trace recorded in `assessment_runs`.
6. **SelectFollowups**, deterministic rules over the versioned question bank (≤8, safety-relevant first, "Not sure" always available) → `needs_answers`.
7. **Answers**, validated strictly against approved options; "Skip remaining" allowed.
8. **SynthesizeFindings + ValidateReport** (`packages/reporting`), deterministic composition from the evidence snapshot only; every finding cites evidence; outcome `qualified | limited | inconclusive`; claims policy (species, toxicity, "mold confirmed", %, medical, physical tests, costs…) applied to model text (offending observations excluded) and to every generated string. On failure: fail closed to an honest inconclusive report.
9. **Publish** (feature flag) → free preview (summary, unknowns, safety guidance, next steps); full report rendered only with an entitlement (none issued until Phase 3). Outbox email only to a verified address.
10. **Admin**, queue, case workspace (video + clickable timeline, frames, observations with provenance, customer context, report + gate result, runs/cost, audit), elevated access grants, assignment, retry, observation corrections.

## Key boundaries

| Concern | Where | Notes |
|---|---|---|
| Authorization | `packages/domain/src/authz.ts` | pure, deny-by-default; called inside every service function, not only in routes |
| Customer IDOR | `assessmentResource()` + 404 mapping | other customers' cases are indistinguishable from non-existent |
| CSRF | `assertSameOrigin()` on cookie-auth mutations; server actions use Next's origin check | |
| Private media | `packages/storage` | only `/api/media/<hmac-token>`; tokens 5 to 30 min; issued after `media.read` check |
| Durable jobs | `packages/db/src/queue.ts` | idempotency keys, SKIP LOCKED, exponential backoff, dead-letter, stale-lock recovery |
| Audit | `audit_events` + trigger | UPDATE/DELETE raise; metadata redacted |
| Logs | `packages/observability` | JSON lines, trace IDs, key + pattern redaction |

## Not built yet (see TASKS.md)
Payments/entitlements (schema only), email magic-link revisit, managed auth/MFA, S3 driver, transcription, referral workflow, integrations (all mock), PDF export, load tests, retention jobs.
