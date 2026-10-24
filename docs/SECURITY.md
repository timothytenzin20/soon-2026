# Security & privacy

## Role matrix (enforced in `packages/domain/src/authz.ts`, tested in `packages/domain/test/authz.test.ts`)

| Action | customer | service_worker | staff | manager | owner |
|---|---|---|---|---|---|
| Read own assessment / preview / media | own only | - | - | - | - |
| Full report | own + entitlement | job-scoped | assigned or grant | ✓ | ✓ |
| Case media & context | - | job-scoped | assigned or approved grant | ✓ | ✓ |
| Queue (operational, no PII/media) | - | - | ✓ | ✓ | ✓ |
| Request elevated access | - | - | ✓ | ✓ | ✓ |
| Approve access, assign, override, contractor edits, analytics, audit, settings read | - | - | - | ✓ | ✓ |
| Roles, billing, AI policy, refunds, contractor export | - | - | - | - | ✓ + re-auth ≤10 min |

Cross-org access is denied before any other rule. Customers receive **404** (not 403) for others' resources.

## Controls implemented
- Server-side authorization inside every service function (`packages/pipeline/src/intake.ts`) and page; elevated access grants are time-limited (4 h), need a different manager, and are audited; staff media views are audited (`media.viewed`).
- Private storage with path-traversal-safe keys; media only via HMAC-signed, expiring tokens issued after a `media.read` check; `Range` support; `nosniff`.
- Upload hardening: declared-MIME allowlist, magic-byte sniffing, size/duration limits, max files per case, chunk size limit, offset verification, dedupe; images re-encoded (EXIF/GPS stripped); video proxy without audio/metadata.
- CSRF: same-origin check on cookie-authenticated API mutations; server actions rely on Next's origin check. Verified by browser test.
- Sessions: random tokens, hashed at rest, httpOnly, SameSite=Lax, Secure in production, revocable.
- Prompt-injection: free-text customer input never reaches the model; image text is declared untrusted in the system prompt; model output schema-validated; claims policy gate.
- Privacy guard: frames the model flags as showing people/documents are tagged `privacy_review` and excluded from observations.
- Security headers (nosniff, frame DENY, referrer policy, permissions policy). Logs redact emails, phones and sensitive keys.
- In-memory rate limits on intake/upload (per instance).

## Known gaps (must close before launch)
1. **Faces in media.** The sample walkthrough shows a person's face (~0:04). Measured 2026-10-24: gpt-4.1 returned `privacyConcern: false` for that frame, so the model flag is not a reliable control. Faces are kept out of customer reports (only frames with observations are shown), but the frame is still sent to the AI provider and shown to staff. Add an on-box face/document detector + blur before model calls and staff display.
2. Managed IdP + MFA for staff; email verification for customers (magic links).
3. Rate limiting and sessions must move to shared storage before horizontal scaling.
4. Malware scanning of uploads (ClamAV or provider scanning), currently signature checks only.
5. S3 driver with bucket policies, KMS, lifecycle; secret management and rotation.
6. CSP header; dependency and container scanning; pen test.
7. Retention/deletion jobs and customer deletion requests; access-log export.
8. Counsel review for PIPEDA and Quebec Law 25 (cross-border transfer to AI provider, consent wording, residency).
