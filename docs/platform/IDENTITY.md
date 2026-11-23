# Identity and Access

## CURRENT — production authentication

Supabase Auth is Neptlium's sole production authentication and browser-session provider for customer and operator surfaces.

This applies to:

- `app.neptlium.com`
- `admin.neptlium.com`
- bearer-token authentication at `api.neptlium.com`
- authenticated Neptlium Treasury surfaces where applicable

Browser applications use only the Supabase project URL and publishable client key. Service-role credentials remain server-only.

## TRANSITION — isolated Clerk Preview migration

Gate 03C.5 permits customer authentication and session migration work in isolated Preview deployments. Use nonproduction Clerk instances, credentials, redirect origins and isolated data and persistence. Preview sessions, tokens and mappings cannot grant production access. Production continues to accept only Supabase Auth for authentication. Browser code may receive the nonproduction Clerk publishable key in Preview. Clerk secrets and Supabase service-role credentials remain server-only.

The API must verify Clerk token signature, issuer, audience, authorized parties, expiration and signing-key rotation against the intended environment. Resolve the verified provider subject through a unique, durable, active link to the existing immutable Neptlium principal. Unlinked subjects and missing, ambiguous, suspended, revoked or unavailable mappings fail closed. Email matching, user-editable metadata, client-supplied IDs and Clerk organization claims cannot establish ownership or membership.

Where organization membership still references `auth.users.id`, resolve the verified legacy UUID through the same stable principal and enforce active membership and server-owned role, policy and resource ownership checks. Preserve existing Supabase RLS and database constraints. Missing or conflicting linkage denies tenant access.

### Preview customer flow

Enter at `/preview/clerk` on the isolated App origin. Clerk sign-in and sign-up lead to a read-only Preview dashboard. The App checks the active Clerk session server-side and sends a template JWT to `GET /v1/preview/clerk/session` on the dedicated Preview API. The organization UUID selects the tenant to check. The API verifies the token and checks the issuer-bound Clerk subject link, active principal, active legacy Supabase subject, and active membership in one database read. Membership must bind the same principal, legacy user and organization. The endpoint accepts server-to-server GET requests without an Origin header and grants no browser CORS access. Sign-up creates a Clerk identity. A reviewed durable link and membership in the isolated Preview database remain prerequisites to dashboard access. The dashboard has no financial commands or entitlement provisioning.

