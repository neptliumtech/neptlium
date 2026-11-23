# Gate 03C.15 hosted Clerk Preview acceptance

## Scope and current evidence

This runbook targets Neptlium Dev `ntbaoylcrwkowqqvzkno` in `us-east-2` and the `neptlium-app` and `neptlium-api` Vercel Preview deployments under `neptliumforge`. Hold PR #175 open. Use the stacked acceptance branch for review and designate one exact SHA and App/API deployment pair for a future approved run.

Read-only inventory on 2026-11-23 found PostgreSQL 17.11, SSL and archive mode on, an empty public schema, no migration ledger, zero Auth users and identities, and zero Storage buckets and objects. `pg_cron` and `pg_net` are available but uninstalled. `pg_stat_statements`, `pgcrypto`, the Supabase managed secrets extension and `uuid-ossp` are installed. Retained backups, restore entitlement and an actual Dev restore are unverified. No hosted schema, fixture, protection, or environment settings were changed.

Both Vercel projects report protection for deployments except custom domains. Their listed custom domains and unqualified Vercel aliases are production destinations. No deployments match the #175 head SHA. App Clerk keys are listed in Preview scope, and the only observed Preview App origin binding targets the older Gate 02 branch. The App's public Supabase URL and publishable key are shared across Production and Preview scopes. The required API Supabase bootstrap keys were listed only for Production. Effective masked values, branch overrides, and Trusted Sources settings need owner verification. Clerk lists a Neptlium development instance and a separate production instance. Development has public sign-up, required email verification, and password sign-in. Verify the effective development issuer, template, signing mode, and redirect behavior before seeding.

## Dev schema preflight and rollout

1. Independently match `ntbaoylcrwkowqqvzkno` in Supabase Dashboard, deployment credential provenance, and the database client connection. Use `db.ntbaoylcrwkowqqvzkno.supabase.co` with strict TLS and the project CA, or the Dashboard-verified session pooler with project-qualified credentials. The production ref is `udghxwlhztwxvkjaefjh`. Stop on any mismatch. Keep database passwords in the approved credential store and use an interactive prompt or restricted password file.
2. Recheck the initial inventory. An empty migration list with application objects present is drift. Confirm the managed `auth`, `storage`, and `extensions` schemas and the managed secrets schema created by the baseline extension, Supabase roles, privileges for baseline extension creation, and absence of active jobs/webhooks with outside destinations. Verify the Auth trigger is compatible with the target and that the deployment owner can create disposable Auth users. Take the recovery checkpoint described below before any remote apply.
3. Use a fresh checkout of the exact candidate SHA. Pin the ordered manifest below and its per-file digests. Run `git ls-files 'supabase/migrations/*.sql' | LC_ALL=C sort` and compare the 55 paths to the manifest. Record checksums with `git ls-files 'supabase/migrations/*.sql' | LC_ALL=C sort | xargs sha256sum` and verify them again before dry run and apply. Exclude `supabase/archive`, Edge Functions, seeds, and any later migration. The chain is a unit. The August/September migrations evolve and retire older identity and financial authority. Cherry-picking the November tail skips their dependencies.
4. On a disposable Supabase-compatible PG17 local stack with managed extensions and default roles, initialize the local CLI config in a disposable checkout if needed, start the local stack, and run `pnpm exec supabase db reset --local --no-seed`. Confirm all 55 versions were recorded in order. Rehearse the fixture and catalog checks below with no outbound provider configuration. The focused PGlite migration suite checks selected migrations and does not establish that a full Supabase replay succeeds.
5. After the isolated restore rehearsal succeeds and the target is independently approved, use a fresh operator checkout and `pnpm exec supabase link --project-ref ntbaoylcrwkowqqvzkno`. Verify `supabase/.temp/project-ref`, re-run the read-only target inventory, and run `pnpm exec supabase migration list --linked` and `pnpm exec supabase db push --linked --dry-run`. For the observed empty state, expect exactly 55 pending versions. Stop on any discrepancy. Obtain explicit Dev migration approval for the exact dry-run output before executing `pnpm exec supabase db push --linked`. If a migration fails, leave acceptance disabled, reconcile the ledger with actual objects, and proceed only with a reviewed forward repair or the recovery plan.
6. Verify the version ledger matches the manifest. Confirm `identity_principals`, `identity_provider_subjects.clerk_issuer`, `organizations`, `organization_memberships.principal_id`, `api_rate_limits`, and `consume_api_rate_limit(text,integer,integer)`. The API calls the limiter before evaluating the Clerk route. Confirm RLS is enabled on these tables, and effective direct SELECT is denied to `anon` and `authenticated` on the two identity tables, memberships, and limiter storage. Confirm service-role SELECT on the two identity tables and memberships, no service-role writes to identity links, and service-role-only EXECUTE on the limiter RPC. Check the principal and membership FKs, enforce a single active link per provider and principal, and test the PostgREST nested read as service role with the actual aliases used by the API. Confirm browsers cannot use the same REST query. Keep Clerk Preview disabled if schema discovery or required grants fail.

