// Imports ./export/*.json into the Prisma+MongoDB database.
// Supabase UUIDs are remapped to fresh Mongo ObjectIds; FKs are rewritten via an in-memory map.
// Users get a placeholder password hash — they MUST reset password after migration.
// Run: npm run db:import
import { readFileSync, existsSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function load(name: string): any[] {
  const p = `export/${name}.json`;
  if (!existsSync(p)) { console.warn(`! missing ${p}, skipping`); return []; }
  return JSON.parse(readFileSync(p, "utf-8"));
}

const PLACEHOLDER_PW = await bcrypt.hash(`reset-${Date.now()}-${Math.random()}`, 10);

// Maps old Supabase UUIDs → new Mongo ObjectIds
const idMap: Record<string, Record<string, string>> = {
  user: {}, course: {}, topic: {}, pyq: {},
};

async function importUsers() {
  const authUsers = load("auth_users");
  const profiles = load("profiles");
  const profileById = new Map(profiles.map(p => [p.id, p]));
  for (const u of authUsers) {
    const p = profileById.get(u.id);
    const created = await prisma.user.create({
      data: {
        email: (u.email || `${u.id}@unknown.local`).toLowerCase(),
        passwordHash: PLACEHOLDER_PW,
        displayName: p?.display_name || u.email?.split("@")[0] || null,
        createdAt: new Date(u.created_at || Date.now()),
      },
    });
    idMap.user[u.id] = created.id;
  }
  console.log(`✓ users: ${authUsers.length}`);
}

async function importRoles() {
  const rows = load("user_roles");
  for (const r of rows) {
    const userId = idMap.user[r.user_id];
    if (!userId) continue;
    await prisma.userRole.upsert({
      where: { userId_role: { userId, role: r.role } },
      update: {}, create: { userId, role: r.role },
    });
  }
  console.log(`✓ user_roles: ${rows.length}`);
}

async function importCourses() {
  const rows = load("courses");
  for (const c of rows) {
    const created = await prisma.course.create({
      data: {
        slug: c.slug, title: c.title, description: c.description || "",
        coverEmoji: c.cover_emoji, orderIndex: c.order_index || 0,
        sourceText: c.source_text, generationStatus: c.generation_status || "ready",
        tags: c.tags || [], mindmap: c.mindmap, toc: c.toc,
        createdAt: new Date(c.created_at), updatedAt: new Date(c.updated_at),
      },
    });
    idMap.course[c.id] = created.id;
  }
  console.log(`✓ courses: ${rows.length}`);
}

async function importTopics() {
  const rows = load("topics");
  for (const t of rows) {
    const courseId = idMap.course[t.course_id];
    if (!courseId) continue;
    const created = await prisma.topic.create({
      data: {
        courseId, slug: t.slug, unit: t.unit,
        orderIndex: t.order_index, title: t.title, summary: t.summary,
        content: t.content || [], quiz: t.quiz || [], mindmap: t.mindmap,
        visualization: t.visualization, difficultyLevel: t.difficulty_level || 5,
        generationStatus: t.generation_status || "ready",
        createdAt: new Date(t.created_at), updatedAt: new Date(t.updated_at),
      },
    });
    idMap.topic[t.id] = created.id;
  }
  console.log(`✓ topics: ${rows.length}`);
}

async function importTopicVersions() {
  const rows = load("topic_versions");
  for (const v of rows) {
    const topicId = idMap.topic[v.topic_id];
    if (!topicId) continue;
    await prisma.topicVersion.create({
      data: {
        topicId, title: v.title, summary: v.summary || "",
        content: v.content || [], quiz: v.quiz || [], mindmap: v.mindmap,
        visualization: v.visualization, note: v.note,
        createdBy: v.created_by ? idMap.user[v.created_by] : undefined,
        createdAt: new Date(v.created_at),
      },
    });
  }
  console.log(`✓ topic_versions: ${rows.length}`);
}

async function importBookmarks() {
  const rows = load("bookmarks");
  for (const b of rows) {
    const userId = idMap.user[b.user_id];
    const topicId = idMap.topic[b.topic_id];
    const courseId = idMap.course[b.course_id];
    if (!userId || !topicId || !courseId) continue;
    await prisma.bookmark.create({
      data: {
        userId, topicId, courseId,
        pageIndex: b.page_index || 0, wordIndex: b.word_index || 0, label: b.label,
        createdAt: new Date(b.created_at),
      },
    });
  }
  console.log(`✓ bookmarks: ${rows.length}`);
}

async function importProgress() {
  const rows = load("topic_progress");
  for (const p of rows) {
    const userId = idMap.user[p.user_id];
    const topicId = idMap.topic[p.topic_id];
    if (!userId || !topicId) continue;
    await prisma.topicProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      update: {},
      create: {
        userId, topicId, viewed: p.viewed,
        passed: p.passed, attempts: p.attempts, bestQuizScore: p.best_quiz_score,
      },
    });
  }
  console.log(`✓ topic_progress: ${rows.length}`);
}

async function importPyqs() {
  const rows = load("course_pyq");
  for (const p of rows) {
    const courseId = idMap.course[p.course_id];
    if (!courseId) continue;
    const created = await prisma.coursePyq.create({
      data: {
        courseId,
        topicId: p.topic_id ? idMap.topic[p.topic_id] : undefined,
        question: p.question, answer: p.answer || "", marks: p.marks, year: p.year,
        source: p.source, ingestionSource: p.ingestion_source || "manual",
        orderIndex: p.order_index || 0,
        createdAt: new Date(p.created_at), updatedAt: new Date(p.updated_at),
      },
    });
    idMap.pyq[p.id] = created.id;
  }
  console.log(`✓ course_pyq: ${rows.length}`);

  const links = load("pyq_topics");
  for (const l of links) {
    const pyqId = idMap.pyq[l.pyq_id];
    const topicId = idMap.topic[l.topic_id];
    if (!pyqId || !topicId) continue;
    await prisma.pyqTopic.upsert({
      where: { pyqId_topicId: { pyqId, topicId } },
      update: {}, create: { pyqId, topicId },
    });
  }
  console.log(`✓ pyq_topics: ${links.length}`);
}

await importUsers();
await importRoles();
await importCourses();
await importTopics();
await importTopicVersions();
await importBookmarks();
await importProgress();
await importPyqs();

console.log("\n✅ Import complete.");
console.log("⚠️  All users have placeholder passwords — they must use Forgot Password to set a new one.");
console.log("ℹ️  Old Supabase UUIDs were remapped to new Mongo ObjectIds; any external references will need updating.");
await prisma.$disconnect();
