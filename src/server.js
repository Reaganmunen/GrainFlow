require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const app = require('./app');
const { pool } = require('./config/db');

const PORT = Number(process.env.PORT) || 3000;

/** One-off check so a wrong URL / password / database name shows up immediately. Uses the same pool (and SSL / DATABASE_URL) as the app. */
async function checkDatabase() {
  const { rows } = await pool.query('SELECT current_database() AS db, version() AS version');
  return rows[0];
}

async function start() {
  try {
    const info = await checkDatabase();
    console.log(`Database connected: ${info.db} (${info.version.split(',')[0]})`);
  } catch (err) {
    console.error('Could not connect to PostgreSQL:', err.message);
    console.error(process.env.DATABASE_URL ? 'Check DATABASE_URL in your .env (Neon: copy the connection string, keep ?sslmode=require).' : 'Set DATABASE_URL (Neon) or DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD in your .env.');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`GrainFlow running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use.` : err);
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref(); // force-exit if connections hang
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('uncaughtException', (err) => { console.error('Uncaught exception:', err); process.exit(1); });

start();