Key ordering checkpoints include the baseline extension/role dependencies, organizations at `20260712010000`, the durable limiter at `20260815115118`, principals and provider subjects at `20260825051902`, Supabase Auth authority restoration at `20260913123000`, memberships at `20260914174500`, and the five November migrations ending at `20261121140000`. These bind memberships to principal IDs, preserve the reviewed legacy Auth relationship, stage later production authority without registering it, restrict grants and reconcile the rate limiter. The Preview App uses the existing PostgREST schema relationships and does not use the staged production Clerk RPC.

<details>
<summary>Exact ordered migration manifest at PR #175 head</summary>

```text
supabase/migrations/20260710104755_remote_schema.sql
supabase/migrations/20260710110226_revoke_public_execute_fund_functions.sql
supabase/migrations/20260710120000_institutional_onboarding_and_rbac.sql
supabase/migrations/20260712000000_compliance_acknowledgment.sql
supabase/migrations/20260712010000_platform_foundations.sql
supabase/migrations/20260712020000_documents.sql
supabase/migrations/20260712030000_profile_identity_fields.sql
supabase/migrations/20260716030000_onboarding_drafts.sql
supabase/migrations/20260717120000_fix_handle_new_user_trigger.sql
supabase/migrations/20260717130000_rls_and_index_gaps.sql
supabase/migrations/20260717140000_email_otp_template.sql
supabase/migrations/20260720190000_capital_operations_foundation.sql
supabase/migrations/20260724045915_production_security_containment.sql
supabase/migrations/20260809040703_atomic_account_provisioning.sql
supabase/migrations/20260809141841_api_account_onboarding.sql
supabase/migrations/20260809163305_fix_account_onboarding_rpc.sql
supabase/migrations/20260809163555_fix_account_onboarding_profile_id.sql
supabase/migrations/20260811161123_production_funding_treasury_transfer_foundation.sql
supabase/migrations/20260811161216_governed_financial_operations.sql
supabase/migrations/20260811161300_transfer_reconciliation_hardening.sql
supabase/migrations/20260811161413_omnibus_treasury_funding_model.sql
supabase/migrations/20260811161533_allocation_engine_foundation.sql
supabase/migrations/20260811161550_allocation_api_authority_grants.sql
supabase/migrations/20260812115731_single_general_platform_admin.sql
supabase/migrations/20260815115118_distributed_api_rate_limiting.sql
supabase/migrations/20260817134000_add_transfer_approval_states.sql
supabase/migrations/20260817134100_add_transfer_approved_state.sql
supabase/migrations/20260817134500_governed_transfer_approval_lifecycle.sql
supabase/migrations/20260825051902_identity_principal_provider_subject_foundation.sql
supabase/migrations/20260825051927_clerk_identity_linking_commands.sql
supabase/migrations/20260825053722_clerk_dual_session_link_service.sql
supabase/migrations/20260825053749_clerk_application_identity_cutover.sql
supabase/migrations/20260825053809_clerk_bootstrap_existing_account_guard.sql
supabase/migrations/20260825082059_self_custody_treasury_principal_cutover.sql
supabase/migrations/20260908051241_thesis_mode_foundation.sql
supabase/migrations/20260908051251_thesis_evaluation_snapshots.sql
supabase/migrations/20260908053417_thesis_decision_history.sql
supabase/migrations/20260908074500_thesis_revealed_observations.sql
supabase/migrations/20260908091732_provider_webhook_control_plane.sql
supabase/migrations/20260910132119_harden_allocation_history_search_path.sql
supabase/migrations/20260912223000_clerk_only_identity_cutover.sql
supabase/migrations/20260913024025_webhook_disposition_evidence.sql
supabase/migrations/20260913052329_gate05_retire_legacy_financial_authority.sql
supabase/migrations/20260913052717_gate05_legacy_table_readonly_grants.sql
supabase/migrations/20260913123000_supabase_auth_only_cutover.sql
supabase/migrations/20260914154000_transaction_intelligence_observations.sql
supabase/migrations/20260914174500_platform_core_owner_control_plane.sql
supabase/migrations/20261021190000_contain_profile_browser_write_authority.sql
supabase/migrations/20261021191000_onboarding_preserves_account_standing.sql
supabase/migrations/20261021200000_canonical_capital_ledger_initialization.sql
supabase/migrations/20261120000000_harden_distributed_api_rate_limiting.sql
supabase/migrations/20261121000000_organization_membership_principals.sql
supabase/migrations/20261121120000_stage_clerk_production_continuity.sql
supabase/migrations/20261121130000_harden_identity_and_rate_limit_authority.sql
supabase/migrations/20261121140000_reconcile_gate03c_authorities.sql
```

