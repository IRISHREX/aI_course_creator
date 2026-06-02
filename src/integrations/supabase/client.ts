import { getAppSettings, getCourseSettings } from "@/lib/appSettings";

type Filter = { key: string; value: any; op: "eq" | "in" };
type Order = { key: string; ascending: boolean };

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
    ...authHeaders(),
    ...(init.headers || {}),
  };
  try {
    const res = await fetch(`${API_URL}${path}`, { ...init, headers, signal: init.signal ?? controller.signal });
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
    const value = cleanString(block.value);
    const caption = cleanString(block.caption);
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

async function saveAiKey(apiKey: string) {
  return api("/ai-keys", {
    method: "POST",
    body: JSON.stringify({ apiKey, provider: "google" }),
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
        return parseJsonPayload(args, fallback);
      }
    }
    const text = data.choices?.[0]?.message?.content || "";
    if (!text.trim()) throw new Error("AI returned an empty response.");
    const parsed = parseJsonPayload(text, fallback);
    if (parsed === fallback) throw new Error("AI returned JSON that could not be parsed.");
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
    units: lessons.map((lesson: any, index: number) => ({
      unit: index + 1,
      title: String(lesson.title || `Unit ${index + 1}`),
      summary: String(lesson.summary || ""),
      lessons: [],
    })),
  };
}

async function buildCourseOutlineFromSource(title: string, sourceText: string) {
  const chunks = chunkText(sourceText);
  const summaries: string[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const result = await aiJson(
      "Return only valid JSON: {\"summary\":\"\",\"topics\":[\"\"]}. Scan this source chunk and list every important topic, subtopic, term, process, formula, and example. Do not create lessons yet.",
      `Course: ${title}\nChunk ${index + 1} of ${chunks.length}\n\n${chunks[index]}`,
      { summary: "", topics: [] },
    );
    const topicList = Array.isArray(result.topics) ? result.topics.join("; ") : "";
    summaries.push(`Chunk ${index + 1}: ${result.summary || ""}\nTopics: ${topicList}`);
  }

  const result = await aiJson(
    `Return only valid JSON in this shape:
{"description":"","units":[{"unit":1,"title":"","summary":"","lessons":[{"title":"","summary":""}]}]}

Build a complete course map from the scan summaries. Cover all major topics from the source. Use unit overview lessons as x.0 and sub-lessons as x.1, x.2, etc. Create 2-6 units when possible, and 1-6 sub-lessons per unit. Keep lesson titles specific and non-overlapping.`,
    `Course title: ${title}
${getAppSettings().ai.optimizationPrompt ? `Optimization rule: ${getAppSettings().ai.optimizationPrompt}\n` : ""}
${getAppSettings().ai.coursePrompt ? `Admin course prompt addition: ${getAppSettings().ai.coursePrompt}\n` : ""}

Whole-document scan summaries:
${summaries.join("\n\n")}`,
    { description: "", units: [] },
  );

  return normalizeOutline(result);
}

