#!/usr/bin/env node

import { config } from 'dotenv';
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const isPostgres = url.startsWith('postgresql://') || url.startsWith('postgres://');
const schema = isPostgres ? 'prisma/schema.postgres.prisma' : 'prisma/schema.prisma';

console.log(`Detected ${isPostgres ? 'PostgreSQL' : 'MySQL'}, using schema: ${schema}`);

import { execSync } from 'child_process';
execSync(`npx prisma generate --schema=${schema}`, { stdio: 'inherit' });