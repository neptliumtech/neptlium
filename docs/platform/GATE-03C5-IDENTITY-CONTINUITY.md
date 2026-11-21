# Gate 03C.5 — Durable identity continuity and tenant isolation

**Status: STAGED repository implementation. Supabase Auth remains CURRENT.**

## Staged implementation

- The unregistered API gate verifies the configured exact issuer, audience, authorized party and RS256 signature, and requires a signed session ID. It checks that session against the Clerk Backend API using an independently provisioned Production instance key. Every lookup requires current active status and matching session and subject identifiers.
- The forward-only migration creates an empty issuer-bound link table. Its owner-only enrollment command pins the existing active Supabase mapping and principal. PostgreSQL uniqueness and conflict handling protect exact retries and reject competing mappings. The owner-only revocation command records evidence and keeps revoked bindings reserved.
- The service-role read RPC evaluates the link, pinned Supabase mapping, principal and tenant membership together. An inactive row, missing evidence or storage failure denies access.
- New principal bootstrap is disabled. The staged API has no write path, and the only enrollment command requires an existing principal. New-account creation and its recovery procedure require separate approval.

## Required production identity contract

1. **Issuer isolation:** Production Clerk subject links must be bound to the approved Production issuer/instance, not merely `provider=CLERK` and `provider_subject`. Verify the actual identity schema and constraints first. Do not silently reinterpret existing Development links as Production links.
2. **Continuity:** Existing active Supabase Auth subject → Neptlium principal → active Production Clerk link must be a one-to-one, auditable transition. Preserve principal UUID, ledger ownership, audit and policy state. Never link by email alone.
3. **Tenant isolation:** Membership is evaluated on the requested organization and the same principal; conflicting, duplicate, revoked, suspended and cross-tenant rows deny.
4. **Revocation:** Deny revoked Clerk identity links, suspended/retired principals and revoked organization memberships immediately on the next authoritative store read. Independently validate Clerk session revocation and token lifetime; JWT signature alone does not prove that a session remains active.
5. **Onboarding:** New principal bootstrap must be transactional/idempotent with unique constraints and no duplicate ownership. Keep it disabled until schema, recovery and release approvals exist.
6. **Availability:** Storage/network errors, invalid response shapes and ambiguous mappings fail closed. Never fall back to an email match, Preview data, cached membership or a different provider.
7. **Environment:** Verify Production/Preview database project refs and issuer bindings independently; no service-role credential in browsers.

## Evidence required before activation

- Verify the Production Clerk Backend API credential against the approved Clerk instance and the database project against the approved environment. Exercise revocation using an authorized Production test session only after separate approval.
- Verify deployment migration ordering and rollback in an isolated database. Demonstrate concurrency-safe new-account provisioning and recovery before asking to enable bootstrap.
- Require independent Production recovery proof and explicit owner approval for any migration or authentication activation.

**Release guard:** No Production route registration, Clerk cutover flags, Supabase Auth retirement, Production migration, merge to main or deployment is authorized by this document.
