# IGNOUprep — Custom Backend

Express + Prisma + PostgreSQL + JWT auth. Replaces Lovable Cloud / Supabase.

## Stack
- **Node 20 + Express 4** — REST API
- **Prisma 5** — ORM + migrations
- **PostgreSQL 16** — database
- **JWT (HS256) + bcrypt** — auth
- **Zod** — validation

## Local development

```bash
cd backend
cp .env.example .env       # fill DATABASE_URL, JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run dev                # http://localhost:8080
```

## Deploy

### Render (recommended, one-click)
Push the `backend/` folder to a Git repo, then in Render → New → Blueprint → point at this repo. `render.yaml` provisions both the web service and Postgres database. Set `GOOGLE_AI_API_KEY` manually in the dashboard.

### Railway
`railway up` from this folder. Add a Postgres plugin and set the same env vars from `.env.example`.

### Fly.io
```bash
fly launch --copy-config --no-deploy
fly postgres create
fly postgres attach <db-name>
fly secrets set JWT_SECRET=$(openssl rand -hex 32) GOOGLE_AI_API_KEY=...
fly deploy
```

## Migrating data from Supabase (one-time)

```bash
# 1. Set Supabase creds in .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
# 2. Set DATABASE_URL to the NEW Postgres
npx prisma migrate deploy
npm run db:export       # writes ./export/*.json
npm run db:import       # loads into the new DB
```

⚠️ **Passwords don't transfer** (Supabase hashes them with bcrypt+pepper we can't read). All imported users get a placeholder hash and must use **Forgot Password** to set a new one. If you want zero-friction migration, switch the auth strategy to "Keep Supabase Auth, replace only DB + functions" — say the word and I'll restructure.

## API surface

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/signup` | public |
| POST | `/auth/login` | public |
| GET  | `/auth/me` | user |
| GET  | `/courses`, `/courses/:slug` | public |
| POST/PATCH/DELETE | `/courses` | admin |
| GET  | `/topics/:id`, `/topics/by-slug/:slug` | public |
| POST/PATCH/DELETE | `/topics` | admin |
| GET  | `/topics/:id/versions` | admin |
| POST | `/topics/:id/revert/:versionId` | admin |
| GET/POST/DELETE | `/bookmarks` | user |
| GET  | `/pyq?courseId=&topicId=&year=` | public |
| POST/PATCH/DELETE | `/pyq` | admin |
| GET  | `/admin/stats` | admin |
| GET  | `/admin/users`, POST `/admin/roles`, DELETE `/admin/users/:id` | super_admin |
| POST | `/ai/chat` (proxy to Gemini) | admin |

## Frontend switch-over (next pass)

The React app still talks to Supabase. Once this backend is deployed, I'll add:
- `src/lib/api.ts` — fetch wrapper that injects the JWT
- Replace `supabase.from(...)` calls with `api.get/post(...)`
- Replace `supabase.auth.*` with `/auth/login` + `localStorage` token
- Move `supabase/functions/*` callers to `/ai/chat` (or move the AI-heavy logic into new backend routes)

Tell me when the backend is deployed and I'll do the frontend migration.
