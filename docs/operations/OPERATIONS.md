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
