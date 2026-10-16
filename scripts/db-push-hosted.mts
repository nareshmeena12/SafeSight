/**
 * Applies new SQL migrations to the hosted Supabase project through the
 * Management API, and records them in supabase_migrations.schema_migrations
 * (the table the Supabase CLI uses), so `supabase db push` agrees later.
 *
 *   pnpm db:push:hosted            apply pending migrations
 *   pnpm db:push:hosted --dry-run  list what would run
 *
 * Needs SUPABASE_ACCESS_TOKEN (a personal access token) and
 * SUPABASE_PROJECT_REF. No database password required.
 */
import { readdir, readFile } from "node:fs/promises";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF first.");
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");

async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body}`);
  return JSON.parse(body) as T[];
}

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

await query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
`);

const applied = new Set(
  (await query<{ version: string }>("select version from supabase_migrations.schema_migrations")).map(
    (r) => r.version,
  ),
);

const files = (await readdir("supabase/migrations")).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const pending = files.filter((f) => !applied.has(f.split("_")[0]));

if (pending.length === 0) {
  console.log("Hosted database is up to date.");
  process.exit(0);
}

for (const file of pending) {
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  const name = rest.join("_");
  if (dryRun) {
    console.log(`would apply ${file}`);
    continue;
  }
  const sql = await readFile(`supabase/migrations/${file}`, "utf8");
  // One transaction: the migration and its history row land together or not at all.
  await query(`begin;
${sql}
insert into supabase_migrations.schema_migrations (version, name, statements)
values (${quote(version)}, ${quote(name)}, array[${quote(sql)}]);
commit;`);
  console.log(`applied ${file}`);
}
