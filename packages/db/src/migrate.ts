import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: join(new URL("../../..", import.meta.url).pathname, ".env"), quiet: true });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
const migrationsDir = join(new URL(".", import.meta.url).pathname, "migrations");
const migrationLockId = 7_391_024_882;

await sql.begin(async (tx) => {
  await tx`select pg_advisory_xact_lock(${migrationLockId})`;
  await tx`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const [row] = await tx<{ exists: boolean }[]>`
      select exists(select 1 from schema_migrations where id = ${file}) as exists
    `;

    if (row?.exists) continue;

    const migration = await readFile(join(migrationsDir, file), "utf8");
    await tx.unsafe(migration);
    await tx`insert into schema_migrations (id) values (${file})`;
    console.log(`Applied migration ${file}`);
  }
});

await sql.end({ timeout: 5 });
