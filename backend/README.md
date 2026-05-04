# IGNOUprep — Custom Backend (MongoDB + Mongoose)

Express + Mongoose + MongoDB + JWT auth. Replaces Lovable Cloud / Supabase.

## Stack
- **Node 20 + Express 4** — REST API
- **Mongoose 8** — ODM for MongoDB
- **MongoDB 6+** — database (Atlas or self-hosted)
- **JWT (HS256) + bcrypt** — auth
- **Zod** — validation
- **nodemon + tsx** — dev hot-reload

## Local development

```bash
cd backend
cp .env.example .env       # fill DATABASE_URL (mongodb+srv://...), JWT_SECRET
npm install
npm run dev                # http://localhost:5000  (nodemon + tsx watch)
```

Mongoose creates collections and indexes on demand — no migration step required.

## Deploy

### Render
Push the `backend/` folder, then in Render → New → Blueprint → point at this repo. `render.yaml` provisions the web service. **Set `DATABASE_URL`** to your MongoDB Atlas connection string, plus `GOOGLE_AI_API_KEY`.

### Railway / Fly.io
Same idea — bring your own MongoDB Atlas URL via env. Atlas (free M0 tier) is the easiest option.

## Migrating data from Supabase (one-time)

```bash
# 1. Set Supabase creds in .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
# 2. Set DATABASE_URL to the NEW MongoDB
npm run db:export       # writes ./export/*.json
npm run db:import       # loads into MongoDB (remaps UUIDs → ObjectIds)
```

⚠️ **Passwords don't transfer** — all imported users get a placeholder hash and must use **Forgot Password** to set a new one.
⚠️ **IDs change** — old Supabase UUIDs are remapped to new Mongo ObjectIds. Slug-based URLs keep working; UUID-based permalinks will break.

## API surface

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/signup`, `/auth/login` | public |
| GET/PATCH | `/auth/me` | user |
| GET  | `/courses`, `/courses/:slug` | public |
| POST/PATCH/DELETE | `/courses` | admin |
| GET  | `/topics`, `/topics/:id`, `/topics/by-slug/:slug` | public |
| POST/PATCH/DELETE | `/topics` | admin |
| GET  | `/topics/:id/versions`, POST `/topics/:id/revert/:versionId` | admin |
| GET/POST/DELETE | `/bookmarks` | user |
| GET/PUT | `/progress` | user |
| GET  | `/pyq?courseId=&topicId=&year=` | public |
| POST/PATCH/DELETE | `/pyq` | admin |
| POST/DELETE | `/pyq/:id/topics(/:topicId)` | admin |
| GET  | `/admin/stats` | admin |
| GET/POST/DELETE | `/admin/users`, `/admin/roles` | super_admin |
| GET/POST/DELETE/POST `/check` | `/ai-keys` | admin |
| POST | `/ai/chat` (proxy to Gemini) | admin |
