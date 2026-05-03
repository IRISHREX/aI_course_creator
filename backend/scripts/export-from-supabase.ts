// Exports all relevant tables from Supabase to ./export/*.json
// Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run db:export
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TABLES = [
  "profiles", "user_roles", "courses", "topics", "topic_versions",
  "bookmarks", "topic_progress", "course_pyq", "pyq_topics",
];

mkdirSync("export", { recursive: true });

async function dumpTable(name: string) {
  const all: any[] = [];
  let from = 0; const pageSize = 1000;
  while (true) {
    const { data, error } = await sb.from(name).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${name}: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  writeFileSync(`export/${name}.json`, JSON.stringify(all, null, 2));
  console.log(`✓ ${name}: ${all.length} rows`);
}

// auth.users — needs admin API
async function dumpAuthUsers() {
  const all: any[] = [];
  let page = 1; const perPage = 1000;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < perPage) break;
    page++;
  }
  writeFileSync("export/auth_users.json", JSON.stringify(all, null, 2));
  console.log(`✓ auth_users: ${all.length} rows`);
}

await dumpAuthUsers();
for (const t of TABLES) await dumpTable(t);
console.log("Done. Files in ./export/");
