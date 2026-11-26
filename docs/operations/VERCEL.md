# Vercel deployment authority

The dedicated Vercel project domains endpoint and project detail snapshot on 2026-11-23 returned the following. A listed hostname confirms a project mapping in that response. Production readiness requires exact served deployment and functional evidence.

| App      | Project             | Canonical domain contract | Domain endpoint verification | Latest attempt returned |
| -------- | ------------------- | ------------------------- | ---------------------------- | ----------------------- |
| Web      | `neptlium-web`      | `neptlium.com`            | Verified                     | READY, target unset     |
| Capital  | `neptlium-app`      | `app.neptlium.com`        | Verified                     | READY, target unset     |
| Treasury | `neptlium-treasury` | `treasury.neptlium.com`   | Verified                     | READY, target unset     |
| Pay      | `neptlium-pay`      | `pay.neptlium.com`        | Verified                     | READY, target unset     |
| Admin    | `neptlium-admin`    | `admin.neptlium.com`      | Verified                     | ERROR, target unset     |
| API      | `neptlium-api`      | `api.neptlium.com`        | Verified                     | READY, target unset     |
| Docs     | `neptlium-docs`     | `docs.neptlium.com`       | Verified                     | READY, target unset     |
| Status   | `neptlium-status`   | `status.neptlium.com`     | Verified                     | CANCELED, production    |

## Build and Git coupling

The integration base is `main` in `neptliumtech/neptlium`. Confirm each Vercel project's production branch, Git connection, root directory, install command and active alias before release. The connector detail response did not establish those settings or the exact production SHA for each surface.

Repository `vercel.json` files declare build and ignore behavior. Web, Treasury, Pay, Docs and Status declare workspace builds. App and Admin use the project/framework build convention. API declares Node entrypoints and routing. An ignored build or canceled attempt does not identify the deployment currently serving an alias.

## Environment scopes

Environment variable **names and ownership** are documented in `../engineering/ENVIRONMENT.md`. Values remain in Vercel/provider secret stores and must not be copied into repository documentation.

## ENV-01 reconciliation, 2026-11-26

### CURRENT

