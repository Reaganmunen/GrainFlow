require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Client } = require('pg');
const app = require('./app');

const PORT = Number(process.env.PORT) || 3000;

/** One-off check so a wrong password / port / database name shows up immediately with a clear message. */
async function checkDatabase() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5433,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await client.connect();
  const { rows } = await client.query('SELECT current_database() AS db, version() AS version');
  await client.end();
  return rows[0];
}

async function start() {
  try {
    const info = await checkDatabase();
    console.log(`Database connected: ${info.db} (${info.version.split(',')[0]})`);
  } catch (err) {
    console.error('Could not connect to PostgreSQL:', err.message);
    console.error(`Tried ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT} / database "${process.env.DB_NAME}" as "${process.env.DB_USER}". Check your .env.`);
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
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref(); // force-exit if connections hang
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('uncaughtException', (err) => { console.error('Uncaught exception:', err); process.exit(1); });

start();