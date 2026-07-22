# Bug Hunt Report — aI_course_creator

Date: 2026-07-22
Scope: full repository (React/Vite frontend, Express/Mongoose backend, Supabase edge functions).

## How this was checked
- `npm ci` + `npm run build` (frontend) — build succeeds.
- `npx tsc -p tsconfig.app.json --noEmit` (frontend) — **fails, 6 errors**.
- `npm run lint` (frontend) — **fails, 228 errors / 30 warnings**.
- `npm test` (frontend) — passes (only 1 trivial test exists).
- `cd backend && npm install && npx tsc --noEmit` — passes.
- Manual review of pages, hooks, the custom Supabase-compat client, and backend routes.

Severity legend: **High** = user-visible breakage / data or security risk · **Medium** = incorrect behavior or missing safety net · **Low** = hygiene / maintainability.

---

## High severity

### H1. Quiz page crashes for any lesson with an empty quiz
`src/pages/QuizPage.tsx`

After the topic loads, the component computes `const q = topic.quiz[i]` and renders `{q.q}` / `q.options` with no guard for an empty quiz array. Topics are frequently created with `quiz: []` (see `create-topic` / `create-course-from-doc` in the client, and `generate-lesson` in `continue` mode which does not require 4 questions). If a user opens the quiz for such a topic:
- `total = topic.quiz.length = 0`
- `q = topic.quiz[0] = undefined`
- render `q.q` → `TypeError: Cannot read properties of undefined (reading 'q')` → white screen.

The progress bar also computes `((i)/total)*100 = NaN%`.

Fix: guard for `topic.quiz.length === 0` (show an "no quiz yet" state) before rendering questions.

### H2. Bookmark "Resume" never returns to the saved page (and never to the saved word)
`src/pages/TopicPage.tsx` (lines ~36–54), `src/pages/Bookmarks.tsx` (line ~91)

Bookmarks store `page_index` / `word_index`, and the Bookmarks page links to `.../topic/<slug>#p=<n>&w=<w>`. TopicPage has two effects:
1. Hash effect (dep `[slug]`) reads `#p=` and calls `setPageIdx(n-1)` synchronously.
2. Load effect (dep `[slug, course?.id]`) fetches topics and, on resolve, calls `setPageIdx(0)` **unconditionally**.

Because the fetch resolves after the hash effect, step 2 always overwrites the resumed page back to 0. Result: "Resume" always lands on page 1. Additionally the `w=` word index is parsed nowhere and `karaokeSeek` is never called on load, so word-level resume is entirely unimplemented. The bookmark feature's core promise (resume where you left off) does not work.

Fix: don't reset to page 0 when a hash target exists (or apply the hash after the topic loads), and apply the word offset via `karaokeSeek`.

### H3. Image block upload is broken and type-unsound
`src/integrations/supabase/client.ts` (lines ~1197–1208), `src/components/BlockEditor.tsx` (lines ~129–131)

The storage stub is:
```ts
storage: { from() { return {
  async upload() { return { error: new Error("Storage uploads are not configured...") }; },
  getPublicUrl(path) { return { data: { publicUrl: path } }; },
}; } }
```
But BlockEditor calls `supabase.storage.from("lesson-images").upload(path, file, {...})` and `getPublicUrl(path)`. So:
- `from()` / `upload()` are declared with 0 params yet called with 1 and 3 args → the 3 `tsc` errors below.
- Even ignoring types, `upload()` ignores its arguments and always returns an error, so uploading an image in the block editor always fails with "Storage uploads are not configured on the backend API yet".

There is no backend upload endpoint at all, so the "Upload image" path in the editor is dead. Either implement an upload route or hide/disable the upload UI (the "paste URL" and "AI generate" paths still work).

---

## Medium severity

### M1. Frontend does not type-check — 6 errors ship silently
The Vite build uses `@vitejs/plugin-react-swc`, which transpiles without type-checking, so `npm run build` is green while `tsc` is red. There is no `typecheck` script and (apparently) no gate, so these real type holes ship:

```
src/components/BlockEditor.tsx(129,53): TS2554 Expected 0 arguments, but got 1.
src/components/BlockEditor.tsx(129,77): TS2554 Expected 0 arguments, but got 3.
src/components/BlockEditor.tsx(131,51): TS2554 Expected 0 arguments, but got 1.
src/hooks/useAuth.tsx(21,18):        TS2345 stub Session missing refresh_token/expires_in/token_type.
src/hooks/useTopics.ts(64,56):       TS2554 Expected 1 arguments, but got 2.  (upsert onConflict)
src/hooks/useTopics.ts(78,8):        TS2554 Expected 1 arguments, but got 2.  (upsert onConflict)
```
Notable consequences:
- `useAuth.tsx`: the fake `session` object is missing fields the real `@supabase/supabase-js` `Session` type requires; any code that reads `session.refresh_token` etc. would get `undefined` at runtime.
- `useTopics.ts`: `upsert(payload, { onConflict: "user_id,topic_id" })` passes a second argument the stub silently ignores. It happens to work because the backend `PUT /progress` handles conflicts, but the client contract is wrong.