The canonical base was [`dad8075d`](https://github.com/neptliumtech/neptlium/commit/dad8075d009f378a1d46d715d3f8d76b83819ef2). Vercel returned eight existing projects on `neptliumtech`. Project metadata reported team authentication as `all_except_custom_domains` for all eight. Current Git connections, configured production branches, project build roots and effective protection of individual deployment URLs were not verified. The project API did not return those Git/build settings, and the Vercel dashboard required sign-in.

Each canonical hostname resolved in Vercel's alias API to the production deployment below. All eight alias targets reported READY and carried deployment metadata for `Neptliumforge/neptlium` on `main`. That recorded owner is historical provenance. The latest Preview attempt was queried separately from the active production alias.

| Alias | Active production deployment | Active commit | Latest production attempt | Latest Preview attempt |
| --- | --- | --- | --- | --- |
| `neptlium.com` | `dpl_AqEdD72aaYYT45utdKKLWVBXVGE2` | `ef560ffa78b87972963999472ede9a9924aca71e` | CANCELED,production,Neptliumforge,main,c2bd256e7afb7ae7aba2eb12652d2ccdb268cd11,https://vercel.com/neptliumtech/neptlium-web/F81KxEeEYfqEqE3uLVwtDTpzYDVZ | [READY,,neptliumtech,feat/web-premium-experience,3313c0fbaf7686b34cee5050b992ffb3df934a8d,https://vercel.com/neptliumtech/neptlium-web/JBf1EW8YJVEabW44NUj24JEBBXSy](undefined) |
| `app.neptlium.com` | `dpl_EB9UWc8mijaDnAj3pUvMSAhZ7va5` | `c2bd256e7afb7ae7aba2eb12652d2ccdb268cd11` | READY,production,Neptliumforge,main,c2bd256e7afb7ae7aba2eb12652d2ccdb268cd11,https://vercel.com/neptliumtech/neptlium-app/EB9UWc8mijaDnAj3pUvMSAhZ7va5 | [READY,,neptliumtech,feat/gate02-clerk-preview-session-route,ee59b8c38754172d90bdb74c17beae57b50331f8,https://vercel.com/neptliumtech/neptlium-app/9SVhKBudtMkbwSN777rRjPD3H9Qa](undefined) |
| `api.neptlium.com` | `dpl_5Los2r9zvDtn8Udb3GZJfoAPANHV` | `c2bd256e7afb7ae7aba2eb12652d2ccdb268cd11` | READY,production,Neptliumforge,main,c2bd256e7afb7ae7aba2eb12652d2ccdb268cd11,https://vercel.com/neptliumtech/neptlium-api/5Los2r9zvDtn8Udb3GZJfoAPANHV | [READY,,neptliumtech,feat/gate02-clerk-preview-session-route,421a17870b0dbe4a5faccc6580e0178f41347948,https://vercel.com/neptliumtech/neptlium-api/68kWP4sEvWXEzsiv59MKiy4fHWa9](undefined) |
| `admin.neptlium.com` | `dpl_97BwZjYvqNApnSwQwJK4UBWQ2gqc` | `59291e398466f588690685b76e1162659eae914a` | CANCELED,production,Neptliumforge,main,c2bd256e7afb7ae7aba2eb12652d2ccdb268cd11,https://vercel.com/neptliumtech/neptlium-admin/FQ7tN8K9Fk9QzZGuv8tQdcMFnP4P | [ERROR,,Neptliumforge,feat/design-system-quality-gate-20261116,9dfa07b8bb1050d502e2b2896382e22e99f6a616,https://vercel.com/neptliumtech/neptlium-admin/Cz8bCwMAEeQJEvYDDc5kuEHsjbw7](undefined) |
| `treasury.neptlium.com` | `dpl_3LxSzfmoAfDoiR8nNp1KFFqNDXnX` | `4ef8e3a9991afe59ccd33112691145009bc960f8` | CANCELED,production,Neptliumforge,main,c2bd256e7afb7ae7aba2eb12652d2ccdb268cd11,https://vercel.com/neptliumtech/neptlium-treasury/4YTwerxoEfKzAcingzUkp5r8kMQS | [READY,,Neptliumforge,fix/auth-contract-preview-guard-20261116,08a40b2d838f9fed80053db613c093661e1ea605,https://vercel.com/neptliumtech/neptlium-treasury/Vos1KPPwcqgxk2T45j2SW8NKXMBw](undefined) |
| `pay.neptlium.com` | `dpl_8yi7GQaJzkUcrVALQ1JrmVVTPFy7` | `4ef8e3a9991afe59ccd33112691145009bc960f8` | CANCELED,production,Neptliumforge,main,c2bd256e7afb7ae7aba2eb12652d2ccdb268cd11,https://vercel.com/neptliumtech/neptlium-pay/Bs3RpJctcAbjYTR2cYMDqWkxnoS4 | [READY,,Neptliumforge,fix/auth-contract-preview-guard-20261116,08a40b2d838f9fed80053db613c093661e1ea605,https://vercel.com/neptliumtech/neptlium-pay/BwjWVWtzEjouyMRNLmSh6cHpqaC3](undefined) |
| `docs.neptlium.com` | `dpl_FQahdkL7gVR9jSEfboHD46yKqZiS` | `4ef8e3a9991afe59ccd33112691145009bc960f8` | CANCELED,production,Neptliumforge,main,c2bd256e7afb7ae7aba2eb12652d2ccdb268cd11,https://vercel.com/neptliumtech/neptlium-docs/6Qc5QYW2jJaXD2k8w4v3rrxwLwcp | [READY,,Neptliumforge,ci/vercel-quality-gate-setup-20261116,593aef6fa338bdd17086f49f262e8158ea5a52e7,https://vercel.com/neptliumtech/neptlium-docs/5arhUgjjUhDLo8t1NTQmF5oiyupx](undefined) |
| `status.neptlium.com` | `dpl_BeX7RuZWtozWaU1v7aqv2MV413zj` | `4ef8e3a9991afe59ccd33112691145009bc960f8` | CANCELED,production,Neptliumforge,main,d19f79a02147e27224db22e5366a28e2f3263e0d,https://vercel.com/neptliumtech/neptlium-status/tHeg3wFQAqfgcmgjBsF4tJnyTwsA | [CANCELED,,Neptliumforge,feat/clerk-server-identity-gate-20261116,c28d2642145a880f4e44f99a87a90851bbbb2e50,https://vercel.com/neptliumtech/neptlium-status/Bix9VhMrLGowmhMGPanjZPbinGTZ](undefined) |

### TRANSITION

- App, Treasury and Pay each have a single `NEXT_PUBLIC_SUPABASE_URL` entry and a single `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` entry targeting both Production and Preview. No Preview override for these keys was listed. Effective project identity for these entries was not independently verified.
- The Supabase installation owns Production-scoped variables on App and API. The exact linked Supabase project for each Vercel binding remains unverified. API has no listed Preview or Development Supabase endpoint and credentials for the server auth/data contract, and App has no listed Preview API origin. Treasury and Pay share a single API-origin entry across Production and Preview.
- Admin has Production-only site and API origin entries and no listed project-scoped Supabase entries. Web has shared Production and Preview site and API origin entries. Docs and Status returned no project-scoped variable metadata. Team-level variables and build-time defaults may affect effective configuration.
- No Clerk-named Vercel project variable was returned for the eight projects. That check did not inspect team-level variables, values, or older deployment snapshots. [AUTH-00 PR #181](https://github.com/neptliumtech/neptlium/pull/181) remains open. Keep the deployed authentication path until replacement continuity is verified.
- Supabase Dev and Production each returned only their default branch. Before ENV-01.3, Dev returned zero recorded migrations and zero public tables. Production's 50 recorded migration versions exactly matched the 50 tracked versions on the base commit. A read-only catalog query found RLS enabled on all 86 Production public tables and partitions. Version parity and RLS flags leave schema and grant parity, policy behavior, backup availability and recoverability unverified. [Recovery PR #172](https://github.com/neptliumtech/neptlium/pull/172) already stages migration and restore verification.

### ENV-01.3 Dev baseline

Dev project `ntbaoylcrwkowqqvzkno` was initialized from the 50 tracked migrations at `dad8075d`. The rollback-only replay passed after resetting session options between migration files. The apply used a single transaction with an empty-database guard, keeping the original migration versions and names in the Supabase ledger. The repository migration files were unchanged.

- **PASS** — Dev contains all 50 tracked versions and all 86 public tables and partitions have RLS enabled.
- **PASS** — The [existing recovery fixture](https://github.com/neptliumtech/neptlium/pull/172) passed on Dev inside a rollback-only transaction. It checked organization isolation, private membership and identity grants, principal revocation, and the rate limiter's role boundary. A separate query confirmed zero Auth users, organizations, and ledger postings after rollback.
- **OPEN** — Dev security advisors returned 45 tables with RLS and no policy, plus 7 authenticated-callable definer functions. Review the intended grant and caller contracts before certifying broader permissions.
- **BLOCKED** — A protected Preview still needs Dev-only API credentials installed through an authorized secret transfer and an independent API origin. Shared browser entries remain scoped across Production and Preview. No Preview binding or deployment was changed during this increment.

The bootstrap transaction would roll back in full on an apply error. After commit, any rollback requires a Dev-only recovery decision. Avoid a destructive reset as part of connecting Preview.

### TARGET

Bind a protected Preview after the Dev credential handoff. Use independent Supabase project references, browser keys, server credentials and API origins for Preview and Production. Verify runtime references and issuer acceptance for the same Preview commit, then verify cross-environment token rejection and tenant isolation. Export names, scopes, branch overrides and integration ownership before configuration changes. Preserve the current alias target IDs and provider-managed credential references for rollback. Keep production release certification gated on functional validation of the exact served commit and an isolated recovery rehearsal.

**Disposition** — ENV-01 remains open. Dev schema initialization passed. Preview isolation is incomplete. No production change or deployment was performed.

## Verification

For an affected production deployment record project, custom domain, Git SHA, deployment ID/status, and post-deploy health. A successful Vercel deployment does not establish provider activation, settlement, reconciliation, or canonical financial state.

The dedicated project domains endpoint returned all eight custom domain assignments as verified, including the Web `www` alias. The project detail endpoint showed a narrower hostname list. Use the dedicated endpoint for domain assignments and resolve the actual served deployment separately.

## ENV-01.3B protected Preview operator actions

### Integration finding

The installed Supabase integration is external and has provisioning marked false in Vercel. Existing integration-owned App and API entries are Production-scoped. [Supabase's Preview integration](https://supabase.com/docs/guides/deployment/branching/integrations) syncs credentials for a corresponding Supabase branch. The connected tools expose no operation to use that integration to map the already-baselined Dev project to one Vercel Preview branch. None of the five projects returned a custom environment. Use the existing projects and branch-scoped Preview entries.

### Operator actions in order

1. In the existing Vercel projects, verify `docs/env-01-vercel-reconciliation` is a Preview branch and verify deployment protection for each branch URL and deployment URL. Record the untouched Production entry scopes and current deployment IDs. Ensure Vercel system variables are exposed to the build and runtime so Preview detects `VERCEL_ENV=preview` and can report `VERCEL_GIT_COMMIT_SHA`.
2. Add only the entries below in the Vercel dashboard, scoped to **Preview → `docs/env-01-vercel-reconciliation`**. Obtain Supabase credentials directly from [Neptlium Dev API Keys](https://supabase.com/dashboard/project/ntbaoylcrwkowqqvzkno/settings/api-keys). Confirm the Dev project reference before copying. Keep the original Production entries. Browser overrides must be present and verified before deploying the sign-in surfaces. Once the isolated Preview is verified, narrow the shared App and Treasury Supabase entries to Production only, retaining their values and the branch overrides. Pay's existing browser and API entries have no consumer in the current Pay source, so it needs no Dev configuration. Leave any wider cleanup for the owner of those scopes.
3. Use [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) to confirm whether the API's server-to-server automation credential is authorized. A Vercel automation bypass is project-wide. If none is approved for this use, the team owner must explicitly approve that scope or provision a narrowly authorized Trusted Sources design before routing App or Admin. Leave ordinary requests protected and keep the bypass header server-side.
4. Deploy API Preview first. Get its exact SHA, branch, deployment ID and protected `*.vercel.app` origin in Vercel. Use that verified origin for App and Admin. Recheck metadata and run the verification below on the resulting exact deployments. Use explicit Dev Auth callback URLs only if the tested flow needs them. Read the callback from the deployed App routes and keep Production Auth settings untouched.

| Vercel project | Variable | Source / value | Classification | Action and verification |
| --- | --- | --- | --- | --- |
| neptlium-api | `SUPABASE_URL` | `https://ntbaoylcrwkowqqvzkno.supabase.co` | Server configuration, public-class URL | Add branch scope. Confirm the exact Dev origin and database readiness. |
| neptlium-api | `SUPABASE_ANON_KEY` | Dev legacy anon key used by the Supabase Auth verifier | Public-class key, server configuration | Add branch scope. Confirm Dev Auth accepts a Dev session. |
| neptlium-api | `SUPABASE_SERVICE_ROLE_KEY` | Dev legacy service-role key used as a bearer by API repositories | Sensitive server credential | Add as sensitive in Vercel. Confirm readiness and a Dev-only data read. |
| neptlium-api | `API_ALLOWED_ORIGINS` | Exact protected App and Admin Preview HTTPS origins from Vercel, comma-separated | Server configuration | Add branch scope. Verify allowed-origin response and rejection of an unrelated origin. |
| neptlium-app, neptlium-admin, neptlium-treasury | `NEXT_PUBLIC_SUPABASE_URL` | `https://ntbaoylcrwkowqqvzkno.supabase.co` | Browser public | Add a branch override in each project. Verify Supabase requests resolve to Dev. |
| neptlium-app, neptlium-admin, neptlium-treasury | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Dev publishable key | Browser public | Add a branch override in each project. Validate Dev sign-in. |
| neptlium-app, neptlium-admin | `NEPTLIUM_API_URL` | Exact, protected API Preview deployment origin from step 4 | Server configuration | Add branch scope in both projects. Verify server calls use the same API SHA verified in Vercel. |
| neptlium-app, neptlium-admin | `NEPTLIUM_PREVIEW_API_BYPASS_SECRET` | Approved neptlium-api automation bypass credential from step 3 | Sensitive server credential | Add as sensitive to each branch. Verify authenticated server requests succeed while requests without protection credentials are still challenged. |

No Clerk or auth-mode selector is required. Next.js supplies `NODE_ENV`; the API derives Preview mode from `VERCEL_ENV`. `NEXT_PUBLIC_SITE_URL` is required by App's Production configuration check and is not required by its Preview runtime. Treasury consumes the Supabase browser pair and has no API-origin consumer. Pay has no Supabase or API-origin consumer. No sandbox credentials or financial flags are required for certification. Omit provider setup from this isolation deployment. The existing Preview Stripe key names do not match the API's `STRIPE_SECRET_KEY` input, and a signing secret alone does not authorize ingress since the API also requires an explicit webhook environment. Leave live feature flags off and verify health plus the provider response on the resulting deployment.

### Verification and rollback

- Confirm the team, exact commit SHA and Preview target in Vercel, then verify every relevant URL challenges unauthenticated requests. Use an authorized Vercel session for checks and keep protection credentials out of URLs and logs.
- On API Preview, check `/v1/version`, `/health` and `/v1/status`. Match `build_id` to Vercel's Git SHA and require `environment: preview`, database and governed financial storage ready, and mainnet false. Check the explicit allowlist and that unauthenticated protected API routes reject access inside the Vercel perimeter.
- Use two controlled Dev users and organizations. Verify sign-in, App-to-API bearer acceptance, stable principal resolution, required membership, denial across tenants, and no live execution. Demonstrate a controlled valid Production token fails the Preview verifier and a valid Dev token fails the Production Auth verifier using only its Supabase Auth user lookup. Use a local secure harness that returns status codes only. Confirm Dev-only storage through a Dev-owned fixture read. Remove synthetic fixtures through the approved Dev procedure after evidence collection.
- If any check fails, stop using the affected Preview URL and revert only the branch-scoped configuration. Keep branches fail closed until corrected. Revoke a credential created solely for this exercise if it was exposed or the exercise is canceled. Keep the verified Dev baseline and Production aliases in place.

**Disposition** — Preview runtime guards and the operator contract are ready for review. Native secure provisioning of the fixed Dev project was not available from the connected installation. No Preview is certified. Deployment provenance, protection and end-to-end issuer rejection are pending the operator binding.
