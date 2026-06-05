import { getAppSettings, getCourseSettings } from "@/lib/appSettings";

type Filter = { key: string; value: any; op: "eq" | "in" };
type Order = { key: string; ascending: boolean };
type ExportOptions = {
  includeImages?: boolean;
  includeGraphs?: boolean;
  includeCode?: boolean;
};

const API_URL = (import.meta.env.VITE_API_URL || "https://ai-course-creator-be.onrender.com").replace(/\/$/, "");
const TOKEN_KEY = "ignouprep.auth.token";
const AUTH_EVENT = "ignouprep:auth";
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 120000);

class ApiError extends Error {
  status?: number;
  code?: string;
  detail?: unknown;
  requestId?: string | null;
}

const keyMap: Record<string, string> = {
  course_id: "courseId",
  cover_emoji: "coverEmoji",
  order_index: "orderIndex",
  source_text: "sourceText",
  generation_status: "generationStatus",
  difficulty_level: "difficultyLevel",
  topic_id: "topicId",
  user_id: "userId",
  pyq_id: "pyqId",
  page_index: "pageIndex",
  word_index: "wordIndex",
  display_name: "displayName",
  best_quiz_score: "bestQuizScore",
  created_at: "createdAt",
  updated_at: "updatedAt",
  created_by: "createdBy",
  ingestion_source: "ingestionSource",
};
const reverseKeyMap = Object.fromEntries(Object.entries(keyMap).map(([k, v]) => [v, k]));

function toCamelKey(key: string) {
  return keyMap[key] || key;
}

function toSnakeKey(key: string) {
  return reverseKeyMap[key] || key;
}

function mapKeys(value: any, mapper: (key: string) => string): any {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, mapper));
  if (!value || typeof value !== "object" || value instanceof File || value instanceof Blob) return value;
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [mapper(key), mapKeys(val, mapper)]));
}

const toApi = (value: any) => mapKeys(value, toCamelKey);
const fromApi = (value: any) => mapKeys(value, toSnakeKey);

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    ...authHeaders(),
    ...(init.headers || {}),
  };
  try {
    const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store", signal: init.signal ?? controller.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new ApiError(data?.error || `API request failed (${res.status})`);
      error.status = res.status;
      error.code = data?.code;
      error.detail = data?.detail;
      error.requestId = data?.requestId || res.headers.get("x-request-id");
      throw error;
    }
    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const timeoutError = new ApiError("Request timed out. Please try again.");
      timeoutError.code = "REQUEST_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function currentUserFromToken(token: string | null) {
  if (!token) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(token.split(".")[1] || ""));
    return { id: payload.sub, email: payload.email, user_metadata: {} };
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function emitAuth() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

async function makeSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const { user, roles } = await api("/auth/me");
    return {
      access_token: token,
      refresh_token: "",
      expires_in: 0,
      expires_at: undefined,
      token_type: "bearer" as const,
      user: {
        id: user.id,
        aud: "authenticated",
        role: "authenticated",
        email: user.email,
        created_at: user.createdAt || new Date(0).toISOString(),
        user_metadata: { display_name: user.displayName },
        app_metadata: { roles },
      },
    };
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

function applyClientFilters(rows: any[], filters: Filter[]) {
  const read = (row: any, key: string) => key.split(".").reduce((value, part) => value?.[part], row);
  return filters.reduce((acc, filter) => {
    if (filter.op === "in") return acc.filter((row) => filter.value.includes(read(row, filter.key)));
    return acc.filter((row) => read(row, filter.key) === filter.value);
  }, rows);
}

function applyOrders(rows: any[], orders: Order[]) {
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const av = a[order.key];
      const bv = b[order.key];
      if (av === bv) continue;
      return (av > bv ? 1 : -1) * (order.ascending ? 1 : -1);
    }
    return 0;
  });
}

class BackendQuery {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitCount?: number;
  private singleRow = false;
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any;
  private countOnly = false;
  private returnData = false;

  constructor(private table: string) {}

  select(_columns = "*", options?: { count?: string; head?: boolean }) {
    // Don't override the operation if we're already doing a write operation
    if (this.op === "select") {
      this.op = "select";
    } else {
      // For insert/update/upsert/delete, just mark that we want to return data
      this.returnData = true;
    }
    this.countOnly = Boolean(options?.count && options?.head);
    return this;
  }

  eq(key: string, value: any) {
    this.filters.push({ key, value, op: "eq" });
    return this;
  }

  in(key: string, value: any[]) {
    this.filters.push({ key, value, op: "in" });
    return this;
  }

  order(key: string, options?: { ascending?: boolean }) {
    this.orders.push({ key, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.singleRow = true;
    return this;
  }

  single() {
    this.singleRow = true;
    return this;
  }

  insert(payload: any) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: any, _options?: any) {
    this.op = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private filterValue(key: string) {
    return this.filters.find((filter) => filter.key === key)?.value;
  }

  private async execute() {
    try {
      const result = await this.dispatch();
      return { data: result.data, error: null, count: result.count ?? null };
    } catch (error: any) {
      return { data: null, error, count: null };
    }
  }

  private async dispatch(): Promise<{ data: any; count?: number }> {
    if (this.op === "select") return this.selectRows();
    if (this.op === "insert") return this.insertRow();
    if (this.op === "update") return this.updateRows();
    if (this.op === "upsert") return this.upsertRows();
    return this.deleteRows();
  }

  private async selectRows() {
    let data: any;
    if (this.countOnly) {
      const stats = await this.tryStatsCount();
      if (typeof stats === "number") return { data: null, count: stats };
    }
    if (this.table === "courses") {
      const slug = this.filterValue("slug");
      data = slug ? (await api(`/courses/${encodeURIComponent(slug)}`)).course : (await api("/courses")).courses;
    } else if (this.table === "topics") {
      const slug = this.filterValue("slug");
      const id = this.filterValue("id");
      const courseId = this.filterValue("course_id");
      if (slug) data = (await api(`/topics/by-slug/${encodeURIComponent(slug)}`)).topic;
      else if (id) data = (await api(`/topics/${encodeURIComponent(id)}`)).topic;
      else data = (await api(`/topics${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`)).topics;
    } else if (this.table === "topic_progress") {
      data = (await api("/progress")).progress;
    } else if (this.table === "bookmarks") {
      data = (await api("/bookmarks")).bookmarks;
    } else if (this.table === "profiles") {
      const id = this.filterValue("id");
      const current = currentUserFromToken(localStorage.getItem(TOKEN_KEY));
      if (id && current?.id === id) {
        data = (await api("/auth/me")).user;
      } else {
        const users = (await api("/admin/users")).users;
        data = users.map((user: any) => ({ id: user.id, displayName: user.displayName, createdAt: user.createdAt }));
      }
    } else if (this.table === "user_roles") {
      const userId = this.filterValue("user_id");
      const current = currentUserFromToken(localStorage.getItem(TOKEN_KEY));
      if (userId && current?.id === userId) {
        data = (await api("/auth/me")).roles.map((role: string) => ({ userId, role }));
      } else {
        const users = (await api("/admin/users")).users;
        data = users.flatMap((user: any) => user.roles.map((role: any) => ({ userId: user.id, role: role.role })));
      }
    } else if (this.table === "course_pyq") {
      const courseId = this.filterValue("course_id");
      data = courseId ? (await api(`/pyq?courseId=${encodeURIComponent(courseId)}`)).pyqs : [];
    } else if (this.table === "pyq_topics") {
      const courseId = this.filterValue("course_pyq.course_id");
      data = (await api(`/pyq/topics${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`)).links;
    } else if (this.table === "topic_versions") {
      const topicId = this.filterValue("topic_id");
      data = topicId ? (await api(`/topics/${encodeURIComponent(topicId)}/versions`)).versions : [];
    } else {
      data = [];
    }

    data = fromApi(data);
    if (this.table === "pyq_topics" && Array.isArray(data)) {
      data = data.map((link) => ({ ...link, course_pyq: link.pyq }));
    }
    if (Array.isArray(data)) {
      data = applyClientFilters(data, this.filters);
      data = applyOrders(data, this.orders);
      if (this.limitCount) data = data.slice(0, this.limitCount);
    }
    const count = Array.isArray(data) ? data.length : data ? 1 : 0;
    if (this.countOnly) return { data: null, count };
    return { data: this.singleRow ? (Array.isArray(data) ? data[0] ?? null : data ?? null) : data, count };
  }

  private async tryStatsCount() {
    const statsKey: Record<string, string> = {
      profiles: "users",
      courses: "courses",
      topics: "topics",
      course_pyq: "pyqs",
    };
    const key = statsKey[this.table];
    if (!key) return undefined;
    try {
      const stats = await api("/admin/stats");
      return stats[key];
    } catch {
      return undefined;
    }
  }

  private async insertRow() {
    const body = toApi(this.payload);
    if (this.table === "courses") {
      const response = await api("/courses", { method: "POST", body: JSON.stringify(body) });
      return { data: fromApi(response.course ?? response.courses ?? response) };
    }
    if (this.table === "topics") {
      const response = await api("/topics", { method: "POST", body: JSON.stringify(body) });
      return { data: fromApi(response.topic ?? response.topics ?? response) };
    }
    if (this.table === "bookmarks") return { data: fromApi((await api("/bookmarks", { method: "POST", body: JSON.stringify(body) })).bookmark) };
    if (this.table === "course_pyq") return { data: fromApi((await api("/pyq", { method: "POST", body: JSON.stringify(body) })).pyq) };
    if (this.table === "pyq_topics") return { data: fromApi((await api(`/pyq/${body.pyqId}/topics`, { method: "POST", body: JSON.stringify({ topicId: body.topicId }) })).link) };
    if (this.table === "user_roles") return { data: await api("/admin/roles", { method: "POST", body: JSON.stringify({ ...body, grant: true }) }) };
    return { data: null };
  }

  private async updateRows() {
    const id = this.filterValue("id");
    const body = toApi(this.payload);
    if (this.table === "courses") return { data: fromApi((await api(`/courses/${id}`, { method: "PATCH", body: JSON.stringify(body) })).course) };
    if (this.table === "topics") return { data: fromApi((await api(`/topics/${id}`, { method: "PATCH", body: JSON.stringify(body) })).topic) };
    if (this.table === "course_pyq") return { data: fromApi((await api(`/pyq/${id}`, { method: "PATCH", body: JSON.stringify(body) })).pyq) };
    return { data: null };
  }

  private async upsertRows() {
    const body = toApi(this.payload);
    if (this.table === "topic_progress") return { data: fromApi((await api("/progress", { method: "PUT", body: JSON.stringify(body) })).progress) };
    if (this.table === "profiles") return { data: fromApi((await api("/auth/me", { method: "PATCH", body: JSON.stringify(body) })).user) };
    return this.insertRow();
  }

  private async deleteRows() {
    const id = this.filterValue("id");
    if (this.table === "courses") return { data: await api(`/courses/${id}`, { method: "DELETE" }) };
    if (this.table === "topics") return { data: await api(`/topics/${id}`, { method: "DELETE" }) };
    if (this.table === "bookmarks") return { data: await api(`/bookmarks/${id}`, { method: "DELETE" }) };
    if (this.table === "course_pyq") return { data: await api(`/pyq/${id}`, { method: "DELETE" }) };
    if (this.table === "pyq_topics") return { data: await api(`/pyq/${this.filterValue("pyq_id")}/topics/${this.filterValue("topic_id")}`, { method: "DELETE" }) };
    if (this.table === "user_roles") return { data: await api("/admin/roles", { method: "POST", body: JSON.stringify({ userId: this.filterValue("user_id"), role: this.filterValue("role"), grant: false }) }) };
    return { data: null };
  }
}

function parseJsonPayload(text: string, fallback: any) {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        // Continue to the loose extraction below.
      }
    }
    const objectStart = trimmed.indexOf("{");
    const arrayStart = trimmed.indexOf("[");
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);
    if (!starts.length) return fallback;
    const start = Math.min(...starts);
    const end = trimmed[start] === "[" ? trimmed.lastIndexOf("]") : trimmed.lastIndexOf("}");
    if (end <= start) return fallback;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return fallback;
    }
  }
}