Fix: add a `"typecheck": "tsc -p tsconfig.app.json --noEmit"` script, align the stub signatures with how they're called, and run it in CI.

### M2. `.env` files are committed to the repository
Tracked files include `.env`, `.env.development`, `.env.production` (only `.env.example` should be). `.gitignore` does **not** list `.env`. `.env` contains the Supabase URL + publishable/anon key. While the Supabase *anon* key is designed to be public, committing real `.env` files is a leak vector — the moment a secret (service key, private API key) is added to `.env`, it will be committed automatically.

Fix: `git rm --cached .env .env.development .env.production`, add `.env*` (except `!.env.example`) to `.gitignore`, and rotate anything sensitive that was exposed.

### M3. Backend default `PORT` disagrees with the rest of the project
`backend/src/env.ts` line 22: `PORT: parseInt(process.env.PORT || "8080", 10)`.
The frontend defaults `VITE_API_URL` to `http://localhost:5000`, and both the backend README and `backend/.env.example` use `5000`. If a developer runs the backend without `PORT` set, it listens on 8080 while the frontend calls 5000 → all API calls fail to connect.

Fix: default to `5000` to match the documented setup (or document 8080 consistently everywhere).

### M4. Deleting a user orphans their data
`backend/src/routes/admin.ts` (`DELETE /admin/users/:id`) removes the `User` and `UserRole` docs but not that user's `Bookmark`, `TopicProgress`, or `UserAiKey` documents. These become orphaned rows referencing a non-existent user (and an encrypted API key is left in the DB).

Fix: also `deleteMany` on `Bookmark`, `TopicProgress`, and `UserAiKey` for that `userId`.

### M5. `.docx` export produces a corrupt file
`src/integrations/supabase/client.ts` `export-course` returns `docx: btoa(<plain text>)`, and `src/pages/CourseDetail.tsx` downloads it as `application/vnd.openxmlformats-officedocument.wordprocessingml.document` with a `.docx` extension. The bytes are plain text, not OOXML, so the downloaded "Word document" is invalid and won't open in Word. Either generate a real .docx or export as `.txt`.

---

## Low severity / hygiene

### L1. Lint is completely red (228 errors)
`npm run lint` fails with 228 errors / 30 warnings — overwhelmingly `@typescript-eslint/no-explicit-any`, plus `prefer-const` (`create-topic`, `create-course-from-doc`), `no-useless-escape` (`generate-lesson`), and `no-require-imports` (`tailwind.config.ts`). 3 errors + 6 warnings are auto-fixable with `eslint --fix`. Because lint never passes, it cannot be used as a CI gate.

### L2. Supabase edge functions are dead / diverging code
The app talks to the custom Express backend through the `supabase` compat shim in `src/integrations/supabase/client.ts` (its `functions.invoke` reimplements everything client-side). The `supabase/functions/*` Deno functions are never called by the running app and already diverge from the shim (e.g. the shim's `generate-image` returns an inline SVG placeholder). This is a large body of misleading dead code; either wire it up or remove it to avoid "fixing" the wrong implementation.

### L3. Single oversized JS bundle
`npm run build` emits `dist/assets/index-*.js` at ~3.7 MB (~1 MB gzip) and warns about chunks >500 kB. Consider route-level `dynamic import()` / `manualChunks` (the heavy `three`, `mermaid`, `shiki`, `cytoscape` deps are prime candidates).

### L4. `backend/.env.example` ships a real personal email with a typo
`SUPER_ADMIN_EMAILS=soheljavadeveloper@gmail.com,sohejavadeveloper@gmail.com` — the second value looks like a typo of the first (missing an `l`). Bootstrapping super-admins off an example file is risky; at minimum fix the typo and consider a placeholder.

### L5. Quiz progress bar off-by-one
`src/pages/QuizPage.tsx` line ~94 animates width to `((i)/total)*100`, so it shows 0% on Q1 and never reaches 100% (it jumps to the results screen from `((total-1)/total)*100`). Cosmetic; use `(i+1)/total` or drive it off answered count.

---

## Summary table

| # | Severity | Area | One-liner |
|---|----------|------|-----------|
| H1 | High | QuizPage | Crashes when a topic has an empty quiz array |
| H2 | High | TopicPage/Bookmarks | "Resume" always resets to page 1; word resume unimplemented |
| H3 | High | BlockEditor/client | Image upload always fails and is type-unsound |
| M1 | Medium | build/types | 6 `tsc` errors ship because SWC skips type-checking |
| M2 | Medium | repo hygiene | `.env` files committed & not git-ignored |
| M3 | Medium | backend env | Default `PORT` 8080 vs. 5000 used everywhere else |
| M4 | Medium | backend admin | User deletion orphans bookmarks/progress/ai-keys |
| M5 | Medium | export | `.docx` download is plain text → corrupt file |
| L1 | Low | lint | 228 ESLint errors; lint never passes |
| L2 | Low | dead code | Unused, diverging Supabase edge functions |
| L3 | Low | perf | 3.7 MB single JS bundle |
| L4 | Low | config | Real email + typo in `backend/.env.example` |
| L5 | Low | UI | Quiz progress bar off-by-one |
