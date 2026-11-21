# Gate 03C.6 Supabase migration and recovery readiness

Production installation is **BLOCKED**. This branch is based on Gate 03 Production Foundation at `4b34a13950384b36039c3ae5affe0f7e3eddb80b`. Gate 03C.5 [PR #171](https://github.com/neptliumtech/neptlium/pull/171) at `d361c40e7a70b47c2f6bd6d027b4936f2e5ff8ec` is a separate release dependency. This branch does not include its commits or migration. Gate 02E recovery work in [PR #167](https://github.com/neptliumtech/neptlium/pull/167) is also separate.

## CURRENT — hosted evidence

| Check | Status | Evidence |
| --- | --- | --- |
| Effective Development and Production targets | BLOCKED | Prior Gate 03 inventory identifies Development as `ntbaoylcrwkowqqvzkno` and Production as `udghxwlhztwxvkjaefjh`. `pnpm exec supabase projects list --output json` could not authenticate. Current project metadata, database state and deployment bindings remain unverified. |
| Production API health | FAIL | An unauthenticated GET of `https://api.neptlium.com/v1/status` returned HTTP 503 with `rate_limit_unavailable`. The symptom does not identify the deployed database. |
| Hosted schema, grants and history | BLOCKED | Prior inventory reports empty Production public schema and history and an absent limiter RPC. Recheck both projects on independently verified connections before assessing actual compatibility. |
| Production backup and restore | BLOCKED | No protected Production archive, external digest, isolated restore evidence or platform retention inventory was available. Engine archive mode alone provides no such evidence. |
| Hosted installation, cutover and execution | NOT RUN | Scope is limited to read-only hosted evidence and disposable database rehearsals. |

The API's `SUPABASE_URL` is shared by its Auth verifier, repositories and distributed limiter. The limiter uses the server role to call `public.consume_api_rate_limit(text,integer,integer)` and fails closed without an authoritative decision. Compare effective Vercel project refs and credential provenance for App, API, Admin, Treasury and Pay by deployment SHA and environment. Record only public refs and pass/fail results.

## STAGED — schema and authorization

The parent tracks 50 ordered migrations through `20261021200000`. They require managed Supabase schemas and roles. Principal backfill aborts on orphaned profiles. The chain creates historical Clerk helpers before the Supabase Auth-only migration revokes their links and removes those helpers. Keep callers isolated throughout installation.

PR #171 adds an empty, issuer-bound link table after the identity (`20260825051902`) and tenant membership (`20260914174500`) foundations. Enrollment and revocation are owner-only. Unique constraints reserve the subject and principal even after revocation. The service-role read RPC pins the Supabase mapping and principal and uses an empty search path. Tests cover cross-issuer collisions, retries, conflicts, revocation, tenant and browser-role denial, and absent session evidence. Verify the combined migration sequence, hosted dependencies, inherited grants and Production session provenance before release.

This branch adds forward migration `20261121130000`. The Auth insert trigger's prior upsert could rebind or reactivate a conflicting Supabase mapping. The new trigger accepts only the exact active mapping and denies revoked, suspended or conflicting state. The service role retains identity reads and limiter RPC execution. Direct identity writes and direct limiter-table access are removed. The limiter rejects null policy inputs, reads the clock under the per-key lock, and caps the counter above the largest supported limit.

The Gate 02E manifest pins 50 files and rejects either new migration. Regenerate and review it for the exact candidate. Compare hosted history to an exact prefix and independently rule out false-empty drift. If both gates ship, Gate 03C.5's version comes first. Approve that order before installing either version on a hosted target.

## Recovery and release evidence

Gate 02F and Gate 02J workflows live on the unmerged Gate 02E branch. Gate 02J pins Development and encrypts its archive. Its hosted run needs protected credentials. Its managed Auth and Storage exclusions need separate coverage, and separate source dumps require a quiescent source.

The fixture rehearsal uses a pre-upgrade application archive and synthetic Auth rows. It verifies tenant isolation and RPC authority, tests the upgrade, then recovers to a separate disposable database with no network access during restore. It verifies archive digests, schema and ACLs, roles, migration history, and preserved identity and ledger ownership. It retains no archive artifact. The database-only PostgreSQL 17.11 image uses local compatibility SQL for the missing Auth JWT helper and Storage prerequisites. This is a SQL replay with a fixture history table. Managed service behavior and the exact hosted Supabase release-tool plan require independent validation.

| Isolated check | Status | Evidence |
| --- | --- | --- |
| SQL migration and authorization | PASS | `bash supabase/scripts/gate-03c6-rehearse.sh` applied the 50 baseline and 1 forward version on PostgreSQL 17.11. It verified Auth bootstrap, rollback on identity conflict, tenant RLS, browser and service grants, null inputs, counter saturation, and a shared quota across two sessions. |
| Independent pre-upgrade recovery | PASS | The same command restored the checked archive and fixture Auth rows onto a second network-disabled container. It verified exact 50-version history, compared schema and ACLs, scoped rows and managed role memberships, and reran authorization against preserved principal and ledger UUIDs. |
| Combined Gate 03C.5 and 03C.6 sequence | PASS | A temporary copy containing the exact PR #171 SQL applied 52 versions and recovered the 51-version pre-upgrade checkpoint. After the hardening, the staged RPC resolved the original principal for the correct issuer and tenant, denied the wrong issuer or tenant, and denied the revoked link. No Gate 03C.5 code entered this branch. |
| API regressions and auth guard | PASS | `pnpm --filter @neptlium/api test` built the API and passed 64 test files. `node scripts/retired-auth-contract.mjs` passed. |

Before requesting hosted installation, collect:

1. Authorized dashboard inventory and verified read-only connections for both refs. Run `supabase/test/gate-03c6/read-only-inventory.sql` through `psql -X -v ON_ERROR_STOP=1` on each approved connection. It reports metadata and history without invoking business RPCs. Confirm the trusted host and role independently.
2. Exact-prefix history, actual schema compatibility, managed extensions and function owner/grantor review. Resolve drift, identity continuity and release ordering before the separately approved release-tool preflight.
3. A consistent Production archive with independent encryption key custody, protected offsite retention, an external digest and capture time. Record managed Auth, extensions, settings and role-credential recovery separately. Supabase database backups include Storage metadata but omit object bytes. [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
4. Restoration of that exact artifact into a disposable compatible target. Compare history, schemas, data counts, ownership, ACLs, RLS and tenant authorization. Record recovery duration, observed data cutoff and all exclusions.
5. Verified limiter RPC availability and passing API health for the exact candidate. Clerk and financial execution retain independent release gates.
