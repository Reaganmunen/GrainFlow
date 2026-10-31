-- GrainFlow offline support: one row per operation (sale, job ticket step ...) that a till made while offline.
-- The server creates this table by itself the first time it is needed (CREATE TABLE IF NOT EXISTS), so running this file
-- is OPTIONAL. Run it by hand only if your database user is not allowed to create tables.
--
-- Why it exists: every offline operation carries a unique op_id made on the till. If the connection drops after the server
-- saved the operation but before the till heard back, the till sends it again later. The server finds the op_id here and
-- answers with the saved result instead of recording the sale a second time.

CREATE TABLE IF NOT EXISTS pmc.offline_ops (
  op_id        uuid PRIMARY KEY,
  user_id      bigint      NOT NULL,
  device_id    text,
  op_type      text        NOT NULL,
  client_time  timestamptz,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  result       jsonb       NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_offline_ops_applied_at ON pmc.offline_ops (applied_at);