</details>

## Recovery and rollback rehearsal

The [free-tier Dev logical recovery runbook](dev-logical-recovery.md) defines an encrypted, job-local rehearsal for the empty pre-rollout schema. Record its recovery scope and exclusions before using it as rollout evidence.

1. Before the rollout, record the Dev project ref, database version, migration ledger, Auth/Storage counts, extensions, roles/grants and settings. In Supabase Dashboard, record the actual available backup or PITR restore point, retention window and restore destination options. Archive mode alone establishes none of these capabilities. Capture an encrypted, checksummed logical archive of the approved Dev schemas and data using a least-privilege read-only backup role and compatible client. Capture application ACLs, managed Auth data/settings and signing-key continuity separately as allowed by Supabase. Track Storage object backups separately from database metadata, even when both counts are zero. Avoid exporting role password verifiers or committing any archive.
2. Verify the encrypted archive checksum with `sha256sum -c`, decrypt into a restricted scratch directory, and inspect the custom archive with `pg_restore --list`. For a logical backup use a reviewed libpq service entry for the Dev target, `pg_dump --format=custom` with an explicit schema list, and an approved encryption recipient. An application-only public archive requires separate managed Auth, Storage and configuration recovery evidence. Prefer a verified managed restore to a separate destination when the project plan supports it. Restore the exact archive into a disposable Supabase-compatible target with a different ref or isolated local PG17 stack. Block production egress and keep application and provider secrets absent. Restore compatible roles and extensions before objects. For a logical replay use `pg_restore --exit-on-error --single-transaction` with the reviewed table of contents and the disposable target connection. If the destination already provides a managed schema, reconcile its schema-creation entry in the reviewed restore list while keeping its data and ACL evidence. Then verify schemas, ledger, row counts and sequences, RLS/policies and ACL grantors, Auth user/identity counts and Storage counts against the checkpoint. Rehearse the managed Auth flow using new isolated clients and document any settings or credentials that must be recreated. Record elapsed restore time and the reachable recovery point.
3. If hosted acceptance fails, freeze fixtures and disable the branch's Preview provider switch or roll the Preview alias back to its prior safe deployment after approval. Revoke synthetic Clerk sessions and their Dev links, preserving audit evidence. For schema failure, retain the database and failure evidence for review. Use the verified snapshot for separately approved Dev recovery if the owner chooses rollback. A partial migration ledger, production target, missing checkpoint, or failed isolated restore blocks further writes.

