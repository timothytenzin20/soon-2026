# ADR-0004: The model only observes; rules synthesize and gate the report

Status: accepted

## Context
PLAN §0.5, §7: evidence-first, no unsupported diagnosis, automatic release only after deterministic validation.

## Decision
- The vision model returns **neutral, frame-referenced observations** in a strict schema. It receives images + approved enums only, never free-text customer input, DB access, or tools with side effects.
- Follow-up questions come only from the versioned approved bank via deterministic rules (a model may later rank within the eligible set).
- Report content is composed deterministically from the evidence snapshot (`packages/reporting/src/synthesize.ts`). Every finding cites evidence IDs; customer statements are labelled and never upgraded to observations ("reported odor" ≠ "detected odor").
- `validateReport` enforces the claims policy, grounding and disclosure. Failure → publish a minimal inconclusive report instead (fail closed).
- No numeric mold probability (PLAN §7.3). "Strength" describes how clearly the media shows a feature.

## Consequences
+ Reports are reproducible from `inputSnapshotHash`, auditable and testable.
− Prose is plainer than LLM-written prose. A later phase may let a text model *phrase* sections, but its output must pass the same gate.