For isolated acceptance, configure both surfaces with `NEPTLIUM_API_AUTH_PROVIDER=clerk-preview` and the same `NEPTLIUM_CLERK_PREVIEW_APP_ORIGIN`. The App disables the Preview entry when required App configuration is missing or invalid. The App uses Clerk test keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`), `NEPTLIUM_CLERK_PREVIEW_API_ORIGIN`, and `NEPTLIUM_CLERK_PREVIEW_TOKEN_TEMPLATE`. The API uses the Clerk development issuer and the JWT template audience in `NEPTLIUM_CLERK_PREVIEW_ISSUER` and `NEPTLIUM_CLERK_PREVIEW_AUDIENCE`. Use a [short-lived Clerk JWT template](https://clerk.com/docs/guides/sessions/jwt-templates) with that audience and a token lifetime of at most 120 seconds. The API requires the App origin as the token’s authorized party. Sign-out ends the App session. A previously issued template bearer expires independently within the configured lifetime, and the API continues to check current database authorization on each request. Use the canonical Neptlium Dev project origin for both `SUPABASE_URL` and `NEPTLIUM_CLERK_PREVIEW_SUPABASE_URL` on the Preview API. The serverless bootstrap also needs the Dev Supabase anon and service-role credentials. Set `NEPTLIUM_CLERK_PREVIEW_SUPABASE_SERVICE_ROLE_KEY` to a Dev service-role credential. The API also requires the existing readiness gates `NEPTLIUM_CLERK_API_VERIFIER_TESTED`, `NEPTLIUM_CLERK_IDENTITY_RESOLVER_TESTED`, and `NEPTLIUM_CLERK_TENANT_ISOLATION_TESTED`. The App server must be able to reach the Preview API through its deployment access controls. Validate sign-in, sign-up, linked and unlinked access, cross-tenant denial, and sign-out on the exact isolated deployment before accepting the flow.

## TARGET — Clerk customer authentication

Clerk is approved for customer sign-in, sign-up, MFA, recovery and sessions. Supabase/PostgreSQL continues to own persistence. Neptlium principals and server-owned roles, membership, policy, resource ownership and financial authorization continue to govern access. Changes to Admin and Treasury authentication require separate review and approval.

Production cutover requires separate explicit approval after independent review and verified evidence of account continuity, tenant isolation, API authorization, Supabase RLS, Preview tests and builds, session transition, backups and rehearsed rollback. Preserve existing Supabase users, mappings, session recovery and rollback paths so the prior authentication route can be restored without changing ownership or financial history. See the [Clerk migration safety contract](../security/clerk-primary-auth-migration.md) and [Preview identity verification ledger](../security/clerk-preview-identity-phase1.md).

## Identity model

Authentication and business identity remain separate concepts.

1. **Supabase Auth subject** — authenticated `auth.users.id` UUID.
2. **Neptlium principal** — stable internal UUID used for ownership, authorization, policy, audit, and ledger attribution.
3. **Identity mapping** — active `SUPABASE_AUTH` subject to Neptlium principal mapping.
4. **Authorization** — Neptlium-owned roles, organization membership, compliance state, entitlements, policy, and resource ownership.

A valid Supabase session proves authentication. It does not by itself authorize a treasury, allocation, administrative, organization, provider-execution, or financial operation.

## Existing-account continuity

Existing principal UUIDs and financial ownership must be preserved. Authentication migration is forward-only and must not rewrite balances, ledger entries, audit records, provider evidence, or ownership UUIDs.

For existing accounts, the active Supabase Auth subject must resolve deterministically to the preserved Neptlium principal. Ambiguous, conflicting, missing, suspended, or retired mappings fail closed.

Historical identity-provider mapping rows may remain as inert migration/audit evidence. They are not accepted runtime credentials unless the current runtime explicitly supports that provider; production supports only `SUPABASE_AUTH`.

Email may assist account communication and onboarding but must not be used as privileged authorization or as a substitute for immutable subject identity.

## Customer application

`apps/app` uses shared Supabase browser/server clients, session refresh, Neptlium-owned sign-in/sign-up UI, and server-side session APIs. Its API client obtains the current Supabase access token and sends it to `apps/api` as a bearer token.

Account provisioning and onboarding read/write Neptlium business state through `apps/api`; API availability must not be confused with authentication-session validity.

### CURRENT — App Account entry and session return

`apps/app/app/(auth)/auth-utils.ts` owns the App return-destination contract. Producers write `next`. Account entry also accepts previously issued `redirect_url` links: a present `next` takes precedence, even if invalid or empty; duplicate occurrences of either parameter use the safe `/dashboard` default. No destination also uses that default.

Server entry pages, the App proxy, legacy entry aliases and the authentication callback use the same resolver. Sign-in/sign-up switching, errors/retries, session-expired entry, successful sign-in and both sign-up session/confirmation paths preserve the validated destination. Form rendering does not depend on a client-only search-parameter suspense region.

Only implemented App dashboard page paths and `/onboarding` are supported, with non-secret query state. External/protocol-relative URLs, malformed encodings, controls, backslashes, encoded path-separator ambiguity, auth/API destinations and unsupported pages fall back to `/dashboard`. Fragments are discarded. Authentication codes, credentials and session tokens are not return state. Cross-surface returns are not enabled by this contract. Route additions must update the resolver's page inventory and its behavioral coverage.

The App proxy overwrites the private request header `x-neptlium-account-return` before forwarding session refresh. Server guards use this validated navigation context to preserve the route if the session disappears between proxy and rendering/action execution. A caller-supplied header is never trusted, and the header never conveys principal or access authority.

Explicit onboarding entry may carry `next` to a dashboard destination; it is retained across authentication and used after successful provisioning or when already provisioned. An onboarding return cannot recursively target onboarding. Without that explicit destination, completion retains `/dashboard`. This does not add a mandatory onboarding gate or change provisioning policy.

The requested route remains subject to existing server session, principal, role, organization-membership, ownership and API policy enforcement. A valid return URL is navigation context, never authorization. Password-recovery implementation and provider email activation are outside this contract. Candidate source/build verification must remain separate from exact-deployment authenticated runtime acceptance.

## Admin application

`apps/admin` uses Supabase Auth for operator authentication. The API resolves the Supabase identity to a Neptlium principal, then enforces operator roles and domain authorization server-side.

Dashboard access requires explicit server-owned administrative authorization. Authentication alone is never sufficient.

## Neptlium Treasury

Neptlium Treasury uses Supabase Auth for user identity. Organization authority, treasury permissions, approvals, policy, and payment execution remain separate server-owned authorization domains.

## API

The API verifies Supabase access tokens, obtains the immutable authenticated subject, resolves the `SUPABASE_AUTH` subject through durable identity storage, and performs server-side authorization from the stable principal.

Missing mapping storage, invalid token, ambiguous mapping, suspended/retired principal, or unavailable identity infrastructure fails closed.

## Onboarding, profile and identity verification

Four account states are separate and none implies another: **authentication** (Supabase Auth session; proves identity of the session only), **onboarding** (profile setup), **account standing** (operator suspend/activate decisions) and **identity verification**. None of them authorizes regulated financial activity; financial routes keep their own authorization chain and do not consult these states.

### CURRENT

- `GET /v1/account/status` returns `onboarding` (`NOT_STARTED`/`IN_PROGRESS`/`COMPLETED`, derived from `profiles.provisioned_at` and the onboarding draft), `standing` (`RESTRICTED` only for `suspended`/`revoked`) and `identity_verification`.
- `profiles.compliance_status` is account standing. It defaults to `pending` for every account, `complete_account_onboarding` writes `pending`, and Admin writes `active`/`suspended`. It is never presented as a verification outcome.
- Identity verification status comes only from Neptlium verification records through the `IdentityVerificationRecordStore` boundary in `apps/api/src/identity-verification.ts`. Providers implement the domain-specific `IdentityVerificationProvider` contract. A provider without a durable record store is not offered. Starting a provider session is not a submission and changes no status.
- No provider or record store is reviewed, so the API runs `DisabledIdentityVerificationProvider` with `UnconfiguredIdentityVerificationRecords`: `capability: NOT_ENABLED`, `record: NOT_CONFIGURED`, `can_start: false`, and session start returns `503 identity_verification_not_enabled`. The App shows a truthful "isn't available yet" state with no status chip and no submission flow.
- `POST /v1/account/profile` updates `first_name`, `last_name` and `display_name` only. Legal-name changes are refused while a record is `PENDING`/`VERIFIED` and fail closed when records cannot be read.
- The App dashboard never redirects to onboarding. It shows a non-blocking setup prompt only when the API reports onboarding incomplete; unknown state shows nothing. Onboarding redirects only forward to the dashboard, so no redirect loop exists.
- Password recovery uses the dedicated `/auth/recovery` exchange (not `/auth/callback`). A short-lived httpOnly marker limits the no-current-password `/reset-password` form to recovery-link sessions; a successful reset signs out all sessions. In-session password changes re-verify the current password.

### TARGET (requires separate authorization)

- A reviewed `identity_verifications` record store (forward migration, append-only status history, service-role writes only) and a provider adapter that verifies provider evidence before normalizing it into records.
- A notification-preference store; until then the App states preferences are not configurable.

## Persistence boundary

Supabase Auth is the current production authentication authority. Supabase/PostgreSQL remains the database and persistence platform through the transition and after any approved customer authentication cutover.

Allowed persistence uses include repositories, RLS/constraints, provider inboxes, identity mapping tables, audit, ledger-related data, and reconciliation. Service-role credentials are infrastructure authority, server-only, and never become user credentials.

## Security invariants

- Never log access tokens, refresh tokens, cookies, session identifiers, service-role keys, recovery material, or provider secrets.
- Never authorize privileged behavior from user-editable `user_metadata`.
- Email is an identifier/contact attribute, not privileged authorization.
- Every privileged action requires server-side role, policy, ownership, and state validation.
- Browser controls are defense in depth, not financial authorization.
- Session loss, mapping ambiguity, storage failure, or identity-provider outage fails closed for privileged operations.
- Identity migration never changes canonical financial ownership UUIDs.
- No browser application may receive the Supabase service-role key.
