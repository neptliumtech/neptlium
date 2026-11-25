# Deployment

Neptlium applications deploy independently. Repository convergence does not justify manual production deployment by itself.

## Policy

Deploy when runtime code, deployment configuration, a consumed shared runtime package, or established deployment policy requires it. Documentation-only changes must not trigger manual production deployment for ceremony.

Every production deployment should be traceable to a Git commit SHA. Verify the affected application after deployment and distinguish deployment readiness from financial/provider capability readiness.

See [Vercel](VERCEL.md) for the environment-specific project observations.

## Release and rollback

1. Record the authorized surface, base and candidate SHAs, workspace tests, deployment scope and prerequisites. Confirm affected build and routing configuration in the target project.
2. Verify allowed origins, secret scopes and provider environment by name and scope. Review data compatibility and independently authorize schema changes. Keep Preview isolated from live economic actions.
3. Exercise the exact candidate in Preview using approved test identities and the affected public routes. For auth changes, include valid and invalid sessions, existing-account continuity, tenant denial, logout and recovery. Record evidence before requesting production authorization.
4. After authorized release, resolve the served alias to its deployment and SHA, then repeat the affected probes. Record any unanswered capability gaps.
5. If verification fails, route the incident to the release owner. Confirm the last known good deployment can run against the current schema before an authorized rollback. Use database recovery only through the separately reviewed procedure.

See [incident response](OPERATIONS.md), [database recovery](../../supabase/README.md) and [CI](../engineering/CI.md).
