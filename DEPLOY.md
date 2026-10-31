# Deploying GrainFlow to Vercel + Neon

## 1. package.json (add if missing)
```json
"engines": { "node": "20.x" },
"scripts": { "start": "node src/server.js", "dev": "node src/server.js" }
```
`express`, `helmet`, `cors`, `morgan`, `express-rate-limit`, `pg`, `dotenv` and `jsonwebtoken` must be in `dependencies` (not devDependencies). Commit `package-lock.json`.

## 2. Neon (once)
Run in the Neon SQL editor, replacing the role name with yours:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER ROLE neondb_owner SET search_path TO pmc, public;
ALTER ROLE neondb_owner SET timezone TO 'Africa/Nairobi';
```
Load your schema (the `pmc` schema, functions and seed data) and create the two owner accounts.
Use the pooled connection string (host contains `-pooler`) in `DATABASE_URL`.

## 3. Vercel
1. Push the project to GitHub and import it in Vercel (no build command needed).
2. Add every variable from `.env.example` under Settings -> Environment Variables.
3. `vercel.json` pins the functions to `fra1` (Frankfurt). Change `regions` to the SAME region as your Neon database.
4. After the first deploy open `https://YOUR-DOMAIN/api/health`, then log in.
5. In GrainFlow Settings -> M-Pesa set the callback URL to `https://YOUR-DOMAIN/api/mpesa/stk-callback/<MPESA_CALLBACK_SECRET>`.

## Notes
- Static pages come from `public/` on Vercel's CDN; only `/api/*` runs as a function.
- Vercel Cron calls `/api/cron/daily` once a day (clears expired login sessions). Stale M-Pesa prompts are expired by the till itself.
- The login rate limit is per server instance on Vercel; the database account lockout (5 wrong passwords) is what really protects logins.
- Function logs: Vercel -> Project -> Logs. The M-Pesa secret is masked in them.
