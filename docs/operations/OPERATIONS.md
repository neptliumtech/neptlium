# Incident response and recovery

## Triage

1. Record affected domain, environment, timestamp, exact deployment SHA and safe request/correlation IDs. Use Vercel deployment/runtime metadata and API health/status as separate evidence.
2. Classify the incident as routing/build, identity/tenant enforcement, persistence/migration, provider delivery or financial reconciliation. Use the [surface inventory](../product/SURFACES.md) and [API contract](../architecture/API.md) to locate ownership.
3. For identity incidents, verify effective issuer/session behavior and principal/role rejection using approved test identities. Escalate access anomalies immediately and preserve audit attribution.
4. For provider incidents, inspect signature disposition, inbox claim, retry/lease/dead-letter state and environment before considering replay. Keep provider observations and canonical postings distinct. Never retry an ambiguous external operation without an idempotent lookup and review.
5. Escalate suspected data corruption, unauthorized access or conflicting postings to the maintainers. Record last known good deployment, migration history and audit evidence. Use the [security policy](../../SECURITY.md) for vulnerability reporting.

## Recovery

Use a separately authorized application rollback after checking schema compatibility and target alias. For persistence recovery, use the [database procedure](../../supabase/README.md). Correct balances through the approved [ledger and reconciliation](../financial/LEDGER_AND_RECONCILIATION.md) workflow. Preserve original postings and evidence.

Verify public health, affected authenticated routes, denied access, durable writes where approved, and reconciliation before closing. Keep restoration, replay and financial authority decisions in the incident record. The public Status application has no connected status publisher. Confirm the approved incident communications channel with the on-call maintainer.

## Distributed API limiter incident

Use the active API alias to identify the exact Vercel deployment and Git SHA.
Capture the request ID from a failing `GET /health` and locate its
`http.request` record. The customer API records only the failure category and,
for an upstream HTTP error, its status. The public error remains
`503 rate_limit_unavailable`.

- `transport` or `timeout` means check connectivity and Supabase availability
  before changing database permissions.
- `upstream_status` means correlate the status with authorized PostgREST logs.
  Check the effective project binding, server credential scope, RPC exposure,
  grant, and the upstream error class without copying credential values.
- `invalid_response` means verify that the RPC returns exactly one decision with
  boolean `allowed`, integer `remaining`, and timestamp `reset_at`.

Compare the following read-only catalog checks against the exact deployed
database. A missing function also yields null privilege checks.

```sql
with rpc as (
  select to_regprocedure('public.consume_api_rate_limit(text,integer,integer)') as oid
)
select oid::regprocedure as signature,
       pg_get_function_result(oid) as result,
       has_function_privilege('service_role', oid, 'EXECUTE') as service_role_execute,
       has_function_privilege('anon', oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_execute
from rpc;
```

The owning migration is
[`20260815115118_distributed_api_rate_limiting.sql`](../../supabase/migrations/20260815115118_distributed_api_rate_limiting.sql).
Executing the RPC writes a limiter bucket. Use isolated Dev for direct
functional probes. In Production use approved public health checks and
authorized operator logs. The API routes `/health` and `/v1/health` through
the limiter. A limiter failure can mask the route lookup, including for
`/ready`, which has no handler.
