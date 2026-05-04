import { Schema, model, Types, InferSchemaType } from "mongoose";

const opts = { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } };

// ----- User -----
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: null },
  },
  opts,
);
export const User = model("User", UserSchema);

// ----- UserRole -----
export const APP_ROLES = ["user", "admin", "super_admin"] as const;
export type AppRole = (typeof APP_ROLES)[number];
const UserRoleSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: APP_ROLES, required: true },
  },
  opts,
);
UserRoleSchema.index({ userId: 1, role: 1 }, { unique: true });
export const UserRole = model("UserRole", UserRoleSchema);

// ----- UserAiKey -----
const UserAiKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: String, default: "google" },
    encryptedKey: { type: String, required: true },
    keyPreview: { type: String, default: null },
    status: { type: String, default: "active" },
    lastError: { type: String, default: null },
  },
  opts,
);
UserAiKeySchema.index({ userId: 1, status: 1, updatedAt: 1 });
export const UserAiKey = model("UserAiKey", UserAiKeySchema);

// ----- Course -----
const CourseSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    coverEmoji: { type: String, default: "📡" },
    orderIndex: { type: Number, default: 0 },
    sourceText: { type: String, default: null },
    generationStatus: { type: String, default: "ready" },
    tags: { type: Schema.Types.Mixed, default: [] },
    mindmap: { type: Schema.Types.Mixed, default: null },
    toc: { type: Schema.Types.Mixed, default: [] },
  },
  opts,
);
export const Course = model("Course", CourseSchema);

// ----- Topic -----
const TopicSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    slug: { type: String, required: true, unique: true },
    unit: { type: Number, required: true },
    orderIndex: { type: Number, required: true },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    content: { type: Schema.Types.Mixed, default: [] },
    quiz: { type: Schema.Types.Mixed, default: [] },
    mindmap: { type: Schema.Types.Mixed, default: null },
    visualization: { type: String, default: null },
    difficultyLevel: { type: Number, default: 5 },
    generationStatus: { type: String, default: "ready" },
  },
  opts,
);
export const Topic = model("Topic", TopicSchema);

// ----- TopicVersion -----
const TopicVersionSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    content: { type: Schema.Types.Mixed, default: [] },
    quiz: { type: Schema.Types.Mixed, default: [] },
    mindmap: { type: Schema.Types.Mixed, default: null },
    visualization: { type: String, default: null },
    note: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  opts,
);
export const TopicVersion = model("TopicVersion", TopicVersionSchema);

// ----- Bookmark -----
const BookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    pageIndex: { type: Number, default: 0 },
    wordIndex: { type: Number, default: 0 },
    label: { type: String, default: null },
  },
  opts,
);
export const Bookmark = model("Bookmark", BookmarkSchema);

// ----- TopicProgress -----
const TopicProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    viewed: { type: Boolean, default: false },
    passed: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    bestQuizScore: { type: Number, default: 0 },
  },
  opts,
);
TopicProgressSchema.index({ userId: 1, topicId: 1 }, { unique: true });
export const TopicProgress = model("TopicProgress", TopicProgressSchema);

// ----- CoursePyq -----
const CoursePyqSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, default: "" },
    marks: { type: Number, default: null },
    year: { type: Number, default: null },
    source: { type: String, default: null },
    ingestionSource: { type: String, default: "manual" },
    orderIndex: { type: Number, default: 0 },
    topicIds: { type: [Schema.Types.ObjectId], default: [], index: true },
  },
  opts,
);
export const CoursePyq = model("CoursePyq", CoursePyqSchema);

export { Types };