const SUPPORTED_BLOCK_TYPES = new Set(["text", "list", "highlight", "table", "code", "flowchart", "chart", "image", "math", "timeline"]);

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null) return false;
      if (typeof entry === "string") return entry.trim().length > 0;
      if (Array.isArray(entry)) return entry.length > 0;
      return true;
    }),
  ) as T;
}

function normalizeMermaidFlowchart(value: unknown): string {
  const code = cleanString(value);
  if (!code) return "";
  const mermaidCode = /^(graph|flowchart)\s+(TD|TB|BT|LR|RL)\b/i.test(code) ? code : /^[A-Za-z0-9_ -]+(-->|---|==>|-.->)/.test(code) ? `graph TD\n  ${code}` : "";
  if (!mermaidCode) return "";
  return mermaidCode.replace(/\b([A-Za-z][\w-]*)\s*([\[{])([^"{}\[\]\n]+)([\]}])/g, (_match, id, open, label, close) => {
    const safeLabel = String(label).replace(/\s+/g, " ").trim().replace(/"/g, "'");
    return `${id}${open}"${safeLabel}"${close}`;
  });
}

function normalizeMathValue(value: unknown, caption: unknown = "") {
  const raw = cleanString(value);
  const rawCaption = cleanString(caption);
  if (!raw) return { value: "", caption: rawCaption };

  const patterns = [
    /\$\$([\s\S]+?)\$\$/,
    /\$([^$\n]+?)\$/,
    /\\\[([\s\S]+?)\\\]/,
    /\\\(([\s\S]+?)\\\)/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const equation = cleanString(match[1]);
    const prose = cleanString(raw.replace(match[0], " ").replace(/\s+/g, " "));
    return {
      value: equation,
      caption: [prose, rawCaption].filter(Boolean).join(" "),
    };
  }

  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    const score = (line: string) => (line.match(/[\\^_=+\-*/]|\\begin|\\frac|\\sum|\\int|\\sqrt/g) || []).length;
    const equationIndex = lines.reduce((best, line, index) => score(line) > score(lines[best]) ? index : best, 0);
    if (score(lines[equationIndex]) > 0) {
      return {
        value: lines[equationIndex].replace(/^\$\$?|\$\$?$/g, "").trim(),
        caption: [...lines.slice(0, equationIndex), ...lines.slice(equationIndex + 1), rawCaption].filter(Boolean).join(" "),
      };
    }
  }

  return { value: raw.replace(/^\$\$?|\$\$?$/g, "").trim(), caption: rawCaption };
}

function normalizeLessonBlock(block: any) {
  if (!block || typeof block !== "object" || !SUPPORTED_BLOCK_TYPES.has(block.type)) return null;
  const title = cleanString(block.title);

  if (block.type === "text") {
    const value = cleanString(block.value ?? block.text);
    return value ? compact({ type: "text", title, value }) : null;
  }
  if (block.type === "highlight") {
    const value = cleanString(block.value);
    return value ? { type: "highlight", value } : null;
  }
  if (block.type === "list") {
    const items = Array.isArray(block.items) ? block.items.map(cleanString).filter(Boolean) : [];
    return items.length ? compact({ type: "list", title, items }) : null;
  }
  if (block.type === "table") {
    const headers = Array.isArray(block.headers) ? block.headers.map(cleanString).filter(Boolean) : [];
    const rows = Array.isArray(block.rows)
      ? block.rows.filter(Array.isArray).map((row: unknown[]) => row.map(cleanString)).filter((row: string[]) => row.some(Boolean))
      : [];
    return headers.length && rows.length ? compact({ type: "table", title, headers, rows }) : null;
  }
  if (block.type === "code") {
    const value = cleanString(block.value ?? block.code);
    const language = cleanString(block.language || "plaintext");
    const caption = cleanString(block.caption);
    return value ? compact({ type: "code", title, language, value, caption }) : null;
  }
  if (block.type === "flowchart") {
    const code = normalizeMermaidFlowchart(block.code || block.value);
    return code ? compact({ type: "flowchart", title, code }) : null;
  }
  if (block.type === "chart") {
    const variant = ["bar", "line", "pie"].includes(block.variant) ? block.variant : "bar";
    const data = Array.isArray(block.data)
      ? block.data.map((item: any) => ({ name: cleanString(item?.name), value: Number(item?.value) })).filter((item: any) => item.name && Number.isFinite(item.value))
      : [];
    return data.length ? compact({ type: "chart", title, variant, data }) : null;
  }
  if (block.type === "image") {
    const url = cleanString(block.url);
    const caption = cleanString(block.caption || block.prompt);
    const prompt = cleanString(block.prompt || block.caption);
    return caption || prompt || url ? compact({ type: "image", title, url, caption, prompt }) : null;
  }
  if (block.type === "math") {
    const { value, caption } = normalizeMathValue(block.value, block.caption);
    return value ? compact({ type: "math", title, value, display: block.display !== false, caption }) : null;
  }
  if (block.type === "timeline") {
    const rawItems = Array.isArray(block.timeline_items) ? block.timeline_items : Array.isArray(block.items) ? block.items : [];
    const items = rawItems
      .map((item: any) => ({ label: cleanString(item?.label), desc: cleanString(item?.desc) }))
      .filter((item: any) => item.label && item.desc);
    return items.length ? compact({ type: "timeline", title, items }) : null;
  }
  return null;
}

function normalizeLessonContent(content: unknown) {
  const blocks = Array.isArray(content) ? content.map(normalizeLessonBlock).filter(Boolean) : [];
  return blocks.slice(0, 15);
}

const EXPLAINED_BLOCK_TYPES = new Set(["flowchart", "chart", "math", "code"]);

function ensureExplanatoryHighlights(blocks: any[]) {
  const result: any[] = [];
  blocks.forEach((block, index) => {
    result.push(block);
    if (!block || !EXPLAINED_BLOCK_TYPES.has(block.type)) return;
    const next = blocks[index + 1];
    if (next?.type === "highlight") return;
    const label = block.type === "flowchart" ? "diagram" : block.type === "chart" ? "graph" : block.type;
    const title = cleanString(block.title || block.caption);
    result.push({
      type: "highlight",
      value: `This ${label}${title ? ` (${title})` : ""} shows the key relationship to remember; connect it back to the lesson concept before moving on.`,
    });
  });
  return result.slice(0, 18);
}

function normalizeQuiz(quiz: unknown) {
  if (!Array.isArray(quiz)) return [];
  return quiz
    .map((item: any) => {
      const q = cleanString(item?.q ?? item?.question);
      const options = Array.isArray(item?.options) ? item.options.map(cleanString).filter(Boolean).slice(0, 4) : [];
      const answer = Number(item?.answer);
      if (!q || options.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) return null;
      return { q, options, answer };
    })
    .filter(Boolean)
    .slice(0, 10);
}

type MindmapNode = { id: string; label: string; info?: string; children?: MindmapNode[] };

function normalizeMindmapNode(value: unknown, fallbackLabel = "Mind Map", depth = 0): MindmapNode | null {
  if (!value || typeof value !== "object" || depth > 6) return null;
  const raw = value as { id?: unknown; label?: unknown; title?: unknown; name?: unknown; info?: unknown; detail?: unknown; description?: unknown; summary?: unknown; children?: unknown };
  const label = cleanString(raw.label ?? raw.title ?? raw.name).replace(/\s+/g, " ").slice(0, 90);
  if (!label) return null;
  const info = cleanString(raw.info ?? raw.detail ?? raw.description ?? raw.summary).replace(/\s+/g, " ").slice(0, 140);
  const children = Array.isArray(raw.children)
    ? raw.children
        .map((child, index) => normalizeMindmapNode(child, `${label}-${index}`, depth + 1))
        .filter((child): child is MindmapNode => Boolean(child))
        .slice(0, depth === 0 ? 10 : 8)
    : [];
  return {
    id: cleanString(raw.id).replace(/\s+/g, "-").slice(0, 80) || slugify(`${fallbackLabel}-${label}`),
    label,
    ...(info ? { info } : {}),
    ...(children.length ? { children } : {}),
  };
}

function normalizeMindmapPayload(value: unknown, fallbackLabel: string) {
  const root = normalizeMindmapNode(value, fallbackLabel);
  if (!root?.label || !root.children?.length) return null;
  return root;
}

function lessonBlockToText(block: any) {
  if (!block || typeof block !== "object") return "";
  const pieces: string[] = [];
  if (typeof block.title === "string") pieces.push(block.title);
  if (typeof block.value === "string") pieces.push(block.value);
  if (typeof block.caption === "string") pieces.push(block.caption);
  if (Array.isArray(block.items)) {
    for (const item of block.items) {
      if (typeof item === "string") pieces.push(item);
      else if (item && typeof item === "object") pieces.push([item.label, item.desc].filter(Boolean).join(": "));
    }
  }
  if (Array.isArray(block.timeline_items)) {
    for (const item of block.timeline_items) pieces.push([item?.label, item?.desc].filter(Boolean).join(": "));
  }
  if (Array.isArray(block.headers)) pieces.push(block.headers.join(" | "));
  if (Array.isArray(block.rows)) {
    for (const row of block.rows) if (Array.isArray(row)) pieces.push(row.join(" | "));
  }
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

function normalizeDuplicateScanResult(result: any, topics: any[]) {
  const topicIds = new Set(topics.map((topic) => String(topic.id)));
  const groups = Array.isArray(result?.groups) ? result.groups : [];
  return groups
    .map((group: any, groupIndex: number) => {
      const items = Array.isArray(group?.items) ? group.items : [];
      const normalizedItems = items
        .map((item: any) => ({
          topicId: String(item?.topicId || ""),
          blockIndex: Number(item?.blockIndex),
          role: item?.role === "keep" ? "keep" : "delete",
          note: cleanString(item?.note || item?.reason),
        }))
        .filter((item: any) => topicIds.has(item.topicId) && Number.isInteger(item.blockIndex) && item.blockIndex >= 0);
      if (!normalizedItems.some((item: any) => item.role === "delete")) return null;
      return {
        id: cleanString(group?.id) || `dup-${groupIndex + 1}`,
        concept: cleanString(group?.concept) || `Repeated concept ${groupIndex + 1}`,
        reason: cleanString(group?.reason),
        items: normalizedItems,
      };
    })
    .filter(Boolean);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function saveAiKey(apiKey: string, alias = "") {
  return api("/ai-keys", {
    method: "POST",
    body: JSON.stringify({ apiKey, provider: "google", alias }),
  });
}

async function requestReplacementAiKey(message: string) {
  const apiKey = window.prompt(`${message}\n\nPaste a new Gemini API key to continue:`);
  if (!apiKey?.trim()) throw new Error("AI generation paused. Add a new API key to continue remaining pending lessons.");
  await saveAiKey(apiKey.trim());
}

function isAiKeyRecoverable(error: any) {
  return error?.code === "AI_KEY_REQUIRED" || error?.code === "AI_KEY_LIMIT";
}

function aiErrorMessage(error: any, fallback: string) {
  if (error?.code === "REQUEST_TIMEOUT") return "AI request timed out. Try a smaller input or run it again.";
  return error?.message || fallback;
}

async function withAiKeyRecovery<T>(operation: () => Promise<T>) {
  let askedForKey = false;
  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      if (!askedForKey && isAiKeyRecoverable(error)) {
        askedForKey = true;
        await requestReplacementAiKey(aiErrorMessage(error, "AI API key required or limit exceeded."));
        continue;
      }
      throw error;
    }
  }
}

async function aiChatContent(messages: Array<{ role: string; content: any }>, temperature = 0.2) {
  const data = await withAiKeyRecovery(() => api("/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      temperature,
    }),
  }));
  const content = data.choices?.[0]?.message?.content || "";
  if (!content.trim()) throw new Error("AI returned an empty response.");
  return content;
}

