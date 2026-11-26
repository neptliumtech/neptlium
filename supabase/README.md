# Neptlium Supabase backend

This directory owns tracked PostgreSQL migration history shared by `apps/app` and `apps/admin`. Treat migrations and containment records as append-only. Never edit applied history; add a reviewed follow-up and validate locally or in staging before a separately authorized process. The API uses this database for durable principal, ledger, provider inbox and financial workflow state. See [architecture](../docs/architecture/ARCHITECTURE.md) and [canonical balances](../docs/financial/CANONICAL_BALANCES.md).

```sh
pnpm exec supabase start
pnpm exec supabase db reset --local
pnpm exec supabase db lint --local --level warning
```

Browser access uses publishable credentials and RLS. Service-role credentials remain server-only. Provider verification, custody, ledger, reconciliation, and execution infrastructure are not represented as complete.

## Migration verification and recovery

Run resets only on the disposable local stack. Review schema order, RLS policies, grants, definer function search paths, concurrent operations and backfills. Run the PostgreSQL 17 fixtures listed in [CI](../docs/engineering/CI.md) and the affected tests under [test](test). Compare tracked history to the target migration ledger read-only before proposing any apply.

Before an authorized production migration, record backup availability, target scope, recovery ownership, and an isolated restore rehearsal. Restore into a separately approved non-production database with independent credentials and verify migration parity, RLS denial/allow cases, stable principal ownership, canonical balances and reconciliation. Document time to restore and data-loss window from actual evidence. A healthy provider project alone does not establish recoverability.
