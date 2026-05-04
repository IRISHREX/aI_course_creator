// Imports ./export/*.json into MongoDB via Mongoose.
// Supabase UUIDs → fresh Mongo ObjectIds, FKs rewritten via in-memory map.
// Users get a placeholder password hash — they MUST reset password after migration.
// Run: npm run db:import
import { readFileSync, existsSync } from "node:fs";
import bcrypt from "bcryptjs";
import { connectDb, mongoose } from "../src/db.js";
import {
  User, UserRole, Course, Topic, TopicVersion,
  Bookmark, TopicProgress, CoursePyq, Types,
} from "../src/models.js";

function load(name: string): any[] {
  const p = `export/${name}.json`;
  if (!existsSync(p)) { console.warn(`! missing ${p}, skipping`); return []; }
  return JSON.parse(readFileSync(p, "utf-8"));
}

await connectDb();
const PLACEHOLDER_PW = await bcrypt.hash(`reset-${Date.now()}-${Math.random()}`, 10);

const idMap: Record<string, Record<string, string>> = {
  user: {}, course: {}, topic: {}, pyq: {},
};
const oid = (v: string) => new Types.ObjectId(v);

async function importUsers() {
  const authUsers = load("auth_users");
  const profileById = new Map(load("profiles").map(p => [p.id, p]));
  for (const u of authUsers) {
    const p = profileById.get(u.id);
    const created = await User.create({
      email: (u.email || `${u.id}@unknown.local`).toLowerCase(),
      passwordHash: PLACEHOLDER_PW,
      displayName: p?.display_name || u.email?.split("@")[0] || null,
      createdAt: new Date(u.created_at || Date.now()),
    });
    idMap.user[u.id] = String(created._id);
  }
  console.log(`✓ users: ${authUsers.length}`);
}

async function importRoles() {
  const rows = load("user_roles");
  for (const r of rows) {
    const userId = idMap.user[r.user_id];
    if (!userId) continue;
    await UserRole.updateOne({ userId, role: r.role }, { $setOnInsert: { userId, role: r.role } }, { upsert: true });
  }
  console.log(`✓ user_roles: ${rows.length}`);
}

async function importCourses() {
  const rows = load("courses");
  for (const c of rows) {
    const created = await Course.create({
      slug: c.slug, title: c.title, description: c.description || "",
      coverEmoji: c.cover_emoji, orderIndex: c.order_index || 0,
      sourceText: c.source_text, generationStatus: c.generation_status || "ready",
      tags: c.tags || [], mindmap: c.mindmap, toc: c.toc,
      createdAt: new Date(c.created_at), updatedAt: new Date(c.updated_at),
    });
    idMap.course[c.id] = String(created._id);
  }
  console.log(`✓ courses: ${rows.length}`);
}

async function importTopics() {
  const rows = load("topics");
  for (const t of rows) {
    const courseId = idMap.course[t.course_id];
    if (!courseId) continue;
    const created = await Topic.create({
      courseId: oid(courseId), slug: t.slug, unit: t.unit,
      orderIndex: t.order_index, title: t.title, summary: t.summary,
      content: t.content || [], quiz: t.quiz || [], mindmap: t.mindmap,
      visualization: t.visualization, difficultyLevel: t.difficulty_level || 5,
      generationStatus: t.generation_status || "ready",
      createdAt: new Date(t.created_at), updatedAt: new Date(t.updated_at),
    });
    idMap.topic[t.id] = String(created._id);
  }
  console.log(`✓ topics: ${rows.length}`);
}

async function importTopicVersions() {
  const rows = load("topic_versions");
  for (const v of rows) {
    const topicId = idMap.topic[v.topic_id];
    if (!topicId) continue;
    await TopicVersion.create({
      topicId: oid(topicId), title: v.title, summary: v.summary || "",
      content: v.content || [], quiz: v.quiz || [], mindmap: v.mindmap,
      visualization: v.visualization, note: v.note,
      createdBy: v.created_by && idMap.user[v.created_by] ? oid(idMap.user[v.created_by]) : undefined,
      createdAt: new Date(v.created_at),
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
    await Bookmark.create({
      userId: oid(userId), topicId: oid(topicId), courseId: oid(courseId),
      pageIndex: b.page_index || 0, wordIndex: b.word_index || 0, label: b.label,
      createdAt: new Date(b.created_at),
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
    await TopicProgress.updateOne(
      { userId, topicId },
      { $setOnInsert: { userId, topicId, viewed: p.viewed, passed: p.passed, attempts: p.attempts, bestQuizScore: p.best_quiz_score } },
      { upsert: true },
    );
  }
  console.log(`✓ topic_progress: ${rows.length}`);
}

async function importPyqs() {
  const rows = load("course_pyq");
  const links = load("pyq_topics");
  const linksByPyq = new Map<string, string[]>();
  for (const l of links) {
    if (!linksByPyq.has(l.pyq_id)) linksByPyq.set(l.pyq_id, []);
    linksByPyq.get(l.pyq_id)!.push(l.topic_id);
  }

  for (const p of rows) {
    const courseId = idMap.course[p.course_id];
    if (!courseId) continue;
    const topicIds = (linksByPyq.get(p.id) || [])
      .map(tid => idMap.topic[tid]).filter(Boolean).map(oid);
    if (p.topic_id && idMap.topic[p.topic_id]) topicIds.push(oid(idMap.topic[p.topic_id]));
    const created = await CoursePyq.create({
      courseId: oid(courseId), topicIds,
      question: p.question, answer: p.answer || "", marks: p.marks, year: p.year,
      source: p.source, ingestionSource: p.ingestion_source || "manual",
      orderIndex: p.order_index || 0,
      createdAt: new Date(p.created_at), updatedAt: new Date(p.updated_at),
    });
    idMap.pyq[p.id] = String(created._id);
  }
  console.log(`✓ course_pyq: ${rows.length} (with ${links.length} topic links inlined)`);
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
await mongoose.disconnect();