async function aiJson(system: string, user: string, fallback: any) {
  const text = await aiChatContent([{ role: "system", content: system }, { role: "user", content: user }]);
  const parsed = parseJsonPayload(text, fallback);
  if (parsed !== fallback) return parsed;

  const repairText = await aiChatContent([
    { role: "system", content: "Return only valid JSON. Repair the assistant output into valid JSON that matches the requested shape." },
    { role: "user", content: `Requested shape fallback:\n${JSON.stringify(fallback)}\n\nAssistant output:\n${text}` },
  ], 0);
  const repaired = parseJsonPayload(repairText, fallback);
  if (repaired === fallback) throw new Error("AI returned JSON that could not be parsed.");
  return repaired;
}

async function repairJsonPayload(text: string, fallback: any) {
  const repairText = await aiChatContent([
    { role: "system", content: "Return only valid JSON. Repair the assistant output into valid JSON that matches the requested shape." },
    { role: "user", content: `Requested shape fallback:\n${JSON.stringify(fallback)}\n\nAssistant output:\n${text}` },
  ], 0);
  const repaired = parseJsonPayload(repairText, fallback);
  if (repaired === fallback) throw new Error("AI returned JSON that could not be parsed.");
  return repaired;
}

async function aiToolJson(system: string, user: string, toolName: string, parameters: any, fallback: any) {
  return withAiKeyRecovery(async () => {
    const data = await api("/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: `${system}\nAlways call the ${toolName} tool.` }, { role: "user", content: user }],
        temperature: 0.2,
        tools: [{
          type: "function",
          function: {
            name: toolName,
            parameters,
          },
        }],
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (args) {
      try {
        return JSON.parse(args);
      } catch {
        const parsed = parseJsonPayload(args, fallback);
        if (parsed !== fallback) return parsed;
        return repairJsonPayload(args, fallback);
      }
    }
    const text = data.choices?.[0]?.message?.content || "";
    if (!text.trim()) throw new Error("AI returned an empty response.");
    const parsed = parseJsonPayload(text, fallback);
    if (parsed === fallback) return repairJsonPayload(text, fallback);
    return parsed;
  });
}

function ensureRequired(value: unknown, label: string) {
  const text = cleanString(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function asPositiveCount(value: unknown, fallback: number, max: number) {
  const count = Number(value);
  if (!Number.isFinite(count)) return fallback;
  return Math.min(Math.max(Math.round(count), 1), max);
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `item-${Date.now()}`;
}

async function getAllCourses() {
  return fromApi((await api("/courses")).courses || []);
}

async function getTopic(topicId: string) {
  return fromApi((await api(`/topics/${encodeURIComponent(topicId)}`)).topic);
}

async function getCourseTopics(courseId: string) {
  return fromApi((await api(`/topics?courseId=${encodeURIComponent(courseId)}`)).topics || []);
}

async function patchTopic(topicId: string, body: any) {
  return fromApi((await api(`/topics/${encodeURIComponent(topicId)}`, { method: "PATCH", body: JSON.stringify(toApi(body)) })).topic);
}

async function patchCourse(courseId: string, body: any) {
  return fromApi((await api(`/courses/${encodeURIComponent(courseId)}`, { method: "PATCH", body: JSON.stringify(toApi(body)) })).course);
}

async function findPyq(pyqId: string) {
  for (const course of await getAllCourses()) {
    const pyqs = fromApi((await api(`/pyq?courseId=${encodeURIComponent(course.id)}`)).pyqs || []);
    const match = pyqs.find((item: any) => item.id === pyqId);
    if (match) return match;
  }
  return null;
}

function exportCleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\r/g, "")
    .trim();
}

function shouldExportBlock(block: any, options: Required<ExportOptions>) {
  if (!block || typeof block !== "object") return false;
  if (block.type === "image") return options.includeImages;
  if (block.type === "flowchart" || block.type === "chart") return options.includeGraphs;
  if (block.type === "code") return options.includeCode;
  return true;
}

function exportBlockLines(block: any, options: Required<ExportOptions>): string[] {
  if (!shouldExportBlock(block, options)) return [];
  if (!block || typeof block !== "object") return [];
  if (block.type === "text") return [exportCleanText(block.value)];
  if (block.type === "highlight") return [`Key point: ${exportCleanText(block.value)}`];
  if (block.type === "list") return [exportCleanText(block.title), ...(block.items || []).map((it: string) => `- ${exportCleanText(it)}`)].filter(Boolean);
  if (block.type === "timeline") return (block.items || []).map((it: any) => `${exportCleanText(it.label)}: ${exportCleanText(it.desc)}`);
  if (block.type === "table") return [
    exportCleanText(block.title),
    Array.isArray(block.headers) ? block.headers.map(exportCleanText).join(" | ") : "",
    ...(block.rows || []).map((row: unknown[]) => Array.isArray(row) ? row.map(exportCleanText).join(" | ") : exportCleanText(row)),
  ].filter(Boolean);
  if (block.type === "flowchart") return [exportCleanText(block.title), exportCleanText(block.code)].filter(Boolean);
  if (block.type === "chart") return [exportCleanText(block.title || "Chart"), ...(block.data || []).map((it: any) => `${exportCleanText(it.name)}: ${exportCleanText(it.value)}`)].filter(Boolean);
  if (block.type === "image") return [exportCleanText(block.caption), exportCleanText(block.url)].filter(Boolean);
  if (block.type === "math") return [exportCleanText(block.caption), exportCleanText(block.value)].filter(Boolean);
  if (block.type === "code") return [exportCleanText(block.caption || `${block.language || "Code"} example`), exportCleanText(block.value)].filter(Boolean);
  return [exportCleanText(block.value || block.title || JSON.stringify(block))].filter(Boolean);
}

function wrapExportText(text: string, maxChars: number) {
  const words = exportCleanText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function toPdfSafeText(value: unknown) {
  return exportCleanText(value)
    .replace(/\u221a/g, "sqrt")
    .replace(/\u221b/g, "cbrt")
    .replace(/\u221c/g, "4th root")
    .replace(/\u00d7/g, "x")
    .replace(/\u00f7/g, "/")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\u2260/g, "!=")
    .replace(/\u2248/g, "~=")
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u2194/g, "<->")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function hasMindmap(value: any) {
  return Boolean(value && typeof value === "object" && exportCleanText(value.label || value.id));
}

function sanitizeExportFilename(value: unknown) {
  return slugify(exportCleanText(value || "course")).slice(0, 80) || "course";
}

function collectMindmapNodes(root: any) {
  const nodes: Array<{ node: any; depth: number; parentIndex: number | null; branchIndex: number }> = [];
  const walk = (node: any, depth: number, parentIndex: number | null, branchIndex: number) => {
    if (!node || typeof node !== "object") return;
    const index = nodes.length;
    nodes.push({ node, depth, parentIndex, branchIndex });
    (Array.isArray(node.children) ? node.children : []).forEach((child: any, childIndex: number) => {
      walk(child, depth + 1, index, depth === 0 ? childIndex : branchIndex);
    });
  };
  walk(root, 0, null, 0);
  return nodes;
}

async function buildLocalMindmapPdf(course: any, topics: any[], options: { includeCourse?: boolean; filenameSuffix?: string } = {}) {
  const pdfLib = await import("pdf-lib");
  const pdf = await pdfLib.PDFDocument.create();
  const font = await pdf.embedFont(pdfLib.StandardFonts.Helvetica);
  const bold = await pdf.embedFont(pdfLib.StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const colors = {
    ink: pdfLib.rgb(0.08, 0.09, 0.13),
    muted: pdfLib.rgb(0.38, 0.42, 0.5),
    pageFill: pdfLib.rgb(0.97, 0.98, 1),
    panelFill: pdfLib.rgb(0.985, 0.99, 1),
    lineSoft: pdfLib.rgb(0.74, 0.8, 0.9),
    rootFill: pdfLib.rgb(0.11, 0.15, 0.28),
    rootText: pdfLib.rgb(1, 1, 1),
  };
  const palette = [
    { fill: pdfLib.rgb(0.82, 0.96, 0.98), stroke: pdfLib.rgb(0.04, 0.62, 0.72), dark: pdfLib.rgb(0.03, 0.35, 0.43), text: pdfLib.rgb(0.02, 0.16, 0.2) },
    { fill: pdfLib.rgb(0.91, 0.84, 0.99), stroke: pdfLib.rgb(0.48, 0.22, 0.78), dark: pdfLib.rgb(0.26, 0.12, 0.45), text: pdfLib.rgb(0.18, 0.07, 0.32) },
    { fill: pdfLib.rgb(0.83, 0.96, 0.88), stroke: pdfLib.rgb(0.12, 0.58, 0.3), dark: pdfLib.rgb(0.06, 0.34, 0.18), text: pdfLib.rgb(0.04, 0.2, 0.11) },
    { fill: pdfLib.rgb(1, 0.93, 0.74), stroke: pdfLib.rgb(0.82, 0.48, 0.02), dark: pdfLib.rgb(0.48, 0.27, 0.02), text: pdfLib.rgb(0.31, 0.18, 0.02) },
    { fill: pdfLib.rgb(1, 0.85, 0.9), stroke: pdfLib.rgb(0.78, 0.18, 0.42), dark: pdfLib.rgb(0.46, 0.08, 0.23), text: pdfLib.rgb(0.3, 0.04, 0.14) },
    { fill: pdfLib.rgb(0.84, 0.91, 1), stroke: pdfLib.rgb(0.16, 0.4, 0.82), dark: pdfLib.rgb(0.08, 0.22, 0.48), text: pdfLib.rgb(0.05, 0.14, 0.31) },
  ];

  const drawLabel = (page: any, text: string, x: number, y: number, width: number, size: number, pageFont = font, color = colors.ink) => {
    const lines = wrapExportText(toPdfSafeText(text), Math.max(8, Math.floor(width / (size * 0.52)))).slice(0, 3);
    lines.forEach((line, index) => {
      page.drawText(toPdfSafeText(line).slice(0, 100), { x, y: y - index * (size + 3), size, font: pageFont, color });
    });
    return lines.length * (size + 3);
  };

  const drawMindmapPage = (title: string, subtitle: string, mindmap: any, pageNumber: number) => {
    const page = pdf.addPage(pageSize);
    const width = page.getWidth();
    const height = page.getHeight();
    page.drawRectangle({ x: 0, y: 0, width, height, color: colors.pageFill });
    page.drawRectangle({ x: 0, y: height - 82, width, height: 82, color: pdfLib.rgb(0.91, 0.95, 1) });
    page.drawRectangle({ x: 0, y: height - 84, width, height: 2, color: pdfLib.rgb(0.62, 0.72, 0.9) });
    page.drawText(toPdfSafeText(title).slice(0, 95), { x: 36, y: height - 42, size: 17, font: bold, color: colors.ink });
    if (subtitle) page.drawText(toPdfSafeText(subtitle).slice(0, 130), { x: 36, y: height - 62, size: 9, font, color: colors.muted });
    page.drawText(`Page ${pageNumber}`, { x: width - 72, y: 24, size: 8, font, color: colors.muted });

    const nodes = collectMindmapNodes(mindmap);
    if (!nodes.length) {
      page.drawText(toPdfSafeText("No mind map data available."), { x: 36, y: height - 110, size: 11, font, color: colors.muted });
      return;
    }

    const center = { x: width / 2, y: (height - 78) / 2 + 28 };
    const contentBounds = { left: 28, right: width - 28, bottom: 46, top: height - 102 };
    page.drawRectangle({
      x: contentBounds.left,
      y: contentBounds.bottom + 10,
      width: contentBounds.right - contentBounds.left,
      height: contentBounds.top - contentBounds.bottom - 10,
      color: colors.panelFill,
      borderColor: pdfLib.rgb(0.86, 0.9, 0.96),
      borderWidth: 0.8,
    });
    for (let dot = 0; dot < 34; dot += 1) {
      const x = contentBounds.left + 22 + ((dot * 73) % Math.floor(contentBounds.right - contentBounds.left - 44));
      const y = contentBounds.bottom + 34 + ((dot * 47) % Math.floor(contentBounds.top - contentBounds.bottom - 76));
      page.drawCircle({ x, y, size: 1.15, color: pdfLib.rgb(0.82, 0.87, 0.95), opacity: 0.6 });
    }
    const childrenByParent = new Map<number, number[]>();
    nodes.forEach((item, index) => {
      if (item.parentIndex === null) return;
      childrenByParent.set(item.parentIndex, [...(childrenByParent.get(item.parentIndex) || []), index]);
    });
    const positions: Array<{ x: number; y: number; width: number; height: number; angle: number } | null> = nodes.map(() => null);
    const clampPosition = (position: { x: number; y: number; width: number; height: number; angle: number }) => ({
      ...position,
      x: Math.min(Math.max(position.x, contentBounds.left + position.width / 2), contentBounds.right - position.width / 2),
      y: Math.min(Math.max(position.y, contentBounds.bottom + position.height / 2), contentBounds.top - position.height / 2),
    });
    const polar = (angle: number, rx: number, ry: number, wave = 0) => clampPosition({
      x: center.x + Math.cos(angle) * rx + Math.sin(angle * 3) * wave,
      y: center.y + Math.sin(angle) * ry + Math.cos(angle * 2) * wave,
      width: 112,
      height: 54,
      angle,
    });
    positions[0] = { x: center.x, y: center.y, width: 158, height: 54, angle: -Math.PI / 2 };

    const visibleIndexes = new Set<number>([0]);
    const rootChildren = (childrenByParent.get(0) || []).slice(0, 8);
    rootChildren.forEach((childIndex, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(rootChildren.length, 1);
      positions[childIndex] = { ...polar(angle, 286, 174, 10), width: 120, height: 48 };
      visibleIndexes.add(childIndex);

      const childIndexes = (childrenByParent.get(childIndex) || []).slice(0, rootChildren.length > 6 ? 1 : 2);
      const tangent = angle + Math.PI / 2;
      childIndexes.forEach((grandChildIndex, siblingIndex) => {
        const offset = childIndexes.length === 1 ? 0 : siblingIndex === 0 ? -36 : 36;
        const radial = polar(angle, 360, 224, 5);
        const position = clampPosition({
          x: radial.x + Math.cos(tangent) * offset,
          y: radial.y + Math.sin(tangent) * offset,
          width: 104,
          height: 50,
          angle,
        });
        positions[grandChildIndex] = position;
        visibleIndexes.add(grandChildIndex);
      });
    });

    for (let pass = 0; pass < 28; pass += 1) {
      const visible = Array.from(visibleIndexes).filter((index) => index !== 0);
      let moved = false;
      for (let a = 0; a < visible.length; a += 1) {
        for (let b = a + 1; b < visible.length; b += 1) {
          const leftIndex = visible[a];
          const rightIndex = visible[b];
          const left = positions[leftIndex];
          const right = positions[rightIndex];
          if (!left || !right) continue;
          const overlapX = (left.width + right.width) / 2 + 8 - Math.abs(left.x - right.x);
          const overlapY = (left.height + right.height) / 2 + 8 - Math.abs(left.y - right.y);
          if (overlapX <= 0 || overlapY <= 0) continue;
          const pushX = overlapX < overlapY;
          const direction = pushX ? (left.x <= right.x ? -1 : 1) : (left.y <= right.y ? -1 : 1);
          const delta = (pushX ? overlapX : overlapY) / 2 + 1;
          if (pushX) {
            positions[leftIndex] = clampPosition({ ...left, x: left.x + direction * delta });
            positions[rightIndex] = clampPosition({ ...right, x: right.x - direction * delta });
          } else {
            positions[leftIndex] = clampPosition({ ...left, y: left.y + direction * delta });
            positions[rightIndex] = clampPosition({ ...right, y: right.y - direction * delta });
          }
          moved = true;
        }
      }
      if (!moved) break;
    }

    [62, 122, 194].forEach((radius) => {
      page.drawEllipse({
        x: center.x,
        y: center.y,
        xScale: radius * 1.45,
        yScale: radius,
        borderColor: colors.lineSoft,
        borderOpacity: 0.45,
        borderWidth: 0.7,
      });
    });

    nodes.forEach((item, index) => {
      if (item.parentIndex === null) return;
      if (!visibleIndexes.has(index) || !visibleIndexes.has(item.parentIndex)) return;
      const parent = positions[item.parentIndex];
      const child = positions[index];
      if (!parent || !child) return;
      const branchColor = palette[item.branchIndex % palette.length];
      page.drawLine({
        start: { x: parent.x, y: parent.y },
        end: { x: child.x, y: child.y },
        thickness: item.depth === 1 ? 2.35 : 1.25,
        color: branchColor.stroke,
        opacity: item.depth === 1 ? 0.78 : 0.52,
      });
      page.drawCircle({ x: child.x, y: child.y, size: item.depth === 1 ? 4.2 : 2.8, color: branchColor.stroke, opacity: 0.85 });
    });

    nodes.forEach((item, index) => {
      if (!visibleIndexes.has(index)) return;
      const position = positions[index];
      if (!position) return;
      const isRoot = item.depth === 0;
      const branchColor = palette[item.branchIndex % palette.length];
      const isPrimaryBranch = item.depth === 1;
      const nodeX = position.x - position.width / 2;
      const nodeY = position.y - position.height / 2;
      if (isRoot) {
        page.drawEllipse({ x: position.x + 2, y: position.y - 3, xScale: position.width / 2 + 4, yScale: position.height / 2 + 3, color: pdfLib.rgb(0.62, 0.68, 0.82), opacity: 0.2 });
        page.drawEllipse({ x: position.x, y: position.y, xScale: position.width / 2, yScale: position.height / 2, color: colors.rootFill, borderColor: pdfLib.rgb(0.35, 0.52, 0.9), borderWidth: 1.4 });
      } else {
        page.drawRectangle({
          x: nodeX + 2.5,
          y: nodeY - 2.5,
          width: position.width,
          height: position.height,
          color: pdfLib.rgb(0.58, 0.63, 0.75),
          opacity: 0.16,
        });
        page.drawRectangle({
          x: nodeX,
          y: nodeY,
          width: position.width,
          height: position.height,
          borderWidth: isPrimaryBranch ? 1.55 : 1,
          borderColor: branchColor.stroke,
          color: isPrimaryBranch ? branchColor.dark : pdfLib.rgb(1, 1, 1),
        });
        page.drawRectangle({
          x: nodeX,
          y: nodeY + position.height - 7,
          width: position.width,
          height: 7,
          color: branchColor.stroke,
          opacity: isPrimaryBranch ? 0.95 : 0.74,
        });
        if (isPrimaryBranch) {
          page.drawCircle({ x: nodeX + 12, y: nodeY + position.height - 18, size: 8, color: branchColor.stroke });
          page.drawText(String(item.branchIndex + 1), { x: nodeX + 9.5, y: nodeY + position.height - 21, size: 7.2, font: bold, color: colors.rootText });
        }
      }
      drawLabel(
        page,
        toPdfSafeText(item.node.label || item.node.id || "Untitled"),
        nodeX + (isPrimaryBranch ? 24 : 8),
        position.y + (isRoot ? 10 : 17),
        position.width - (isPrimaryBranch ? 32 : 16),
        isRoot ? 10 : isPrimaryBranch ? 8 : 7.6,
        isRoot || isPrimaryBranch ? bold : font,
        isRoot || isPrimaryBranch ? colors.rootText : branchColor.text,
      );
      const info = toPdfSafeText(item.node.info || item.node.detail || item.node.description || item.node.summary || "");
      if (info) {
        drawLabel(
          page,
          info,
          nodeX + 8,
          position.y + (isRoot ? -8 : -1),
          position.width - 16,
          isRoot ? 6.4 : 6.2,
          font,
          isRoot ? colors.rootText : isPrimaryBranch ? pdfLib.rgb(0.94, 0.96, 1) : branchColor.text,
        );
      }
    });

    const hiddenCount = nodes.length - visibleIndexes.size;
    if (hiddenCount > 0) {
      page.drawText(toPdfSafeText(`+ ${hiddenCount} more detailed point${hiddenCount === 1 ? "" : "s"} kept in the mind map data`), {
        x: 36,
        y: 28,
        size: 8,
        font,
        color: colors.muted,
      });
    }
  };

  let pageNumber = 1;
  if (options.includeCourse !== false && hasMindmap(course?.mindmap)) {
    drawMindmapPage(
      `${course?.title || "Course"} - Overall Mind Map`,
      "Overall course mind map",
      course.mindmap,
      pageNumber++,
    );
  }

  topics
    .filter((topic: any) => hasMindmap(topic.mindmap))
    .sort((a: any, b: any) => Number(a.unit) - Number(b.unit) || Number(a.order_index) - Number(b.order_index))
    .forEach((topic: any) => {
      drawMindmapPage(
        `${topic.unit}.${topic.order_index} ${topic.title}`,
        `${course?.title || "Course"} lesson mind map`,
        topic.mindmap,
        pageNumber++,
      );
    });

  if (pageNumber === 1) {
    const page = pdf.addPage(pageSize);
    page.drawText(toPdfSafeText(course?.title || "Course Mind Maps"), { x: 36, y: page.getHeight() - 42, size: 18, font: bold, color: colors.ink });
    page.drawText(toPdfSafeText("No generated mind maps were found for this course."), { x: 36, y: page.getHeight() - 82, size: 11, font, color: colors.muted });
  }

  return {
    pdf: await pdf.saveAsBase64(),
    filename: `${sanitizeExportFilename(course?.slug || course?.title)}-${options.filenameSuffix || "mindmaps"}`,
    count: pageNumber - 1,
  };
}

async function buildLocalCourseExport(course: any, topics: any[], pyqs: any[], links: any[], rawOptions: ExportOptions = {}) {
  const options = {
    includeImages: rawOptions.includeImages !== false,
    includeGraphs: rawOptions.includeGraphs !== false,
    includeCode: rawOptions.includeCode !== false,
  };
  const lines: string[] = [course?.title || "Course", course?.description || ""];
  topics.forEach((topic: any) => {
    lines.push("", `Unit ${topic.unit}`, `${topic.unit}.${topic.order_index} ${topic.title}`, topic.summary || "");
    (topic.content || []).forEach((block: any) => lines.push(...exportBlockLines(block, options)));
    if (topic.quiz?.length) {
      lines.push("Quiz");
      topic.quiz.forEach((q: any, qi: number) => {
        lines.push(`${qi + 1}. ${exportCleanText(q.q || q.question)}`);
        (q.options || []).forEach((opt: string, oi: number) => {
          lines.push(`   ${String.fromCharCode(65 + oi)}. ${exportCleanText(opt)}${oi === q.answer ? " [correct]" : ""}`);
        });
      });
    }
  });
  if (pyqs.length) {
    const topicTitleById = new Map(topics.map((topic: any) => [topic.id, topic.title]));
    const pyqTopicMap = new Map<string, string[]>();
    links.forEach((link: any) => {
      const arr = pyqTopicMap.get(link.pyq_id) || [];
      const title = topicTitleById.get(link.topic_id);
      if (title) arr.push(title);
      pyqTopicMap.set(link.pyq_id, arr);
    });
    lines.push("", "Previous Year Questions");
    pyqs.forEach((pyq: any, index: number) => {
      const tagged = (pyqTopicMap.get(pyq.id) || []).join(", ");
      lines.push(
        [pyq.year, pyq.marks ? `${pyq.marks} marks` : "", tagged ? `Lessons: ${tagged}` : ""].filter(Boolean).join(" | "),
        `${index + 1}. ${exportCleanText(pyq.question)}`,
      );
      if (pyq.answer) lines.push(`Answer: ${exportCleanText(pyq.answer)}`);
    });
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${exportCleanText(course?.title || "Course")}</title></head><body>${lines.map((line) => {
    const safe = exportCleanText(line).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]!));
    if (!safe) return "<br>";
    if (/^(Unit \\d+|Previous Year Questions|Quiz)$/.test(safe)) return `<h2>${safe}</h2>`;
    return `<p>${safe}</p>`;
  }).join("")}</body></html>`;

  const pdfLib = await import("pdf-lib");
  const pdf = await pdfLib.PDFDocument.create();
  const font = await pdf.embedFont(pdfLib.StandardFonts.Helvetica);
  const bold = await pdf.embedFont(pdfLib.StandardFonts.HelveticaBold);
  let page = pdf.addPage();
  let y = page.getHeight() - 48;
  for (const raw of lines) {
    if (!raw) {
      y -= 7;
      continue;
    }
    const heading = /^(Unit \d+|Previous Year Questions|Quiz)$/.test(raw);
    for (const line of wrapExportText(raw, heading ? 64 : 90)) {
      if (y < 48) {
        page = pdf.addPage();
        y = page.getHeight() - 48;
      }
      page.drawText(toPdfSafeText(line).slice(0, 120), { x: 48, y, size: heading ? 16 : 10, font: heading ? bold : font, color: pdfLib.rgb(0.08, 0.08, 0.08) });
      y -= heading ? 20 : 14;
    }
  }
  return {
    docx: btoa(unescape(encodeURIComponent(html))),
    pdf: await pdf.saveAsBase64(),
    filename: course?.slug || "course",
    docExtension: "doc",
    docMime: "application/msword",
  };
}

function textToBlocks(text: string) {
  const paragraphs = text.split(/\n{2,}/).map((line) => line.trim()).filter(Boolean);
  return paragraphs.slice(0, 10).map((paragraph, index) => ({
    type: "text",
    title: index === 0 ? "Introduction" : undefined,
    value: paragraph,
  }));
}

function chunkText(text: string, size = 12000) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function normalizeOutline(result: any) {
  const rawUnits = Array.isArray(result?.units) ? result.units : [];
  if (rawUnits.length) {
    return {
      description: String(result.description || ""),
      units: rawUnits.map((unit: any, index: number) => ({
        unit: Number(unit.unit) || index + 1,
        title: String(unit.title || `Unit ${index + 1}`),
        summary: String(unit.summary || unit.overview || ""),
        lessons: Array.isArray(unit.lessons) ? unit.lessons.map((lesson: any) => ({
          title: String(lesson.title || ""),
          summary: String(lesson.summary || ""),
        })).filter((lesson: any) => lesson.title) : [],
      })),
    };
  }

  const lessons = Array.isArray(result?.topics) ? result.topics : [];
  return {
    description: String(result?.description || ""),
    units: lessons.length ? [{
      unit: 1,
      title: "Core concepts",
      summary: String(result?.summary || ""),
      lessons: lessons.map((lesson: any, index: number) => ({
        title: typeof lesson === "string" ? lesson : String(lesson?.title || `Lesson ${index + 1}`),
        summary: typeof lesson === "string" ? "" : String(lesson?.summary || ""),
      })).filter((lesson: any) => lesson.title),
    }] : [],
  };
}

function headingCandidatesFromSource(sourceText: string) {
  return sourceText
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s*/, "").replace(/^\d+[\).:-]\s*/, "").trim())
    .filter((line) => line.length >= 4 && line.length <= 90)
    .filter((line) => !/[.!?]$/.test(line))
    .slice(0, 18);
}

function fallbackOutlineFromSource(title: string, sourceText: string, summaries: string[] = []) {
  const compact = sourceText.replace(/\s+/g, " ").trim();
  const headings = headingCandidatesFromSource(sourceText);
  const fallbackTopics = headings.length ? headings : compact.match(/[^.!?]+[.!?]+/g)?.slice(0, 8).map((line) => line.trim().slice(0, 80)) || [];
  const lessons = fallbackTopics.slice(0, 12).map((topic, index) => ({
    title: topic || `Lesson ${index + 1}`,
    summary: compact.slice(index * 220, index * 220 + 220),
  }));
  return {
    description: compact.slice(0, 500) || `Course generated from ${title}`,
    units: [{
      unit: 1,
      title: title || "Course overview",
      summary: summaries.join("\n").slice(0, 500) || compact.slice(0, 500),
      lessons: lessons.length ? lessons : [{ title: title || "Course overview", summary: compact.slice(0, 300) }],
    }],
  };
}

function sourceKeywords(...values: string[]) {
  const stop = new Set(["about", "after", "before", "course", "lesson", "summary", "their", "there", "these", "those", "through", "using", "what", "when", "where", "which", "with"]);
  return Array.from(new Set(values
    .join(" ")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{2,}/g) || []))
    .filter((word) => !stop.has(word))
    .slice(0, 32);
}

function splitSourcePassages(sourceText: string) {
  return sourceText
    .split(/\n{2,}|(?=\[Page\s+\d+\])/i)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 80)
    .slice(0, 900);
}

function buildLessonSourceContext(sourceText: string, title: string, summary: string, maxChars = 6500) {
  const keywords = sourceKeywords(title, summary);
  if (!sourceText.trim() || !keywords.length) return "";
  const passages = splitSourcePassages(sourceText);
  const scored = passages
    .map((passage, index) => {
      const lower = passage.toLowerCase();
      const score = keywords.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
      return { passage, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = (scored.length ? scored : passages.map((passage, index) => ({ passage, index, score: 0 }))).slice(0, 8);
  let context = "";
  for (const item of selected) {
    const next = `Source excerpt ${item.index + 1}: ${item.passage.slice(0, 1100)}`;
    if (context.length + next.length > maxChars) break;
    context += `${next}\n\n`;
  }
  return context.trim();
}

function buildLessonFlow(topic: any, topics: any[]) {
  const sorted = [...topics].sort((a: any, b: any) => Number(a.unit) - Number(b.unit) || Number(a.order_index) - Number(b.order_index));
  const index = sorted.findIndex((item: any) => item.id === topic.id);
  const previous = index > 0 ? sorted[index - 1] : null;
  const next = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null;
  const unitPeers = sorted
    .filter((item: any) => Number(item.unit) === Number(topic.unit))
    .map((item: any) => `${item.order_index}. ${item.title}${item.summary ? ` - ${item.summary}` : ""}`)
    .join("\n");
  return [
    previous ? `Previous lesson: ${previous.title} - ${previous.summary || "No summary"}` : "Previous lesson: none",
    `Current lesson: ${topic.title} - ${topic.summary || "No summary"}`,
    next ? `Next lesson: ${next.title} - ${next.summary || "No summary"}` : "Next lesson: none",
    unitPeers ? `Unit lesson sequence:\n${unitPeers}` : "",
  ].filter(Boolean).join("\n");
}

async function buildCourseOutlineFromSource(title: string, sourceText: string) {
  const chunks = chunkText(sourceText);
  const summaries: string[] = [];

  for (let index = 0; index < chunks.length; index++) {
    try {
      const result = await aiJson(
        "Return only valid JSON: {\"summary\":\"\",\"topics\":[\"\"],\"keyTerms\":[\"\"],\"processes\":[\"\"],\"examples\":[\"\"],\"prerequisites\":[\"\"]}. Scan this source chunk deeply. Preserve technical terms, formulas, processes, examples, and prerequisite relationships. Do not create lessons yet.",
        `Course: ${title}\nChunk ${index + 1} of ${chunks.length}\n\n${chunks[index]}`,
        { summary: "", topics: [], keyTerms: [], processes: [], examples: [], prerequisites: [] },
      );
      const topicList = Array.isArray(result.topics) ? result.topics.join("; ") : "";
      const keyTerms = Array.isArray(result.keyTerms) ? result.keyTerms.join("; ") : "";
      const processes = Array.isArray(result.processes) ? result.processes.join("; ") : "";
      const examples = Array.isArray(result.examples) ? result.examples.join("; ") : "";
      const prerequisites = Array.isArray(result.prerequisites) ? result.prerequisites.join("; ") : "";
      summaries.push(`Chunk ${index + 1}: ${result.summary || ""}\nTopics: ${topicList}\nKey terms: ${keyTerms}\nProcesses: ${processes}\nExamples: ${examples}\nPrerequisites: ${prerequisites}`);
    } catch {
      summaries.push(`Chunk ${index + 1}: ${chunks[index].replace(/\s+/g, " ").trim().slice(0, 900)}`);
    }
  }

  try {
    const result = await aiJson(
      `Return only valid JSON in this shape:
{"description":"","units":[{"unit":1,"title":"","summary":"","lessons":[{"title":"","summary":""}]}]}

Build a complete course map from the scan summaries. Cover all major topics from the source. Keep prerequisite concepts before dependent concepts, group related processes/examples together, and avoid duplicate lessons. Use unit overview lessons as x.0 and sub-lessons as x.1, x.2, etc. Create 2-6 units when possible, and 1-6 sub-lessons per unit. Keep lesson titles specific, non-overlapping, and teachable.`,
      `Course title: ${title}
${getAppSettings().ai.optimizationPrompt ? `Optimization rule: ${getAppSettings().ai.optimizationPrompt}\n` : ""}
${getAppSettings().ai.coursePrompt ? `Admin course prompt addition: ${getAppSettings().ai.coursePrompt}\n` : ""}

Whole-document scan summaries:
${summaries.join("\n\n")}`,
      { description: "", units: [] },
    );

    const outline = normalizeOutline(result);
    const finalOutline = outline.units.length ? outline : fallbackOutlineFromSource(title, sourceText, summaries);
    return { ...finalOutline, scannedChunks: chunks.length };
  } catch {
    return { ...fallbackOutlineFromSource(title, sourceText, summaries), scannedChunks: chunks.length };
  }
}

async function recreateTopicsFromOutline(course: any, outline: any) {
  const existing = await getCourseTopics(course.id);
  for (const topic of existing) {
    await api(`/topics/${encodeURIComponent(topic.id)}`, { method: "DELETE" });
  }

  let topicCount = 0;
  const courseSlug = course.slug || slugify(course.title || "course");
  for (const unit of outline.units || []) {
    const unitNumber = Number(unit.unit) || topicCount + 1;
    const unitTitle = String(unit.title || `Unit ${unitNumber}`);
    await api("/topics", {
      method: "POST",
      body: JSON.stringify({
        courseId: course.id,
        title: unitTitle,
        summary: unit.summary || "",
        unit: unitNumber,
        orderIndex: 0,
        slug: `${courseSlug}-${slugify(unitTitle)}-0`,
        content: [],
        quiz: [],
        generationStatus: "pending",
      }),
    });
    topicCount++;
    for (const [index, lesson] of (unit.lessons || []).entries()) {
      await api("/topics", {
        method: "POST",
        body: JSON.stringify({
          courseId: course.id,
          title: lesson.title,
          summary: lesson.summary || "",
          unit: unitNumber,
          orderIndex: index + 1,
          slug: `${courseSlug}-${slugify(lesson.title)}-${index + 1}`,
          content: [],
          quiz: [],
          generationStatus: "pending",
        }),
      });
      topicCount++;
    }
  }
  return topicCount;
}

const LESSON_GENERATION_SYSTEM_PROMPT = `You are a structured content generator for an AI learning platform.

Your task is to generate educational content strictly in JSON format.

RULES:
1. Output MUST be a valid JSON object with "summary" and "content"; "content" MUST be a valid JSON array.
2. Each content object MUST follow the block schema.
3. Do NOT add explanations outside JSON.
4. Use only supported block types:
["text", "list", "highlight", "table", "code", "flowchart", "chart", "image", "math", "timeline"]
5. Keep content grounded in the supplied source context when it is available.
6. Keep content conceptual, example-driven, and problem-solving oriented.
7. Maintain logical flow: Intro -> Prerequisite Link -> Core Concept -> Example -> Optional Visual/Process -> Insight -> Advanced -> Summary.

BLOCK RULES:
- text -> must have "value"
- list -> must have "items" as an array
- highlight -> short key insight in "value"
- table -> must have "headers" and "rows"
- code -> must have "value" and "language"
- flowchart -> must have Mermaid syntax in "code", starting with graph TD, graph LR, flowchart TD, etc. Quote labels with punctuation, for example B{"Connectivity (e.g., Wi-Fi)"}.
- timeline -> use "timeline_items" with {label, desc}
- flowchart, chart, math, and code are optional. Use them only when they clearly improve understanding.
- If you use flowchart, chart, math, or code, the very next block MUST be a highlight explaining what the learner should understand from it.

STYLE RULES:
- Keep explanations clear and concise.
- Use real-world examples.
- Avoid redundancy.
- Avoid empty fields.
- Do not invent facts that conflict with the source context.
- Keep graph/chart/diagram content medium to small: 3-6 nodes or data points when possible.
- Keep each lesson page comfortable for about 500 words by using substantial but not bloated blocks.
- Keep 8-15 blocks total.`;

const WRITE_LESSON_PARAMETERS = {
  type: "object",
  properties: {
    content: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["text", "list", "highlight", "table", "code", "flowchart", "chart", "image", "math", "timeline"] },
          title: { type: "string" },
          value: { type: "string" },
          items: {
            type: "array",
            items: { type: "string" },
          },
          timeline_items: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, desc: { type: "string" } },
            },
          },
          headers: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: { type: "string" } } },
          code: { type: "string", description: "Mermaid flowchart syntax, e.g. graph TD\\n  A[Start] --> B{\\\"Connectivity (e.g., Wi-Fi)\\\"}" },
          variant: { type: "string", enum: ["bar", "line", "pie"] },
          data: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, value: { type: "number" } },
            },
          },
          language: { type: "string" },
          display: { type: "boolean" },
          caption: { type: "string" },
          prompt: { type: "string" },
        },
        required: ["type"],
      },
    },
    quiz: {
      type: "array",
      items: {
        type: "object",
        properties: {
          q: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "integer" },
        },
        required: ["q", "options", "answer"],
      },
    },
  },
  required: ["content", "quiz"],
};

export const backendApi = {
  apiUrl: API_URL,
  auth: {
    onAuthStateChange(callback: (_event: string, session: any) => void) {
      const listener = async () => callback("SIGNED_IN", await makeSession());
      window.addEventListener(AUTH_EVENT, listener);
      return { data: { subscription: { unsubscribe: () => window.removeEventListener(AUTH_EVENT, listener) } } };
    },
    async getSession() {
      return { data: { session: await makeSession() }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        localStorage.setItem(TOKEN_KEY, data.token);
        emitAuth();
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    async signUp({ email, password, options }: { email: string; password: string; options?: any }) {
      try {
        const data = await api("/auth/signup", {
          method: "POST",
          body: JSON.stringify({ email, password, displayName: options?.data?.display_name }),
        });
        localStorage.setItem(TOKEN_KEY, data.token);
        emitAuth();
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    async signOut() {
      localStorage.removeItem(TOKEN_KEY);
      emitAuth();
      return { error: null };
    },
    async getUser() {
      return { data: { user: currentUserFromToken(localStorage.getItem(TOKEN_KEY)) }, error: null };
    },
  },
  aiKeys: {
    async get() {
      return api("/ai-keys");
    },
    async save(apiKey: string, alias = "") {
      return saveAiKey(apiKey, alias);
    },
    async check() {
      return api("/ai-keys/check", { method: "POST" });
    },
    async remove(id?: string) {
      return api(`/ai-keys${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method: "DELETE" });
    },
  },
  from(table: string) {
    return new BackendQuery(table);
  },
  functions: {
    async invoke(name: string, options?: { body?: any }) {
      try {
        const body = options?.body || {};
        if (name === "generate-quiz") {
          const data = await aiJson(
            "Return only valid JSON in this shape: {\"questions\":[{\"q\":\"\",\"options\":[\"\",\"\",\"\",\"\"],\"answer\":0}]}. Generate concise course quiz questions.",
            `Topic: ${body.title}\nSummary: ${body.summary}\nContent: ${JSON.stringify(body.content).slice(0, 4000)}\nGenerate ${Math.min(Math.max(Number(body.count) || 10, 1), 10)} readable questions. Maximum 10.`,
            { questions: [] },
          );
          return { data: { questions: normalizeQuiz(data.questions).slice(0, 10) }, error: null };
        }
        if (name === "generate-mindmap") {
          const topic = body.topicId ? await getTopic(body.topicId) : null;
          const courseId = body.courseId || topic?.course_id;
          const course = courseId ? (await getAllCourses()).find((item: any) => item.id === courseId) : null;
          const topics = !topic && courseId ? await getCourseTopics(courseId) : [];
          const mindmapPrompt = topic
            ? `Build a mind map for this lesson only.

Lesson title: ${topic.title}
Lesson summary: ${topic.summary || ""}
Lesson content:
${JSON.stringify(topic.content || []).slice(0, 7000)}

Make the root label the lesson title. Use the main ideas from this lesson as branches. Do not create a generic study plan.`
            : `Build a mind map for this course.

Course title: ${course?.title || "Course"}
Course description: ${course?.description || ""}
Lessons:
${topics.map((item: any) => `- ${item.title}: ${item.summary || ""}`).join("\n")}

Make the root label the course title and organize branches by course concepts.`;
          const fallbackLabel = topic?.title || course?.title || "Course";
          let lastError = "AI returned an invalid mind map";
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
              const data = await aiJson(
                "Return only valid JSON in this exact shape: {\"mindmap\":{\"id\":\"root\",\"label\":\"\",\"info\":\"\",\"children\":[{\"id\":\"\",\"label\":\"\",\"info\":\"\",\"children\":[]}]}}. Build an educational concept mind map, not a study schedule. Make it a spider-web/radial concept structure: one central root, 4-8 distinct first-level branches, and 1-4 child points per branch when useful. Every node should include info: a short 8-16 word explanation. Labels must be 2-6 words and visually distinct.",
                `${mindmapPrompt}\n\nAttempt ${attempt}: Return a valid non-empty tree with short info on each point. Do not include markdown, comments, Mermaid syntax, or explanatory text.`,
                { mindmap: null },
              );
              const mindmap = normalizeMindmapPayload(data?.mindmap, fallbackLabel);
              if (!mindmap) {
                lastError = "AI returned a mind map without valid branches";
                continue;
              }
              if (body.topicId) await patchTopic(body.topicId, { mindmap });
              if (!body.topicId && courseId) await patchCourse(courseId, { mindmap });
              return { data: { ok: true, mindmap, retried: attempt > 1 }, error: null };
            } catch (error) {
              lastError = errorMessage(error, lastError);
            }
          }
          if (body.topicId) await patchTopic(body.topicId, { mindmap: null });
          if (!body.topicId && courseId) await patchCourse(courseId, { mindmap: null });
          return { data: { ok: false, mindmap: null, removed: true, error: `${lastError}. Bad mind map was discarded.` }, error: null };
        }
        if (name === "generate-pyq-answer") {
          const pyq = await findPyq(body.pyqId);
          const data = await api("/ai/chat", {
            method: "POST",
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "user", content: `Write a clean, structured, exam-ready model answer. Use short paragraphs or numbered bullets and avoid repeating the question.\nQuestion: ${pyq?.question || body.pyqId}\nMarks: ${pyq?.marks || "unknown"}` }],
            }),
          });
          const answer = cleanString(data.choices?.[0]?.message?.content || "").replace(/^\s*(?:answer|solution)\s*[:.-]\s*/i, "");
          if (pyq) await api(`/pyq/${body.pyqId}`, { method: "PATCH", body: JSON.stringify({ answer }) });
          return { data: { ok: true, answer }, error: null };
        }
        if (name === "repair-mermaid") {
          const brokenCode = cleanString(body.code);
          const title = cleanString(body.title);
          const lessonTitle = cleanString(body.lessonTitle);
          if (!brokenCode) throw new Error("No Mermaid code supplied");
          const result = await aiJson(
            "Return only valid JSON: {\"code\":\"\"}. Repair the Mermaid diagram. Do not include markdown, comments, explanation, or code fences.",
            `Lesson: ${lessonTitle || "Unknown lesson"}
Diagram title: ${title || "Untitled"}
Mermaid parser error:
${cleanString(body.error).slice(0, 1200) || "Unknown parse error"}

Broken Mermaid:
${brokenCode.slice(0, 5000)}

Rewrite this as valid Mermaid flowchart syntax only.
Rules:
- Start with "graph TD" or "flowchart TD".
- Use 3-8 nodes.
- Quote every node label, especially labels with punctuation, parentheses, commas, hyphens, or symbols.
- Node ids must be simple letters or words, like A, B, cameraModel, imagePlane.
- Avoid unsupported characters in ids.
- Keep arrows simple: A --> B.
- Preserve the intended educational meaning.`,
            { code: "" },
          );
          const code = normalizeMermaidFlowchart(result.code);
          if (!code) throw new Error("AI did not return valid Mermaid syntax");
          return { data: { ok: true, code }, error: null };
        }
        if (name === "generate-lesson") {
          const topic = await getTopic(body.topicId);
          const course = (await getAllCourses()).find((item: any) => item.id === topic.course_id);
          const courseTopics = await getCourseTopics(topic.course_id);
          const sourceContext = buildLessonSourceContext(course?.source_text || "", topic.title || "", topic.summary || "");
          const lessonFlow = buildLessonFlow(topic, courseTopics);
          const customInstruction = cleanString(body.customInstruction || body.instruction);
          const appSettings = getAppSettings();
          const courseSettings = getCourseSettings(topic.course_id);
          const userPrompt = `Generate a lesson on: ${topic.title}

Current summary: ${topic.summary || ""}
Mode: ${body.mode || "replace"}
Level: ${body.level || 5}

Lesson flow and neighboring context:
${lessonFlow}

Relevant source context from uploaded document:
${sourceContext || "No matching source excerpt was available. Use the lesson title, summary, and course sequence only."}

${customInstruction ? `Extra instruction from admin: ${customInstruction}\n` : ""}
${appSettings.ai.optimizationPrompt ? `Global optimization rule: ${appSettings.ai.optimizationPrompt}\n` : ""}
${appSettings.ai.lessonPrompt ? `Global lesson prompt addition: ${appSettings.ai.lessonPrompt}\n` : ""}
${courseSettings.lessonPrompt ? `Course lesson prompt addition: ${courseSettings.lessonPrompt}\n` : ""}
Follow this structure:
1. Intro (text)
2. Prerequisite Link (text or highlight)
3. Core Concept (text)
4. Key Points (list)
5. Worked Example (usually text or table; use math or code only when necessary)
6. Optional Process / Relationship (use flowchart, chart, timeline, or table only when it genuinely clarifies the lesson)
7. Insight (highlight)
8. Advanced Concept (text)
9. Summary (text)

You may add up to 7 extra supported blocks when they improve the lesson. Do not add graph/chart, math, or code for decoration. Use them only when the topic needs that representation, such as:
- table for comparisons
- code for programming, algorithms, or exact implementation examples
- flowchart for real processes or decision paths; keep it medium to small, ideally 3-6 nodes, and put valid Mermaid flowchart syntax in code, for example:
  graph TD
    A[Start] --> B[Process]
    B --> C[End]
  Quote labels that contain punctuation or parentheses, e.g. B{"Connectivity (e.g., Wi-Fi)"}.
- chart for simple numeric comparisons, ideally 3-6 data points
- math for formulas only when notation is necessary. Put only the raw LaTeX equation in the math block value, without surrounding prose or $$ delimiters. Put any explanation in the next highlight block or in the math caption.
- timeline for historical or sequential topics
- image only when a visual would genuinely help; include caption and prompt, not an empty url

If you generate a flowchart, chart, math, or code block, put a highlight block immediately after it explaining the lesson takeaway from that block.
Use the source excerpts to choose terminology, examples, processes, and boundaries. If the excerpt is partial, avoid overstating details and connect this lesson cleanly to previous and next lessons.
Also write exactly 4 multiple-choice quiz questions (4 options each, exactly one correct).`;
          const result = await aiToolJson(
            LESSON_GENERATION_SYSTEM_PROMPT,
            userPrompt,
            "write_lesson",
            WRITE_LESSON_PARAMETERS,
            { content: [], quiz: [] },
          );
          const blocks = ensureExplanatoryHighlights(normalizeLessonContent(result.content || []));
          if (blocks.length < 8) throw new Error("AI did not return enough valid lesson blocks");
          const quiz = normalizeQuiz(result.quiz || []);
          if (quiz.length !== 4 && body.mode !== "continue") throw new Error("AI did not return exactly 4 valid quiz questions");
          const content = body.mode === "continue" ? [...(topic.content || []), ...blocks] : blocks;
          await patchTopic(topic.id, {
            content,
            quiz: body.mode === "continue" ? topic.quiz || [] : quiz,
            generation_status: "ready",
          });
          return { data: { ok: true, blocks: blocks.length, quiz: body.mode === "continue" ? (topic.quiz || []).length : quiz.length }, error: null };
        }
        if (name === "transform-content") {
          const topic = await getTopic(body.topicId);
          const result = await aiJson(
            "Return only valid JSON: {\"content\":[]}. Rewrite the provided lesson blocks according to the requested action.",
            `Action: ${body.action}\nLevel: ${body.level || ""}\nInstruction: ${body.customInstruction || ""}\nContent: ${JSON.stringify(topic.content).slice(0, 8000)}`,
            { content: topic.content || [] },
          );
          return { data: { ok: true, content: result.content || topic.content || [] }, error: null };
        }
        if (name === "translate-lesson") {
          const topic = await getTopic(body.topicId);
          const languageName = cleanString(body.languageName || body.language || "English");
          const languageCode = cleanString(body.languageCode || "en");
          const direction = cleanString(body.dir || "ltr") === "rtl" ? "rtl" : "ltr";
          const extraInstruction = cleanString(body.customInstruction);
          if (!languageCode || languageCode === "en") throw new Error("Choose a non-English target language");
          const result = await aiJson(
            `Return only valid JSON: {"title":"","summary":"","content":[],"quiz":[]}. Translate the lesson into ${languageName}. Preserve the existing JSON block schema exactly.`,
            `Target language: ${languageName} (${languageCode})
Writing direction: ${direction}
${extraInstruction ? `Admin instruction: ${extraInstruction}\n` : ""}
Translate all learner-facing text naturally for a student.
Keep technical terms accurate. Preserve formulas, code syntax, programming identifiers, Mermaid graph structure, chart numbers, JSON keys, block "type", code "language", and math notation.
For code blocks, translate only captions/comments when appropriate; do not translate executable syntax.
For flowcharts, keep valid Mermaid syntax and translate only human-readable node labels.
For charts/tables/lists/timelines, translate labels and descriptions but keep numeric values.

Lesson JSON:
${JSON.stringify({
  title: topic.title,
  summary: topic.summary,
  content: topic.content || [],
  quiz: topic.quiz || [],
}).slice(0, 18000)}`,
            { title: topic.title, summary: topic.summary, content: topic.content || [], quiz: topic.quiz || [] },
          );
          const translated = {
            languageCode,
            languageName,
            dir: direction,
            title: cleanString(result.title) || topic.title,
            summary: cleanString(result.summary) || topic.summary || "",
            content: ensureExplanatoryHighlights(normalizeLessonContent(result.content || topic.content || [])),
            quiz: normalizeQuiz(result.quiz || topic.quiz || []),
            generatedAt: new Date().toISOString(),
          };
          if (!translated.content.length) throw new Error("AI returned an empty translated lesson");
          const translations = Array.isArray(topic.translations) ? topic.translations : [];
          const nextTranslations = [
            ...translations.filter((item: any) => item?.languageCode !== languageCode),
            translated,
          ];
          await patchTopic(topic.id, { translations: nextTranslations });
          return { data: { ok: true, translation: translated, translations: nextTranslations }, error: null };
        }
        if (name === "explain-lesson-block") {
          const topic = body.topicId ? await getTopic(body.topicId) : null;
          const block = body.block && typeof body.block === "object" ? body.block : {};
          const blockType = cleanString(body.blockType || block.type || "block");
          const customPrompt = cleanString(body.prompt) || "Explain this in simple, human language for a learner. Focus on what each part means, why it matters, and the key takeaway.";
          const result = await aiJson(
            "Return only valid JSON: {\"explanation\":\"\"}. Write a natural learner-friendly explanation for the provided lesson block. Do not return markdown headings, code fences, or extra keys.",
            `Lesson: ${topic?.title || "Unknown lesson"}
Lesson summary: ${topic?.summary || ""}
Block type: ${blockType}
Admin explanation prompt: ${customPrompt}

Block JSON:
${JSON.stringify(block).slice(0, 5000)}

Write 2-5 clear sentences. Explain the human meaning, not just the notation. If this is code, explain what the code does and why the important lines matter. If this is math, explain each main symbol or transformation in plain language. If this is a graph/chart/flowchart, explain what relationship or trend the learner should notice.`,
            { explanation: "" },
          );
          const explanation = cleanString(result.explanation).replace(/\s+/g, " ").slice(0, 900);
          if (!explanation) throw new Error("AI returned an empty explanation");
          return { data: { ok: true, explanation }, error: null };
        }
        if (name === "scan-lesson-duplicates") {
          const allTopics = await getCourseTopics(body.courseId);
          const selectedUnits = Array.isArray(body.units)
            ? body.units.map(Number).filter((u) => Number.isFinite(u))
            : typeof body.unit !== "undefined"
              ? [Number(body.unit)]
              : [];
          const units = selectedUnits.length
            ? selectedUnits
            : Array.from(new Set(allTopics.map((topic: any) => Number(topic.unit)).filter(Number.isFinite)));
          const topics = allTopics
            .filter((topic: any) => units.includes(Number(topic.unit)) && Array.isArray(topic.content) && topic.content.length > 0)
            .sort((a: any, b: any) => Number(a.order_index) - Number(b.order_index));
          if (topics.length < 2) return { data: { ok: true, units, groups: [], scannedLessons: topics.length }, error: null };

          const blocks = topics.flatMap((topic: any) =>
            (topic.content || []).map((block: any, blockIndex: number) => ({
              topicId: topic.id,
              lesson: `${topic.unit}.${topic.order_index} ${topic.title}`,
              blockIndex,
              type: block?.type || "unknown",
              text: lessonBlockToText(block).slice(0, 700),
            })),
          ).filter((block: any) => block.text.length >= 40);

          const result = await aiJson(
            "Return only valid JSON: {\"groups\":[{\"id\":\"\",\"concept\":\"\",\"reason\":\"\",\"items\":[{\"topicId\":\"\",\"blockIndex\":0,\"role\":\"keep|delete\",\"note\":\"\"}]}]}.",
            `Scan these lesson blocks from ${units.length === 1 ? `unit ${units[0]}` : `units ${units.join(", ")}`} and find concepts explained more than once across different lessons.
Mark the best original or clearest block as role "keep" and repeated/redundant blocks as role "delete".
Only flag true repeated concept explanations, not brief references, prerequisites, summaries, quizzes, or complementary details.
Return blockIndex exactly as provided.
${getCourseSettings(body.courseId).duplicateCleanupPrompt ? `Course cleanup instruction: ${getCourseSettings(body.courseId).duplicateCleanupPrompt}\n` : ""}

Blocks:
${JSON.stringify(blocks).slice(0, 12000)}`,
            { groups: [] },
          );
          return {
            data: {
              ok: true,
              units,
              groups: normalizeDuplicateScanResult(result, topics),
              scannedLessons: topics.length,
            },
            error: null,
          };
        }
        if (name === "create-topic") {
          const topics = await getCourseTopics(body.courseId);
          const unit = Number(body.unit || 1);
          const nextOrder = Math.max(-1, ...topics.filter((topic: any) => Number(topic.unit) === unit).map((topic: any) => Number(topic.order_index ?? topic.orderIndex ?? -1))) + 1;
          const topic = fromApi((await api("/topics", {
            method: "POST",
            body: JSON.stringify({
              courseId: body.courseId,
              title: body.title,
              summary: body.summary || "",
              unit,
              orderIndex: nextOrder,
              slug: `${slugify(body.title)}-${Date.now().toString(36)}`,
              content: [],
              quiz: [],
              generationStatus: body.generate ? "pending" : "ready",
            }),
          })).topic);
          if (body.generate) await backendApi.functions.invoke("generate-lesson", { body: { topicId: topic.id } });
          return { data: { ok: true, topic }, error: null };
        }
        if (name === "generate-pyq") {
          const result = await aiJson(
            "Return only valid JSON: {\"questions\":[{\"question\":\"\",\"answer\":\"\",\"marks\":5,\"year\":2026}]}",
            `Generate ${body.count || 10} previous-year-style exam questions for courseId ${body.courseId}.`,
            { questions: [] },
          );
          let inserted = 0;
          for (const item of result.questions || []) {
            const marks = Number(item.marks);
            const year = Number(item.year);
            await api("/pyq", {
              method: "POST",
              body: JSON.stringify({
                courseId: body.courseId,
                question: String(item.question || ""),
                answer: String(item.answer || ""),
                marks: Number.isFinite(marks) ? marks : null,
                year: Number.isFinite(year) ? year : null,
              }),
            });
            inserted++;
          }
          return { data: { ok: true, inserted }, error: null };
        }
        if (name === "generate-image") {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720"><rect width="100%" height="100%" fill="#0f172a"/><text x="60" y="120" fill="#fff" font-family="Arial" font-size="42">Educational illustration</text><text x="60" y="200" fill="#cbd5e1" font-family="Arial" font-size="28">${String(body.prompt || "").replace(/[<>&]/g, "")}</text></svg>`;
          return { data: { ok: true, url: `data:image/svg+xml;base64,${btoa(svg)}` }, error: null };
        }
        if (name === "update-course-source") {
          const source = body.rawText || body.docsUrl || "";
          const course = (await getAllCourses()).find((item: any) => item.id === body.courseId);
          if (!course) throw new Error("Course not found");
          let topicCount = 0;
          if (body.resetLessons) {
            const outline = await buildCourseOutlineFromSource(course.title || "Course", source);
            await patchCourse(body.courseId, {
              source_text: source,
              description: (outline.description || course.description || "").slice(0, 500),
              toc: outline.units,
            });
            topicCount = await recreateTopicsFromOutline(course, outline);
          } else {
            await patchCourse(body.courseId, { source_text: source });
          }
          return { data: { ok: true, sourceLength: source.length, attempts: 1, rebuilt: Boolean(body.resetLessons), topicCount, scannedChunks: body.resetLessons ? Math.ceil(source.length / 12000) : 0 }, error: null };
        }
        if (name === "import-doc") {
          const text = body.url || "";
          return { data: { ok: true, summary: "Imported source", content: textToBlocks(text) }, error: null };
        }
        if (name === "create-course-from-doc") {
          const slug = `${slugify(body.title)}-${Date.now().toString(36)}`;
          const sourceText = String(body.rawText || body.docsUrl || "");
          const description = sourceText
            ? sourceText.replace(/\s+/g, " ").trim().slice(0, 500)
            : "";
          const course = fromApi((await api("/courses", {
            method: "POST",
            body: JSON.stringify({
              slug,
              title: body.title,
              description,
              sourceText,
              coverEmoji: body.emoji || "📘",
              orderIndex: 0,
              generationStatus: "generating",
            }),
          })).course);
          const result = await buildCourseOutlineFromSource(body.title, sourceText);
          if (result.description) await patchCourse(course.id, { description: result.description.slice(0, 500), toc: result.units });
          let topicCount = 0;
          for (const unit of result.units || []) {
            const unitNumber = Number(unit.unit) || topicCount + 1;
            const unitTitle = String(unit.title || `Unit ${unitNumber}`);
            await api("/topics", {
              method: "POST",
              body: JSON.stringify({
                courseId: course.id,
                title: unitTitle,
                summary: unit.summary || "",
                unit: unitNumber,
                orderIndex: 0,
                slug: `${slug}-${slugify(unitTitle)}-0`,
                content: [],
                quiz: [],
                generationStatus: "pending",
              }),
            });
            topicCount++;
            for (const [index, lesson] of (unit.lessons || []).entries()) {
              await api("/topics", {
                method: "POST",
                body: JSON.stringify({
                  courseId: course.id,
                  title: lesson.title,
                  summary: lesson.summary || "",
                  unit: unitNumber,
                  orderIndex: index + 1,
                  slug: `${slug}-${slugify(lesson.title)}-${index + 1}`,
                  content: [],
                  quiz: [],
                  generationStatus: "pending",
                }),
              });
              topicCount++;
            }
          }
          return { data: { ok: true, slug, topicCount, scannedChunks: result.scannedChunks || Math.ceil(sourceText.length / 12000) }, error: null };
        }
        if (name === "export-course") {
          const course = (await getAllCourses()).find((item: any) => item.id === body.courseId);
          const topics = await getCourseTopics(body.courseId);
          const pyqs = fromApi((await api(`/pyq?courseId=${encodeURIComponent(body.courseId)}`)).pyqs || []);
          const links = fromApi((await api(`/pyq/topics?courseId=${encodeURIComponent(body.courseId)}`)).links || []);
          return { data: { ok: true, ...await buildLocalCourseExport(course, topics, pyqs, links, body.options) }, error: null };
        }
        if (name === "export-course-mindmaps") {
          const course = (await getAllCourses()).find((item: any) => item.id === body.courseId);
          const allTopics = await getCourseTopics(body.courseId);
          const topicIds = Array.isArray(body.topicIds) ? new Set(body.topicIds.map((id: any) => String(id))) : null;
          const topics = topicIds ? allTopics.filter((topic: any) => topicIds.has(String(topic.id))) : allTopics;
          return {
            data: {
              ok: true,
              ...await buildLocalMindmapPdf(course, topics, {
                includeCourse: body.includeCourse !== false,
                filenameSuffix: topicIds ? "selected-mindmaps" : "mindmaps",
              }),
            },
            error: null,
          };
        }
        if (name === "ingest-pyq") {
          return { data: { ok: true, inserted: 0, tagged: 0 }, error: null };
        }
        return { data: null, error: new Error(`${name} is not available on the backend API yet`) };
      } catch (error) {
        return { data: null, error };
      }
    },
  },
  storage: {
    from(_bucket?: string) {
      return {
        async upload(_path?: string, _file?: File | Blob, _options?: any) {
          return { error: new Error("Storage uploads are not configured on the backend API yet") };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: path } };
        },
      };
    },
  },
};
