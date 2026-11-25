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

## Verification

For an affected production deployment record project, custom domain, Git SHA, deployment ID/status, and post-deploy health. A successful Vercel deployment does not establish provider activation, settlement, reconciliation, or canonical financial state.

The dedicated project domains endpoint returned all eight custom domain assignments as verified, including the Web `www` alias. The project detail endpoint showed a narrower hostname list. Use the dedicated endpoint for domain assignments and resolve the actual served deployment separately.
