// Imports ./export/*.json into the Prisma DB.
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

async function importUsers() {
  const authUsers = load("auth_users");
  const profiles = load("profiles");
  const profileByid = new Map(profiles.map(p => [p.id, p]));
  for (const u of authUsers) {
    const p = profileByid.get(u.id);
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: {
        id: u.id,
        email: (u.email || `${u.id}@unknown.local`).toLowerCase(),
        passwordHash: PLACEHOLDER_PW,
        displayName: p?.display_name || u.email?.split("@")[0] || null,
        createdAt: new Date(u.created_at || Date.now()),
      },
    });
  }
  console.log(`✓ users: ${authUsers.length}`);
}

async function importRoles() {
  const rows = load("user_roles");
  for (const r of rows) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId: r.user_id, role: r.role } },
      update: {}, create: { id: r.id, userId: r.user_id, role: r.role },
    });
  }
  console.log(`✓ user_roles: ${rows.length}`);
}

async function importCourses() {
  const rows = load("courses");
  for (const c of rows) {
    await prisma.course.upsert({
      where: { id: c.id }, update: {},
      create: {
        id: c.id, slug: c.slug, title: c.title, description: c.description || "",
        coverEmoji: c.cover_emoji, orderIndex: c.order_index || 0,
        sourceText: c.source_text, generationStatus: c.generation_status || "ready",
        tags: c.tags || [], mindmap: c.mindmap, toc: c.toc,
        createdAt: new Date(c.created_at), updatedAt: new Date(c.updated_at),
      },
    });
  }
  console.log(`✓ courses: ${rows.length}`);
}

async function importTopics() {
  const rows = load("topics");
  for (const t of rows) {
    await prisma.topic.upsert({
      where: { id: t.id }, update: {},
      create: {
        id: t.id, courseId: t.course_id, slug: t.slug, unit: t.unit,
        orderIndex: t.order_index, title: t.title, summary: t.summary,
        content: t.content || [], quiz: t.quiz || [], mindmap: t.mindmap,
        visualization: t.visualization, difficultyLevel: t.difficulty_level || 5,
        generationStatus: t.generation_status || "ready",
        createdAt: new Date(t.created_at), updatedAt: new Date(t.updated_at),
      },
    });
  }
  console.log(`✓ topics: ${rows.length}`);
}

async function importTopicVersions() {
  const rows = load("topic_versions");
  for (const v of rows) {
    await prisma.topicVersion.upsert({
      where: { id: v.id }, update: {},
      create: {
        id: v.id, topicId: v.topic_id, title: v.title, summary: v.summary || "",
        content: v.content || [], quiz: v.quiz || [], mindmap: v.mindmap,
        visualization: v.visualization, note: v.note, createdBy: v.created_by,
        createdAt: new Date(v.created_at),
      },
    });
  }
  console.log(`✓ topic_versions: ${rows.length}`);
}

async function importBookmarks() {
  const rows = load("bookmarks");
  for (const b of rows) {
    await prisma.bookmark.upsert({
      where: { id: b.id }, update: {},
      create: {
        id: b.id, userId: b.user_id, topicId: b.topic_id, courseId: b.course_id,
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
    await prisma.topicProgress.upsert({
      where: { userId_topicId: { userId: p.user_id, topicId: p.topic_id } },
      update: {},
      create: {
        id: p.id, userId: p.user_id, topicId: p.topic_id, viewed: p.viewed,
        passed: p.passed, attempts: p.attempts, bestQuizScore: p.best_quiz_score,
      },
    });
  }
  console.log(`✓ topic_progress: ${rows.length}`);
}

async function importPyqs() {
  const rows = load("course_pyq");
  for (const p of rows) {
    await prisma.coursePyq.upsert({
      where: { id: p.id }, update: {},
      create: {
        id: p.id, courseId: p.course_id, topicId: p.topic_id,
        question: p.question, answer: p.answer || "", marks: p.marks, year: p.year,
        source: p.source, ingestionSource: p.ingestion_source || "manual",
        orderIndex: p.order_index || 0,
        createdAt: new Date(p.created_at), updatedAt: new Date(p.updated_at),
      },
    });
  }
  console.log(`✓ course_pyq: ${rows.length}`);

  const links = load("pyq_topics");
  for (const l of links) {
    await prisma.pyqTopic.upsert({
      where: { pyqId_topicId: { pyqId: l.pyq_id, topicId: l.topic_id } },
      update: {}, create: { id: l.id, pyqId: l.pyq_id, topicId: l.topic_id },
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
await prisma.$disconnect();
