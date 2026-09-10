const crypto = require('crypto');
const { getClientSession } = require('./_client-session');
const { currentUsage } = require('../lib/nsr-usage');
const { safeErrorLog } = require('../lib/nsr-safe-log');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

async function sb(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function restartIdempotencyKey(clientId, subscription) {
  const basis = [
    String(clientId || ''),
    String(subscription?.stripe_subscription_id || ''),
    String(subscription?.cycle_start || ''),
    String(subscription?.cycle_end || '')
  ].join('|');
  return `nsr1-restart-${crypto.createHash('sha256').update(basis).digest('hex')}`;
}

async function stripeUpdateSubscription(id, idempotencyKey) {
  const body = new URLSearchParams();
  body.append('billing_cycle_anchor', 'now');
  body.append('proration_behavior', 'none');
  body.append('payment_behavior', 'error_if_incomplete');
  body.append('expand[]', 'latest_invoice.payment_intent');

  const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey
    },
    body
  });
  const data = await r.json();
  if (!r.ok) {
    const err = new Error(data?.error?.message || 'Stripe payment failed');
    err.status = r.status;
    throw err;
  }
  return data;
}

function dateOnly(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ success: false, error: 'Server configuration missing' });
  if (!STRIPE_SECRET_KEY) return res.status(503).json({ success: false, error: 'Stripe is not configured yet' });

  const session = getClientSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const clients = await sb(`clients?id=eq.${encodeURIComponent(session.client_id)}&select=id,config&limit=1`);
    const client = Array.isArray(clients) ? clients[0] || null : null;
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });
    if (client.config?.active === false) return res.status(403).json({ success: false, error: 'Client inactive' });

    const rows = await sb(
      `nsr_client_subscriptions?client_id=eq.${encodeURIComponent(session.client_id)}` +
      `&select=client_id,plan_code,status,cycle_start,cycle_end,stripe_subscription_id,stripe_status&limit=1`
    );
    const sub = Array.isArray(rows) ? rows[0] : null;
    if (!sub?.stripe_subscription_id) return res.status(409).json({ success: false, error: 'No active automatic subscription' });
    if (!['active', 'trialing'].includes(String(sub.stripe_status || ''))) {
      return res.status(409).json({ success: false, error: 'Subscription is not active' });
    }

    const usage = await currentUsage(session.client_id);
    const monthlyLimit = Number(usage?.monthly_limit || 0);
    const remaining = Number(usage?.remaining || 0);
    if (monthlyLimit <= 0 || remaining > 0) {
      return res.status(409).json({
        success: false,
        error: 'Early cycle restart is available only after the monthly AI response limit is reached',
        code: 'USAGE_CAP_NOT_REACHED',
        usage: {
          used: Number(usage?.used || 0),
          monthly_limit: monthlyLimit,
          remaining,
          usage_percent: Number(usage?.usage_percent || 0),
          warning_level: usage?.warning_level || 'NORMAL'
        }
      });
    }

    const stripeSub = await stripeUpdateSubscription(
      sub.stripe_subscription_id,
      restartIdempotencyKey(session.client_id, sub)
    );
    const newStart = dateOnly(stripeSub.current_period_start) || new Date().toISOString().slice(0, 10);
    const newEnd = dateOnly(stripeSub.current_period_end);
    if (!newEnd) throw new Error('Stripe did not return a new billing period');

    await sb(`nsr_client_subscriptions?client_id=eq.${encodeURIComponent(session.client_id)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: {
        cycle_start: newStart,
        cycle_end: newEnd,
        stripe_status: stripeSub.status || 'active',
        stripe_current_period_end: new Date(Number(stripeSub.current_period_end) * 1000).toISOString(),
        auto_renew: !stripeSub.cancel_at_period_end,
        cancel_at_period_end: !!stripeSub.cancel_at_period_end,
        billing_updated_at: new Date().toISOString()
      }
    });

    // If a cycle is restarted on the same calendar date, reset the existing counter and alerts.
    await sb(
      `nsr_usage_counters?client_id=eq.${encodeURIComponent(session.client_id)}&cycle_start=eq.${encodeURIComponent(newStart)}`,
      { method: 'PATCH', prefer: 'return=minimal', body: { ai_responses: 0, updated_at: new Date().toISOString() } }
    );
    try {
      await sb(
        `nsr_usage_alerts?client_id=eq.${encodeURIComponent(session.client_id)}&cycle_start=eq.${encodeURIComponent(newStart)}`,
        { method: 'DELETE', prefer: 'return=minimal' }
      );
    } catch (error) {
      safeErrorLog('USAGE_ALERT_RESET_WARNING', error);
    }

    try {
      await sb('nsr_subscription_events', {
        method: 'POST',
        prefer: 'return=minimal',
        body: {
          client_id: session.client_id,
          event_type: 'early_cycle_restart',
          old_plan_code: sub.plan_code,
          new_plan_code: sub.plan_code,
          effective_at: new Date().toISOString(),
          metadata: {
            old_cycle_start: sub.cycle_start,
            old_cycle_end: sub.cycle_end,
            new_cycle_start: newStart,
            new_cycle_end: newEnd,
            stripe_subscription_id: stripeSub.id,
            stripe_invoice_id: typeof stripeSub.latest_invoice === 'string' ? stripeSub.latest_invoice : stripeSub.latest_invoice?.id || null
          }
        }
      });
    } catch (error) {
      safeErrorLog('SUBSCRIPTION_EVENT_LOG_WARNING', error);
    }

    return res.status(200).json({
      success: true,
      cycle_start: newStart,
      cycle_end: newEnd,
      auto_renew: !stripeSub.cancel_at_period_end
    });
  } catch (error) {
    safeErrorLog('BILLING_RESTART_ERROR', error);
    return res.status(error.status === 402 ? 402 : 500).json({
      success: false,
      error: error.status === 402 ? 'تعذر تحصيل قيمة الدورة الجديدة من البطاقة.' : 'تعذر بدء دورة اشتراك جديدة.'
    });
  }
};
