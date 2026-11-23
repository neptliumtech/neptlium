# Gate 00 verification and coverage

## Evidence baseline

Repository source baseline `ecf40bcd6a310f8efc2d34afb84d5e3cc50ac91b` on `neptliumtech/neptlium:main`. Connected infrastructure observations are dated 2026-11-23. This change documents implemented behavior and keeps release acceptance separate.

| Requested coverage                              | Authority                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent execution, scoping, review and evidence   | [Root contract](../../AGENTS.md), [Web contract](../../apps/web/AGENTS.md)                                                                                |
| Product routes, roles, configuration and limits | [Surface inventory](../product/SURFACES.md)                                                                                                               |
| Platform structure, APIs and decisions          | [Architecture](../architecture/ARCHITECTURE.md), [API](../architecture/API.md), [ADRs](../architecture/ADR/README.md)                                     |
| Provider capabilities and identity              | [Registry](../platform/CAPABILITIES.md), [Provider rules](../platform/PROVIDERS.md), [Identity](../platform/IDENTITY.md)                                  |
| Financial and security authority                | [Ledger](../financial/LEDGER_AND_RECONCILIATION.md), [Execution](../financial/EXECUTION.md), [Security](../platform/SECURITY.md)                          |
| Data, infrastructure and operations             | [Database](../../supabase/README.md), [Environments](ENVIRONMENT.md), [Deployment](../operations/DEPLOYMENT.md), [Incidents](../operations/OPERATIONS.md) |
| Developer workflow and testing                  | [Development](DEVELOPMENT.md), [CI](CI.md)                                                                                                                |

## Local validation

- PASS: frozen lockfile installation, workspace tests and workspace builds. Local executor used Node 24.22.3 and pnpm 11.25.0. Builds used placeholder public Supabase configuration and exercised compile and prerender steps.
- PASS: workspace lint, workspace typecheck, Web Vitest (26 tests) and Supabase source contract tests (25 tests).
- BLOCKED locally: PostgreSQL runtime fixtures require a disposable PostgreSQL 17 service. GitHub CI defines the fixture jobs.
- PASS: changed Markdown formatting, diff whitespace, relative link targets across repository Markdown, and a scan of additions for common credential formats.
- PASS: local API Vercel bundle, Vercel integration contracts, product hierarchy and auth cutover guard.
- PR checks are tracked by GitHub against the documentation commit.

## Remaining release evidence

- Obtain the production deployment SHA and functional result for each Vercel alias. The dedicated endpoint confirms verified domain assignments. Project details show an Admin build error and a canceled Status production attempt in the most recent snapshot.
- Verify authenticated registration, onboarding, recovery, role denial, tenant isolation and rollback on exact deployments. Connected Clerk lists a Production instance. The merged Capital entry pages still use Supabase Auth.
- Reconcile the deployed database migration ledger against tracked history. The connected listing returned no migration rows for either project. Its output leaves applied history unverified. Confirm RLS and exact deployment bindings and record an isolated restore result.
- Verify exact production Stripe endpoint and billing event delivery, Alchemy and Circle environment bindings, and durable processing before declaring any provider operation enabled. Live Stripe account visibility establishes account access only.
- Establish release-owner review and merge authorization before promoting this documentation to main or starting the release acceleration gate.
