import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Missing env: DATABASE_URL");
}

let schema: string;
const parsedUrl = new URL(url);
if (parsedUrl.protocol === "mysql:") {
  schema = "prisma/schema.prisma";
} else if (parsedUrl.protocol === "postgres:" || parsedUrl.protocol === "postgresql:") {
  schema = "prisma/schema.postgres.prisma";
} else {
  throw new Error(
    `Unsupported DATABASE_URL protocol ${parsedUrl.protocol}. Use mysql:// or postgresql://.`
  );
}

const action = process.argv[2] || "generate";
const extraArgs = process.argv.slice(3);
let prismaArgs: string[];

switch (action) {
  case "generate":
    prismaArgs = ["generate", "--schema", schema, ...extraArgs];
    break;
  case "migrate:dev":
    prismaArgs = ["migrate", "dev", "--schema", schema, ...extraArgs];
    break;
  case "migrate:deploy":
    prismaArgs = ["migrate", "deploy", "--schema", schema, ...extraArgs];
    break;
  case "db:push":
    prismaArgs = ["db", "push", "--schema", schema, ...extraArgs];
    break;
  default:
    throw new Error(
      `Unsupported action ${action}. Use generate, migrate:dev, migrate:deploy, or db:push.`
    );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaExecutable = path.join(
  __dirname,
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
);

let result;
if (process.platform === "win32") {
  result = spawnSync("cmd.exe", ["/c", prismaExecutable, ...prismaArgs], {
    stdio: "inherit",
  });
} else {
  result = spawnSync(prismaExecutable, prismaArgs, {
    stdio: "inherit",
    shell: false,
  });
}

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}
