# Gate 03C.5 — Durable identity continuity and tenant isolation

**Status: implementation design / review required. Not a production certification.**

## Verified source behavior

- The staged Production Clerk gate verifies the configured exact issuer, audience, authorized party and RS256 signature before resolving a subject. It is not registered in Production routes.
- The gate currently accepts an injected `ClerkPreviewIdentityStore` contract. The existing Supabase implementation looks up one ACTIVE `CLERK` subject mapping, then one active principal.
- Organization membership is checked by resolving exactly one active `SUPABASE_AUTH` subject for that same principal and looking up an active, non-suspended, non-revoked `organization_memberships` row.
- The lookup currently keys `CLERK` mappings by provider and subject, not by issuer or Clerk instance. This is not evidence that Development and Production identities are isolated.
- No onboarding/bootstrap write is implemented by this read-only gate. The current Supabase Auth runtime remains authoritative.

## Required production identity contract

1. **Issuer isolation:** Production Clerk subject links must be bound to the approved Production issuer/instance, not merely `provider=CLERK` and `provider_subject`. Verify the actual identity schema and constraints first. Do not silently reinterpret existing Development links as Production links.
2. **Continuity:** Existing active Supabase Auth subject → Neptlium principal → active Production Clerk link must be a one-to-one, auditable transition. Preserve principal UUID, ledger ownership, audit and policy state. Never link by email alone.
3. **Tenant isolation:** Membership is evaluated on the requested organization and the same principal; conflicting, duplicate, revoked, suspended and cross-tenant rows deny.
4. **Revocation:** Deny revoked Clerk identity links, suspended/retired principals and revoked organization memberships immediately on the next authoritative store read. Independently validate Clerk session revocation and token lifetime; JWT signature alone does not prove that a session remains active.
5. **Onboarding:** New principal bootstrap must be transactional/idempotent with unique constraints and no duplicate ownership. Keep it disabled until schema, recovery and release approvals exist.
6. **Availability:** Storage/network errors, invalid response shapes and ambiguous mappings fail closed. Never fall back to an email match, Preview data, cached membership or a different provider.
7. **Environment:** Verify Production/Preview database project refs and issuer bindings independently; no service-role credential in browsers.

## Evidence and acceptance tests required before activation

- Inspect actual migration/schema definitions for `identity_provider_subjects`, `identity_principals` and `organization_memberships`, including uniqueness, RLS and status constraints.
- Prove exact Production issuer binding and negative cross-instance subject collision.
- Exercise active continuity, duplicate/conflicting mappings, missing/revoked link, suspended/retired principal, wrong tenant, duplicate/revoked membership and storage failure.
- Demonstrate identity-link and membership revocation without touching financial ownership, plus separate Clerk session revocation tests against an actual approved Production session.
- Demonstrate deterministic, concurrency-safe bootstrap and rollback in an isolated database before proposing any Production migration.
- Run API build, typecheck, lint, focused tests and CI. Review effective deployed secrets/project refs separately.
- Require independent Production recovery proof and explicit owner approval for any migration or authentication activation.

**Release guard:** No Production route registration, Clerk cutover flags, Supabase Auth retirement, Production migration, merge to main or deployment is authorized by this document.
