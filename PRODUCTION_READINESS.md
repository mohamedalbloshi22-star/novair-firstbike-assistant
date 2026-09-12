# BSR-1 Production Readiness

Status: Preparation only. Production deployment and Client Go-Live are NOT authorized.

## Approved candidate
- Source branch: `bsr1-production-readiness`
- Base: Founder-approved Preview baseline `codex/bsr1-preview-hardening`
- Production must not be updated until explicit Founder Production Approval.

## Required Production environment variables
Values must be stored only in the hosting secret store. Never commit values to Git.

Core:
- `APP_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOVAIRE_ADMIN_PASSWORD`
- `NOVAIRE_ADMIN_SESSION_SECRET` (must be independent from the admin password)
- `NOVAIRE_CLIENT_SESSION_SECRET`
- `ANTHROPIC_API_KEY`

Notifications, when enabled for Client Go-Live:
- `RESEND_API_KEY`
- `NOVAIRE_NOTIFICATION_FROM` using a verified sending domain/address

Stripe, only if Stripe is selected for the current operating model:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `APP_URL`
- Stripe plan Price IDs must be mapped in `nsr_plans` before automatic Stripe billing is enabled.

## Mandatory pre-approval security gates
1. Remove credential artifacts from `main` without causing an unauthorized Production deployment.
2. Purge exposed credentials from Git history using a controlled history-rewrite procedure where required.
3. Rotate every credential that was exposed or could have been copied while public.
4. Remove/rotate all legacy plaintext client portal passwords and retain only salted password hashes.
5. Verify Vercel Production variable scope and confirm no Preview credentials are scoped to Production.
6. Verify Production points only to Supabase Production project `hrnspqoipqrufjfnktsj`.
7. Confirm dedicated admin/client session secrets, secure cookies, security headers, rate limits, tenant isolation, and safe logging.
8. Confirm backups/recovery and incident-response/credential-rotation procedure.

## First Client safe operating sequence
1. Create tenant inactive.
2. Select approved BSR-1 plan and configure service.
3. Complete knowledge/configuration and technical PASS.
4. Contract must be finalized through the approved commercial process.
5. Invoice must be issued through the approved finance/invoicing process.
6. Collection/payment must be confirmed and recorded before activation approval is granted.
7. Founder Client Go-Live approval is required.
8. Activate only after all prior gates are evidenced.
9. Verify login, assistant, dashboard, usage, support, notifications, billing state and audit trail immediately after activation.

Stripe is not a prerequisite if the approved first-client operating model uses a separate approved invoice/payment/collection process. If automatic Stripe billing is selected, Stripe must pass test-mode checkout, webhook, invoice/payment, cancellation and idempotency tests before Production use.

## Controlled Production preparation sequence after Founder authorization
1. Freeze/disable automatic Production deployment from `main` or use another safe deployment guard.
2. Sanitize `main` and Git history.
3. Rotate Production credentials and update secret-store values atomically.
4. Verify Production environment-variable scope without deploying the application.
5. Re-run credential leak scan and read-only security checks.
6. Present the final Production Approval report.
7. Only after explicit Founder Production Approval: deploy the approved candidate.
8. Client Go-Live remains a separate explicit Founder decision.
