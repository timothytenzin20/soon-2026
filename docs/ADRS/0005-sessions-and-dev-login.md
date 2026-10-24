# ADR-0005: Opaque DB sessions now; managed identity provider later

Status: accepted for prototype

## Decision
- Customers start anonymously: creating an assessment creates a minimal customer profile and a 30-day httpOnly, SameSite=Lax session cookie (random 256-bit token; only SHA-256 stored).
- Staff sessions are 12 h and carry `reauthenticated_at` (owner-only actions require re-auth within 10 min, enforced in `authorize`).
- A one-click **dev login** for seeded roles exists for local QA; `readFlags()` hard-disables it when `NODE_ENV=production`.
- Production staff auth: managed IdP with MFA (Phase 5). Customer revisit across devices: email magic link (Phase 3; `magic_links` table exists).

## Consequences
− Clearing cookies loses access to an anonymous screening until email verification ships.
