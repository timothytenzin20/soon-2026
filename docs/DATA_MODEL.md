# Data model

Source of truth: `packages/db/src/schema.ts` → migrations in `packages/db/drizzle/`.

## Entities (PLAN §5 mapping)

| PLAN entity | Table | Notes |
|---|---|---|
| Organization | `organizations` | single org now; `org_id` on every tenant row |
| User / Membership | `users`, `memberships` | role ∈ customer, staff, manager, owner, service_worker |
| CustomerProfile | `customer_profiles` | starts anonymous (no contact data) |
| Property | `properties` | approximate region only; `exact_address_encrypted` reserved |
| Assessment | `assessments` | status machine, `version` for optimistic concurrency, `priority` set by rules |
| Concern / Answer | `concerns`, `answers`, `pending_questions` | answers unique per (assessment, question, source); staff corrections use `source = staff_correction` |
| MediaAsset | `media_assets` (+ `upload_sessions`) | private object keys only; quarantine → ready/rejected |
| MediaFrame / TranscriptSegment | `media_frames`, `transcript_segments` | frames carry timestamp, quality flags, selection; transcripts unused (no consent flow yet) |
| (manifest) | `media_manifests` | immutable (UPDATE trigger) |
| Observation / Finding | `observations`, `findings` | observations status: active / superseded / rejected_by_staff |
| AssessmentRun | `assessment_runs` | model, prompt/rule versions, tokens, images, cost, duration, trace |
| ReportVersion | `report_versions` | validated JSON snapshot + validation result + input hash; status draft/validated/published/superseded |
| Order / Entitlement | `orders`, `payment_events`, `entitlements` | schema only (Phase 3); `payment_events.provider_event_id` is the idempotency ledger |
| ServiceJob / Contractor / Rate / Referral | `service_jobs`, `contractors`, `contractor_rates`, `referrals` | rate_type fixed/starting/hourly/quote_only; amount nullable = unknown |
| AuditEvent | `audit_events` | append-only (UPDATE/DELETE trigger) |
| - | `sessions`, `magic_links`, `consents`, `access_grants`, `jobs`, `outbox` | operational |

## State machines
`packages/domain/src/state-machines.ts`:
`draft → uploading → queued → processing ⇄ needs_answers → ready_preview | inconclusive | failed`; `ready_preview|inconclusive|failed → queued` (more evidence / retry). Transitions are compare-and-set on `status` (`transitionAssessment`). Payment state never writes assessment status.

## Deletion & retention
- Assessment children (concerns, answers, media, frames, observations, runs) cascade with the assessment.
- **Restricted** (no cascade): `report_versions`, `orders`, `entitlements`, `payment_events`, `service_jobs`, `referrals`. Audit rows cannot be deleted at all.
- `media_assets.retention_until` is set to a placeholder 365 days; no expiry job yet. Retention periods await privacy review (PLAN §15.5).

## Indexes
org/status/date on assessments, claim index on jobs(status, run_at), frame lookups by asset/timestamp, audit by resource and org/date.