## Protected Vercel deployment pair

- Confirm immutable deployment URLs, Git SHA, project IDs and Preview targets in Vercel before sending any credentials. Use the exact branch-scoped App and API origins. Configure the App origin to match the URL the browser uses. Keep Deployment Protection enabled.
- On the App, verify the Preview-only test keys, token-template name, API and App origins, and `NEPTLIUM_API_AUTH_PROVIDER=clerk-preview`. Set `NEPTLIUM_CLERK_PREVIEW_VERCEL_TRUSTED_SOURCE=true` only after confirming the API deployment's origin in Vercel. The server-side adapter sends the App workload JWT as `x-vercel-trusted-oidc-idp-token` and the short-lived Clerk template JWT as `Authorization: Bearer …`. Missing workload identity denies the request. Set any App Supabase public variables for this branch to Dev values and verify the effective destination without printing values.
- On the API, scope `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEPTLIUM_CLERK_PREVIEW_SUPABASE_URL`, and `NEPTLIUM_CLERK_PREVIEW_SUPABASE_SERVICE_ROLE_KEY` to Dev. Match the App origin and provider switch. Use the Clerk development issuer and a short-lived Clerk-signed template JWT with the configured audience, exact App origin as `azp`, and lifetime at most 120 seconds. Confirm the real App-issued template yields these claims. Record verification for the three readiness flags in the [identity contract](../../platform/IDENTITY.md). Provider credentials, execution flags and mainnet remain absent or disabled.
- With separate approval, enable or verify App Secure Backend Access with OIDC. In the API project's Trusted Sources allow the **neptlium-app** Vercel project **preview → preview** only. Keep the existing self rules needed by the approved runner. Verify both the allowed pair and denial of unapproved caller environments. Do not add preview → production or relax project protection. Vercel Trusted Sources rules are environment-scoped, so the API continues to enforce exact Clerk issuer, audience, App origin and organization membership. A protection page or `TRUSTED_SOURCES_ENVIRONMENT_MISMATCH` means the Vercel boundary blocked the request. The harness separately requires Neptlium JSON for application denials. [Vercel Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources)

## Synthetic fixtures

After the Dev-only fixture change is approved, use a run-specific synthetic identity label. Store no customer data and use no production credentials. Record the IDs and evidence references in an access-controlled run record. Use the actual Clerk-generated subject values.

| Fixture | Setup and expected access |
|---|---|
| Linked Clerk user L | Create a disposable verified user in the Clerk development instance and a synthetic legacy Dev Supabase Auth user L via the Dev Auth Admin API. Verify that the managed Auth trigger created one active principal and one active `SUPABASE_AUTH` link for the legacy UUID. A reviewed Dev-only transaction under an authorized database owner inserts a `CLERK` provider subject with L's Clerk ID, the verified development issuer, and the same principal. Add viewer membership to organization A with the legacy UUID. Verify the membership trigger binds the same principal. |
| Unlinked Clerk user U | Sign up in the Clerk development instance from the browser using the approved synthetic verification method. Create no Dev link, principal, or membership for U. |
| Organizations A and B | Create two synthetic organizations using Dev legacy owner IDs. Keep L's viewer membership only in A and use a different synthetic owner for B. Add no Admin, Treasury or financial privileges and initialize no funds. |
| Revocation or suspension | After positive checks, use a separately approved Dev-only transaction to revoke L's Clerk link or suspend its membership. Verify denial with an otherwise valid token. Use a fresh fixture for repeat tests. |

