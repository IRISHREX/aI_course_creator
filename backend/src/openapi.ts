export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "IGNOUprep Backend API",
    version: "1.0.0",
    description: "REST API for courses, topics, auth, progress, bookmarks, PYQ, admin, and AI key management.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Courses" },
    { name: "Topics" },
    { name: "Bookmarks" },
    { name: "Progress" },
    { name: "PYQ" },
    { name: "Admin" },
    { name: "AI Keys" },
    { name: "AI" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          code: { type: "string" },
          requestId: { type: "string" },
          detail: {},
        },
      },
      CourseInput: {
        type: "object",
        required: ["slug", "title"],
        properties: {
          slug: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          coverEmoji: { type: "string" },
          orderIndex: { type: "integer" },
          sourceText: { type: "string" },
          generationStatus: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          toc: {},
        },
      },
      TopicInput: {
        type: "object",
        required: ["courseId", "slug", "unit", "orderIndex", "title"],
        properties: {
          courseId: { type: "string", format: "uuid" },
          slug: { type: "string" },
          unit: { type: "integer", minimum: 1 },
          orderIndex: { type: "integer" },
          title: { type: "string" },
          summary: { type: "string" },
          content: {},
          quiz: {},
          mindmap: {},
          visualization: { type: "string", nullable: true },
          generationStatus: { type: "string" },
        },
      },
      PyqInput: {
        type: "object",
        required: ["courseId", "question"],
        properties: {
          courseId: { type: "string", format: "uuid" },
          question: { type: "string" },
          answer: { type: "string" },
          marks: { type: "integer", nullable: true },
          year: { type: "integer", nullable: true },
          source: { type: "string", nullable: true },
          topicIds: { type: "array", items: { type: "string", format: "uuid" } },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: { tags: ["Health"], responses: { "200": { description: "API and DB status" } } },
    },
    "/auth/signup": {
      post: {
        tags: ["Auth"],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 }, displayName: { type: "string" } } } } } },
        responses: { "200": { description: "JWT token and user" }, "409": { description: "Email already in use" } },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } } } } },
        responses: { "200": { description: "JWT token and user" }, "401": { description: "Invalid credentials" } },
      },
    },
    "/auth/me": {
      get: { tags: ["Auth"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Current user and roles" } } },
      patch: {
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["displayName"], properties: { displayName: { type: "string" } } } } } },
        responses: { "200": { description: "Updated profile" } },
      },
    },
    "/courses": {
      get: { tags: ["Courses"], responses: { "200": { description: "Course list" } } },
      post: { tags: ["Courses"], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CourseInput" } } } }, responses: { "200": { description: "Created course" } } },
    },
    "/courses/{idOrSlug}": {
      get: { tags: ["Courses"], parameters: [{ name: "idOrSlug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Course with topics" }, "404": { description: "Not found" } } },
      patch: { tags: ["Courses"], security: [{ bearerAuth: [] }], parameters: [{ name: "idOrSlug", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/CourseInput" } } } }, responses: { "200": { description: "Updated course" } } },
      delete: { tags: ["Courses"], security: [{ bearerAuth: [] }], parameters: [{ name: "idOrSlug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted course" } } },
    },
    "/topics": {
      get: { tags: ["Topics"], parameters: [{ name: "courseId", in: "query", schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Topic list" } } },
      post: { tags: ["Topics"], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { oneOf: [{ $ref: "#/components/schemas/TopicInput" }, { type: "array", items: { $ref: "#/components/schemas/TopicInput" } }] } } } }, responses: { "200": { description: "Created topic(s)" } } },
    },
    "/topics/by-slug/{slug}": {
      get: { tags: ["Topics"], parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Topic" } } },
    },
    "/topics/{id}": {
      get: { tags: ["Topics"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Topic" } } },
      patch: { tags: ["Topics"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/TopicInput" } } } }, responses: { "200": { description: "Updated topic and wrote version snapshot" } } },
      delete: { tags: ["Topics"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Deleted topic" } } },
    },
    "/topics/{id}/versions": {
      get: { tags: ["Topics"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Topic versions" } } },
    },
    "/topics/{id}/revert/{versionId}": {
      post: { tags: ["Topics"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "versionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Reverted topic" } } },
    },
    "/bookmarks": {
      get: { tags: ["Bookmarks"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Current user's bookmarks" } } },
      post: { tags: ["Bookmarks"], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["topicId", "courseId"], properties: { topicId: { type: "string", format: "uuid" }, courseId: { type: "string", format: "uuid" }, pageIndex: { type: "integer" }, wordIndex: { type: "integer" }, label: { type: "string" } } } } } }, responses: { "200": { description: "Created bookmark" } } },
    },
    "/bookmarks/{id}": {
      delete: { tags: ["Bookmarks"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Deleted bookmark" } } },
    },
    "/progress": {
      get: { tags: ["Progress"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Current user's topic progress" } } },
      put: { tags: ["Progress"], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["topicId"], properties: { topicId: { type: "string", format: "uuid" }, viewed: { type: "boolean" }, passed: { type: "boolean" }, attempts: { type: "integer" }, bestQuizScore: { type: "integer" } } } } } }, responses: { "200": { description: "Upserted progress" } } },
    },
    "/pyq": {
      get: { tags: ["PYQ"], parameters: [{ name: "courseId", in: "query", required: true, schema: { type: "string", format: "uuid" } }, { name: "topicId", in: "query", schema: { type: "string", format: "uuid" } }, { name: "year", in: "query", schema: { type: "integer" } }], responses: { "200": { description: "PYQ list" } } },
      post: { tags: ["PYQ"], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PyqInput" } } } }, responses: { "200": { description: "Created PYQ" } } },
    },
    "/pyq/topics": {
      get: { tags: ["PYQ"], parameters: [{ name: "courseId", in: "query", schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "PYQ-topic links" } } },
    },
    "/pyq/{id}": {
      patch: { tags: ["PYQ"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/PyqInput" } } } }, responses: { "200": { description: "Updated PYQ" } } },
      delete: { tags: ["PYQ"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Deleted PYQ" } } },
    },
    "/pyq/{id}/topics": {
      post: { tags: ["PYQ"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["topicId"], properties: { topicId: { type: "string", format: "uuid" } } } } } }, responses: { "200": { description: "Linked topic" } } },
    },
    "/pyq/{id}/topics/{topicId}": {
      delete: { tags: ["PYQ"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "topicId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Unlinked topic" } } },
    },
    "/admin/stats": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Counts for dashboard" } } },
    },
    "/admin/users": {
      get: { tags: ["Admin"], security: [{ bearerAuth: [] }], parameters: [{ name: "q", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Users with roles" } } },
    },
    "/admin/roles": {
      post: { tags: ["Admin"], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["userId", "role", "grant"], properties: { userId: { type: "string", format: "uuid" }, role: { type: "string", enum: ["admin", "super_admin"] }, grant: { type: "boolean" } } } } } }, responses: { "200": { description: "Role grant/revoke complete" } } },
    },
    "/admin/users/{id}": {
      delete: { tags: ["Admin"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Deleted user" } } },
    },
    "/ai-keys": {
      get: { tags: ["AI Keys"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Saved AI keys without secrets" } } },
      post: { tags: ["AI Keys"], security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["apiKey"], properties: { apiKey: { type: "string" }, provider: { type: "string", default: "google" } } } } } }, responses: { "200": { description: "Saved encrypted key" } } },
      delete: { tags: ["AI Keys"], security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "query", schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Deleted key(s)" } } },
    },
    "/ai-keys/check": {
      post: { tags: ["AI Keys"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Gemini key status checks" } } },
    },
    "/ai/chat": {
      post: { tags: ["AI"], security: [{ bearerAuth: [] }], responses: { "200": { description: "OpenAI-compatible Gemini chat completion proxy" }, "402": { description: "AI key required" } } },
    },
  },
} as const;

export const swaggerHtml = `<!doctype html>
<html>
  <head>
    <title>IGNOUprep API Docs</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`;
