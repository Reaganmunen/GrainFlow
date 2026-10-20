const { Settings } = require('../models');

/**
 * Safaricom Daraja (M-Pesa Express / STK push) client. Secrets come from .env, non-secret settings from mpesa_config:
 *   DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_PASSKEY
 * Till (Buy Goods): business_shortcode = store/head-office number, till_number = the Till, transaction_type = CustomerBuyGoodsOnline.
 */
const cache = { token: null, exp: 0, env: null };

const baseUrl = (env) => (env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');

function secrets() {
  const { DARAJA_CONSUMER_KEY: key, DARAJA_CONSUMER_SECRET: secret, DARAJA_PASSKEY: passkey } = process.env;
  if (!key || !secret || !passkey) throw new Error('Daraja credentials are missing in .env');
  return { key, secret, passkey };
}

async function config() {
  const c = await Settings.getMpesaConfig();
  if (!c || !c.is_active) throw new Error('M-Pesa prompts are not switched on yet. Ask the owner to complete the M-Pesa settings.');
  if (!c.business_shortcode || !c.till_number || !c.callback_url) {
    throw new Error('M-Pesa settings are incomplete (shortcode, till number and callback URL are required).');
  }
  return c;
}

// yyyyMMddHHmmss on Nairobi time
const timestamp = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14);

async function call(url, options) {
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'Safaricom took too long to respond' : `Could not reach Safaricom (${e.message})`);
  }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { ok: res.ok, status: res.status, json };
}

async function accessToken(env) {
  if (cache.token && cache.env === env && cache.exp > Date.now() + 30000) return cache.token;
  const { key, secret } = secrets();
  const r = await call(`${baseUrl(env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64') },
  });
  if (!r.ok || !r.json?.access_token) throw new Error('Safaricom rejected the app credentials');
  cache.token = r.json.access_token;
  cache.env = env;
  cache.exp = Date.now() + (Number(r.json.expires_in) || 3000) * 1000;
  return cache.token;
}

function fail(message, response) {
  const err = new Error(message);
  err.response = response || null;
  return err;
}

/** Sends the prompt. Returns { request, response } (request still contains Password: the model strips it before storing). */
async function stkPush({ phone, amount, accountReference, transactionDesc }) {
  const cfg = await config();
  const { passkey } = secrets();
  const token = await accessToken(cfg.environment);
  const ts = timestamp();
  const request = {
    BusinessShortCode: cfg.business_shortcode,
    Password: Buffer.from(`${cfg.business_shortcode}${passkey}${ts}`).toString('base64'),
    Timestamp: ts,
    TransactionType: cfg.transaction_type,
    Amount: Math.ceil(Number(amount)), // Daraja only accepts whole shillings
    PartyA: phone,
    PartyB: cfg.transaction_type === 'CustomerPayBillOnline' ? cfg.business_shortcode : cfg.till_number,
    PhoneNumber: phone,
    CallBackURL: cfg.callback_url,
    AccountReference: String(accountReference || 'Payment').slice(0, 12),
    TransactionDesc: String(transactionDesc || 'Payment').slice(0, 13),
  };
  const r = await call(`${baseUrl(cfg.environment)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!r.ok || !r.json || String(r.json.ResponseCode) !== '0') {
    throw fail(r.json?.errorMessage || r.json?.ResponseDescription || `Safaricom error (${r.status})`, r.json);
  }
  return { request, response: r.json };
}

/** Asks Safaricom what happened to a prompt. A body with ResultCode means the prompt has finished. */
async function stkQuery(checkoutRequestId) {
  const cfg = await config();
  const { passkey } = secrets();
  const token = await accessToken(cfg.environment);
  const ts = timestamp();
  const r = await call(`${baseUrl(cfg.environment)}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: cfg.business_shortcode,
      Password: Buffer.from(`${cfg.business_shortcode}${passkey}${ts}`).toString('base64'),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  return { ok: r.ok, body: r.json };
}

module.exports = { stkPush, stkQuery };