For the reviewed link operation use `identity_provider_subjects(principal_id, provider, provider_subject, clerk_issuer)` with provider `CLERK`. The service-role key cannot write this table. Use `organizations(owner_id, name)` and `organization_memberships(organization_id, user_id, role)` with role `viewer`. Re-read all IDs and statuses before commit. Do not link by email or call the production continuity functions. After the test, revoke the synthetic sessions and links and retire the memberships through the approved Dev cleanup. Preserve audit and required foreign-key history.

## Repeatable acceptance matrix

Use authenticated Vercel access for each fresh browser context. For automation, scope Vercel trusted auth headers to the exact App origin so they are never sent to third-party Clerk origins. Use Clerk's development testing token when automation hits Clerk bot protection. It enables interaction with the real sign-up page and supplies no application authority. Verify actual sign-up, sign-in and sign-out in distinct contexts and avoid recording form contents or credentials. [Clerk Playwright testing](https://clerk.com/docs/guides/development/testing/playwright/overview)

| Test | Procedure | Expected result |
|---|---|---|
| Signed out | In a fresh Clerk context browse to `/preview/clerk/dashboard`. | Redirect to Preview sign-in. No verified organization text. |
| Linked sign-in | Start at `/preview/clerk/sign-in`, sign in as L, enter A using the Organization ID form. | Dashboard shows “Organization access verified.” Verify the API deployment received the server request. |
| Cross tenant | While signed in as L, open `/preview/clerk/dashboard?organization_id=<B>`. | “Organization access could not be verified.” No verified organization text. |
| Sign-out | Return to A, select **Sign out**, then revisit the direct A dashboard URL. | Preview sign-in and no verified organization text. Previously issued template JWTs expire independently within the configured lifetime. |
| Unlinked sign-up | Use a fresh context, visit `/preview/clerk/sign-up` and complete Clerk verification as U. Submit A on the dashboard. | Clerk session exists and tenant access is denied. The principal and membership inventory is unchanged. |
| HTTP | Run the harness below using L and U tokens from their real Clerk frontend sessions. | Linked `200` with A and L's principal, unlinked and wrong tenant `401`, workload identity alone `401`, duplicate tenant `422`, browser preflight `403`. All application replies are no-store and expose no CORS authority. |
| Revocation and expiry | Repeat the linked request with a still-valid bearer after the approved Dev link change. Repeat with an expired bearer. | Application JSON `401` both times. Record only status and request ID. |
| Environment separation | Compare deployment SHA, targets and effective resource refs, confirm no Production variable writes, and check the authenticated App-to-API connection in Preview. Confirm Clerk routes return `404` in a production-mode local build. | Preview uses Dev only. No Preview token or workload credential is sent to a production URL. |

Run `node scripts/clerk-preview-http.mjs` from a controlled runner. Supply `PREVIEW_APP_ORIGIN`, `PREVIEW_API_ORIGIN`, `PREVIEW_ORGANIZATION_ID`, `PREVIEW_OTHER_ORGANIZATION_ID`, `PREVIEW_PRINCIPAL_ID`, `VERCEL_OIDC_TOKEN`, `PREVIEW_LINKED_CLERK_TOKEN` and `PREVIEW_UNLINKED_CLERK_TOKEN` through protected runner inputs. Use a short-lived API-project development OIDC token allowed by its self-access rules, or an approved Preview caller token. Refresh both Clerk tokens just before the run using the same development JWT template and exact App origin. The harness prints only check names and statuses. Clear credentials when finished and record the SHA, deployment IDs, timestamps, statuses, request IDs and fixture labels in the release evidence.

Hosted acceptance is blocked until the Dev owner approves the schema and fixture steps, the recovery evidence is verified, the Vercel owner approves branch-only variables and the Preview Trusted Sources rule, and a Clerk owner verifies the development instance and template. Production cutover is outside this gate.
