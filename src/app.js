const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const crypto = require('crypto');
const routes = require('./routes');
const { noStore } = require('./middlewares/security');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const PUBLIC_DIR = path.join(__dirname, '..', 'public'); // /public sits next to /src

// Behind a cloud proxy / load balancer: needed so req.ip (activity log, sessions) is the real client IP
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------- security & parsing ----------
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Bootstrap & friends from a CDN, plus inline handlers used by the pages
        'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
        'script-src-attr': ["'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'upgrade-insecure-requests': isProd ? [] : null, // only force HTTPS in production
      },
    },
  })
);
// Same-origin by default (the frontend is served from here). Set CORS_ORIGIN=https://a.com,https://b.com to allow others.
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
}
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// the M-Pesa callback URL carries a secret: never write it to the logs
morgan.token('safe-url', (req) => String(req.originalUrl || req.url).replace(/(\/stk-callback\/)[^/?\s]+/, '$1***'));
const LOG_FORMAT = isProd
  ? ':remote-addr [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":user-agent" :response-time ms'
  : ':method :safe-url :status :response-time ms - :res[content-length]';
if (process.env.NODE_ENV !== 'test') app.use(morgan(LOG_FORMAT));

// ---------- static frontend ----------
app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: isProd ? '1h' : 0 }));

// ---------- API ----------
app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }));

// money data must never be cached by the browser or a proxy
app.use('/api', noStore);

// Daily housekeeping, called by Vercel Cron (vercel.json). Needs CRON_SECRET in the environment; Vercel sends it as a Bearer token.
app.get('/api/cron/daily', async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET || '';
    const sent = String(req.get('authorization') || '');
    const want = `Bearer ${secret}`;
    const okAuth = secret && sent.length === want.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(want));
    if (!okAuth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { Session } = require('./models');
    res.json({ success: true, data: { sessions_purged: await Session.purgeExpired() } });
  } catch (err) { next(err); }
});

// slow down password guessing (the account lockout in User.authenticate still applies)
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again in a few minutes.' },
}));

app.use('/api', routes);

// unknown API path -> JSON 404 (never HTML)
app.use('/api', (req, res) => res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` }));

// any other GET -> the frontend entry page
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ---------- error handler (controllers already forward rejections here via next) ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Something went wrong';

  if (err.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON in the request body'; }
  else if (err.type === 'entity.too.large') { status = 413; message = 'Request body is too large'; }
  else if (err.code === '23505') { status = 409; message = 'That record already exists (duplicate value)'; }
  else if (err.code === '23503') { status = 409; message = 'This record is linked to other records, or refers to one that does not exist'; }
  else if (err.code === '23502') { status = 400; message = `A required value is missing${err.column ? `: ${err.column}` : ''}`; }
  else if (err.code === '22P02' || err.code === '22003') { status = 400; message = 'A value has the wrong format or is out of range'; }
  else if (err.code === '23514' || err.code === 'P0001') { status = 400; } // CHECK / trigger rules (e.g. price below minimum): keep the DB's message

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
    if (isProd) message = 'Something went wrong on the server';
  }

  const body = { success: false, message };
  let details = err.details;
  if (details && typeof details === 'object' && details.code) { // AppError(..., { code, ...extra }): code goes to the top level
    const { code, ...rest } = details;
    body.code = code;
    details = Object.keys(rest).length ? rest : undefined;
  } else if (err.code && typeof err.code === 'string' && !/^\d/.test(err.code) && err.code !== 'P0001') {
    body.code = err.code;
  }
  if (details !== undefined) body.details = details;
  res.status(status).json(body);
});

module.exports = app;