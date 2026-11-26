# Neptlium Authentication Emails

Supabase Auth is Neptlium's sole active authentication and session provider. Authentication email behavior and template activation are configured through Supabase Auth.

## Design rules

Authentication emails should be restrained, transactional, and unmistakably Neptlium:

- white or very light neutral content surface;
- Neptlium Mineral Teal as the primary action/brand accent;
- dark neutral body copy;
- system-safe typography;
- concise subject lines and one primary action;
- no newsletter, promotional, investment-performance, or product-sales content;
- no session tokens rendered visibly in body copy. The signup template may display the Supabase-generated single-use confirmation code;
- accessible contrast, clear expiry/recovery language, and plain-text fallback.

## Supabase-managed flows

Depending on enabled Supabase Auth configuration, transactional identity emails may include:

- email verification;
- password recovery/reset when password authentication is enabled;
- email-address change verification;
- invitations where configured;
- security/recovery messaging supported by the active Supabase Auth setup.

Prepared copy does not prove that a flow is enabled. Production activation, delivery domain, sender identity, redirect destinations, expiry, rate limits, and available factors must be verified in the active Supabase configuration.

## Brand identity

Use the canonical Neptlium mark with approved brand geometry. Email assets should be hosted on a trusted Neptlium origin and use a format suitable for transactional email clients.

## Security guidance

- Never request a user's password, recovery code, MFA secret, refresh token, or session token by email reply.
- Authentication links/codes must be generated and validated by Supabase Auth.
- Redirect destinations must be approved Neptlium origins.
- Do not create custom email-token verification logic in `apps/app` or `apps/admin` when the provider flow already owns verification.
- Security-sensitive identity changes should use the supported Supabase Auth verification/step-up mechanisms when available and reviewed.

## Signup verification

The tracked Confirm Signup template supports the existing PKCE confirmation link and a six-digit Supabase email code. The App accepts the code through Supabase Auth and keeps the link callback available. Install the template in the authorized Dev project and verify SMTP sender, allowed callback origin, expiry, and provider-side resend limits before certifying delivery. The client cooldown is a user-interface guard. Supabase owns issuance, rate limits, and verification. Test actual delivery and both verification paths before promoting the template.
