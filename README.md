# Neptlium

**Capital Operating Platform**  
_Capital, intelligently managed._

Neptlium is an operating layer for individual and organizational capital: positions, movements, evidence, policy, and financial operations across governed workflows.

> Every movement has authority. Every position has evidence.

**Production:** [neptlium.com](https://neptlium.com) · **Capital application:** [app.neptlium.com](https://app.neptlium.com)

Start with [developer onboarding](docs/engineering/DEVELOPMENT.md), the [surface inventory](docs/product/SURFACES.md), and the [agent contract](AGENTS.md). The canonical integration branch is `main` in `neptliumtech/neptlium`.

## Platform surfaces

| Surface              | Responsibility                                           |
| -------------------- | -------------------------------------------------------- |
| Web                  | Public product experience and discovery                  |
| Capital (`apps/app`) | Individual capital operating experience                  |
| Treasury             | Organizational capital operations                        |
| Admin                | Restricted internal operations, governance, and controls |
| API (`apps/api`)     | Identity-aware platform and financial-domain APIs        |
| Pay                  | Payment presentation and approved payment journeys       |
| Docs                 | Developer and integration documentation                  |
| Status               | Service availability and operational communications      |

A surface being present in the repository does **not** certify that a particular financial capability is enabled or production-ready.

## Architecture

Neptlium is a **pnpm/Turborepo monorepo**, organized by deployable applications, shared packages, database assets, documentation, and automation.

```text
apps/       # Independently deployable product surfaces and API
packages/   # Shared domain, UI, integration and infrastructure libraries
supabase/   # PostgreSQL schema and migrations
docs/       # Product, engineering, security and operational contracts
scripts/    # Repository tooling and automation
```

**Authority model**

- **Neptlium ledger:** canonical financial truth, subject to governed posting and reconciliation.
- **Providers:** infrastructure and evidence sources, never automatic financial authority.
- **Policy and authorization:** explicit, server-enforced, tenant-scoped, and fail-closed.
- **Intelligence:** observational unless an explicitly reviewed domain contract grants additional authority.

```text
Customer / Operator
        ↓
Neptlium Product Surface
        ↓
Verified Identity → Stable Principal → Tenant Authorization
        ↓
Policy / Domain Workflow / Capability Gate
        ↓
Provider Adapter → Verified Evidence
        ↓
Governed Posting / Reconciliation
        ↓
Canonical Ledger / Customer Projection
```

## Identity and infrastructure direction

**Supabase Auth is the sole authentication and session authority** for customer and operator surfaces. Supabase also provides PostgreSQL persistence, migrations, constraints and row-level security.

**Current runtime:** Capital entry pages and standard API bearer authentication use Supabase Auth. Deployment continuity requires separate verification. See [Identity](docs/platform/IDENTITY.md).

The API must independently verify identity tokens and resolve them to a stable Neptlium principal. Account ownership is never inferred from email matching, browser claims, or provider sessions alone. Admin and Treasury identity boundaries require separate verification.

See [Provider architecture](docs/platform/PROVIDERS.md).

## Core invariants

1. Ledger authority belongs to Neptlium; external balances and confirmations are evidence, not available capital.
2. Every financial mutation requires authorization, auditability, idempotency, and reconciliation controls.
3. Policy, eligibility, preflight, and tenant access **fail closed**.
4. Provider capabilities must be explicitly configured, reviewed, and activated for their environment and operation.
5. Intelligence cannot independently mutate financial truth.
6. Secrets, signing authority, and service-role credentials never enter customer browsers.
7. Identity-provider changes must preserve existing account ownership, access isolation, and recoverability.

## Local development

Use the Node.js version configured for the relevant CI job and the repository-pinned pnpm version in `package.json`. Install from the monorepo root:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Before submitting changes, run the applicable repository checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Commands above describe the expected workflow; they are **not** a claim that all checks currently pass.

## Documentation

Start at [Documentation index](docs/README.md). Key references:

- [Provider architecture](docs/platform/PROVIDERS.md)
- [Security policy](SECURITY.md)
- [Deployment operations](docs/operations/DEPLOYMENT.md)

Product, financial-domain, architecture, and design-system specifications are indexed in `docs/README.md`.

## Deployment and release governance

Applications deploy independently. A successful provider configuration or build does not establish production eligibility, payment readiness, or safe financial execution.

Changes to authentication, authorization, ledger, custody, and financial integrations require environment-specific verification, security review, and a tested rollback path. Production migrations must not proceed without recoverability evidence.

See [Deployment operations](docs/operations/DEPLOYMENT.md).

## Security

Never commit credentials, Supabase service-role keys, provider tokens, wallet signing material, or production session tokens. Report vulnerabilities through the process in [SECURITY.md](SECURITY.md).

---

© Neptlium
