# ADR-0003: Durable jobs in Postgres (SKIP LOCKED) instead of an external queue

Status: accepted for V1; revisit at measured throughput limits

## Decision
`jobs` table with unique idempotency keys, `FOR UPDATE SKIP LOCKED` claiming, exponential backoff (5 s × 4ⁿ, ≤15 min), dead-letter after `max_attempts`, stale-lock recovery, and a non-consuming `deferJob` for "waiting on media". Separate worker loops for media vs model job types (separate compute profiles, PLAN §4). Side effects (email) go through an `outbox` table written in the same flow.

## Why
No new infrastructure, transactional with domain writes, observable with SQL. Throughput needs are unknown (PLAN §15.6).

## Exit criteria
Move to a managed queue/workflow engine (e.g. SQS + Step Functions, Temporal) if queue age p95 or DB load from polling become limiting under load tests.
