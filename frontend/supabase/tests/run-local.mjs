// Runs the database setup script and the smoke test against an in-memory
// PostgreSQL (PGlite), with a minimal stand-in for Supabase's auth schema and
// default privileges. No Supabase project or network access is needed.
//
//   npm run test:db
//
// Exits non-zero if the setup script fails or any smoke-test check fails.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const setupSql = readFileSync(join(here, "..", "000_full_setup.sql"), "utf8");
const smokeSql = readFileSync(join(here, "smoke_test.sql"), "utf8");

// What Supabase provides before any project SQL runs.
const supabaseStub = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb,
    aud text,
    role text,
    created_at timestamptz default now()
  );
  create table auth.mfa_factors (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    friendly_name text,
    factor_type text not null default 'totp',
    status text not null default 'verified',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;

  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;

  -- Supabase grants everything in public to the API roles by default;
  -- the setup script is responsible for revoking what it must.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

const db = new PGlite({ extensions: { pgcrypto } });
let failed = 0;

async function step(label, fn) {
  try {
    await fn();
    console.log(`ok   ${label}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${label}\n     ${err.message}${err.where ? `\n     at ${err.where}` : ""}`);
  }
}

await step("Supabase stub", () => db.exec(supabaseStub));
await step("000_full_setup.sql (first run)", () => db.exec(setupSql));
await step("000_full_setup.sql (re-run is safe)", () => db.exec(setupSql));

if (!failed) {
  const results = await db.exec(smokeSql);
  const rows = results.at(-1)?.rows ?? [];
  for (const row of rows) {
    if (!row.passed) failed++;
    console.log(`${row.passed ? "ok  " : "FAIL"} ${String(row.step).padStart(2)}. ${row.check_name}${row.passed ? "" : `\n     ${row.detail}`}`);
  }
  console.log(`\n${rows.length - (rows.filter((r) => !r.passed).length)}/${rows.length} smoke checks passed`);
  if (!rows.length) failed++;
}

await db.close();
process.exit(failed ? 1 : 0);