const LESSON_GENERATION_SYSTEM_PROMPT = `You are a structured content generator for an AI learning platform.

Your task is to generate educational content strictly in JSON format.

RULES:
1. Output MUST be a valid JSON object with "summary" and "content"; "content" MUST be a valid JSON array.
2. Each content object MUST follow the block schema.
3. Do NOT add explanations outside JSON.
4. Use only supported block types:
["text", "list", "highlight", "table", "code", "flowchart", "chart", "image", "math", "timeline"]
5. Keep content conceptual, example-driven, and problem-solving oriented.
6. Maintain logical flow: Intro -> Concept -> Example -> Insight -> Advanced.

BLOCK RULES:
- text -> must have "value"
- list -> must have "items" as an array
- highlight -> short key insight in "value"
- table -> must have "headers" and "rows"
- code -> must have "value" and "language"
- flowchart -> must have Mermaid syntax in "code", starting with graph TD, graph LR, flowchart TD, etc. Quote labels with punctuation, for example B{"Connectivity (e.g., Wi-Fi)"}.
- timeline -> use "timeline_items" with {label, desc}

STYLE RULES:
- Keep explanations clear and concise.
- Use real-world examples.
- Avoid redundancy.
- Avoid empty fields.
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

export const supabase = {
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
    async save(apiKey: string) {
      return saveAiKey(apiKey);
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
          const data = await aiJson(
            "Return only valid JSON in this shape: {\"mindmap\":{\"id\":\"root\",\"label\":\"\",\"children\":[]}}. Build an educational concept mind map, not a study schedule. Labels must be short.",
            mindmapPrompt,
            { mindmap: null },
          );
          if (data.mindmap && body.topicId) await patchTopic(body.topicId, { mindmap: data.mindmap });
          if (data.mindmap && !body.topicId && courseId) await patchCourse(courseId, { mindmap: data.mindmap });
          return { data: { ok: true, mindmap: data.mindmap }, error: null };
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
        if (name === "generate-lesson") {
          const topic = await getTopic(body.topicId);
          const customInstruction = cleanString(body.customInstruction || body.instruction);
          const appSettings = getAppSettings();
          const courseSettings = getCourseSettings(topic.course_id);
          const userPrompt = `Generate a lesson on: ${topic.title}

Current summary: ${topic.summary || ""}
Mode: ${body.mode || "replace"}
Level: ${body.level || 5}

${customInstruction ? `Extra instruction from admin: ${customInstruction}\n` : ""}
${appSettings.ai.optimizationPrompt ? `Global optimization rule: ${appSettings.ai.optimizationPrompt}\n` : ""}
${appSettings.ai.lessonPrompt ? `Global lesson prompt addition: ${appSettings.ai.lessonPrompt}\n` : ""}
${courseSettings.lessonPrompt ? `Course lesson prompt addition: ${courseSettings.lessonPrompt}\n` : ""}
Follow this structure:
1. Intro (text)
2. Core Concept (text)
3. Key Points (list)
4. Example (text)
5. Insight (highlight)
6. Advanced Concept (text)
7. Example (text)
8. Summary (text)

You may add up to 7 extra supported blocks when they improve the lesson, such as:
- table for comparisons
- code for programming or algorithms
- flowchart for processes; put valid Mermaid flowchart syntax in code, for example:
  graph TD
    A[Start] --> B[Process]
    B --> C[End]
  Quote labels that contain punctuation or parentheses, e.g. B{"Connectivity (e.g., Wi-Fi)"}.
- chart for simple numeric comparisons
- math for formulas
- timeline for historical or sequential topics
- image only when a visual would genuinely help; include caption and prompt, not an empty url

Also write exactly 4 multiple-choice quiz questions (4 options each, exactly one correct).`;
          const result = await aiToolJson(
            LESSON_GENERATION_SYSTEM_PROMPT,
            userPrompt,
            "write_lesson",
            WRITE_LESSON_PARAMETERS,
            { content: [], quiz: [] },
          );
          const blocks = normalizeLessonContent(result.content || []);
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
          if (body.generate) await supabase.functions.invoke("generate-lesson", { body: { topicId: topic.id } });
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
          await patchCourse(body.courseId, { source_text: source });
          return { data: { ok: true, sourceLength: source.length, attempts: 1 }, error: null };
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
          return { data: { ok: true, slug, topicCount }, error: null };
        }
        if (name === "export-course") {
          const course = (await getAllCourses()).find((item: any) => item.id === body.courseId);
          const topics = await getCourseTopics(body.courseId);
          const text = `${course?.title || "Course"}\n\n${topics.map((topic: any) => `${topic.title}\n${topic.summary || ""}`).join("\n\n")}`;
          return { data: { ok: true, docx: btoa(unescape(encodeURIComponent(text))) }, error: null };
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
