# NSR-1 Stripe Setup

This file is the final activation checklist for NSR-1 subscription billing.

## Already implemented in code
- Subscription Checkout for monthly plans.
- Stripe Customer Portal for card/payment management, cancellation and plan changes.
- Automatic subscription-state refresh.
- Stripe webhook processing through the existing `/api/client-auth` function to avoid adding another Vercel Function.
- Webhook signature verification.
- Duplicate webhook-event protection.
- Plan-code synchronization when a Stripe monthly price changes.
- Client billing page at `/billing.html`.

## Required Supabase migration
Run `supabase/nsr1-billing-v5.sql` after package migrations V1–V4.

## Required Stripe configuration
Create monthly recurring prices in AED for these NSR-1 plans:
- Essential: AED 1,390 / month
- Pro: AED 4,290 / month
- Enterprise: AED 14,900 / month

Optional one-time setup prices:
- Essential: AED 2,500
- Pro: AED 5,000
- Enterprise: AED 15,000

## Required Vercel environment variables
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `APP_URL`

`APP_URL` must be the full public NSR-1 production URL, for example `https://example.com`.

## Map Stripe prices to Supabase
Replace each placeholder below with the real Stripe Price ID, then run in Supabase:

```sql
update public.nsr_plans
set stripe_monthly_price_id = 'price_ESSENTIAL_MONTHLY',
    stripe_setup_price_id = 'price_ESSENTIAL_SETUP'
where code = 'essential';

update public.nsr_plans
set stripe_monthly_price_id = 'price_PRO_MONTHLY',
    stripe_setup_price_id = 'price_PRO_SETUP'
where code = 'pro';

update public.nsr_plans
set stripe_monthly_price_id = 'price_ENTERPRISE_MONTHLY',
    stripe_setup_price_id = 'price_ENTERPRISE_SETUP'
where code = 'enterprise';
```

If setup fees will not be collected through Stripe, set `stripe_setup_price_id = null` for that plan.

## Stripe webhook endpoint
Use the existing endpoint:

`POST <APP_URL>/api/client-auth`

Subscribe to at least:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## Final test before production
1. Use Stripe test mode.
2. Sign in to a test NSR-1 client portal.
3. Open `/billing.html`.
4. Start subscription Checkout.
5. Complete a test payment.
6. Confirm subscription status becomes active.
7. Open Stripe Customer Portal.
8. Test card update and cancellation-at-period-end.
9. Confirm webhook events appear once in `public.nsr_billing_events`.
10. Confirm `public.nsr_client_subscriptions` reflects Stripe status and current price.

Do not merge the branch to `main` until the full test succeeds.
