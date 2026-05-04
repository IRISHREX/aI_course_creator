# IGNOUprep — Custom Backend (MongoDB)

Express + Prisma + **MongoDB** + JWT auth. Replaces Lovable Cloud / Supabase.

## Stack
- **Node 20 + Express 4** — REST API
- **Prisma 5** — ORM (MongoDB provider)
- **MongoDB 6+** — database (must be a replica set; Atlas works out of the box)
- **JWT (HS256) + bcrypt** — auth
- **Zod** — validation

## Local development

```bash
cd backend
cp .env.example .env       # fill DATABASE_URL (mongodb+srv://...), JWT_SECRET
npm install
npx prisma generate
npx prisma db push         # creates collections + indexes in MongoDB
npm run dev                # http://localhost:5000
```

> Prisma's MongoDB provider requires a **replica set**. Atlas clusters are replica sets by default. For local dev, run `mongod --replSet rs0` then `rs.initiate()` in mongosh, or use `mongo:7` with `--replSet` in Docker.

## Deploy

### Render
Push the `backend/` folder to a Git repo, then in Render → New → Blueprint → point at this repo. `render.yaml` provisions the web service. **Set `DATABASE_URL` manually** to your MongoDB Atlas connection string, plus `GOOGLE_AI_API_KEY`.

### Railway / Fly.io
Same idea — bring your own MongoDB Atlas URL via env. There's no managed Mongo plugin on Render/Railway, so Atlas (free M0 tier) is the easiest.

## Migrating data from Supabase (one-time)

```bash
# 1. Set Supabase creds in .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
# 2. Set DATABASE_URL to the NEW MongoDB
npx prisma db push
npm run db:export       # writes ./export/*.json
npm run db:import       # loads into MongoDB (remaps UUIDs → ObjectIds)
```

⚠️ **Passwords don't transfer** — all imported users get a placeholder hash and must use **Forgot Password** to set a new one.
⚠️ **IDs change** — old Supabase UUIDs are remapped to new Mongo ObjectIds. Bookmark/permalink URLs that embed UUIDs will break; slug-based URLs keep working.

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

Tell me when the backend is deployed and I'll do the frontend migration.
