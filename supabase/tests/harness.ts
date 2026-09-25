/**
 * In-memory Postgres (PGlite) with the real migrations + seed, plus a minimal stand-in
 * for Supabase's auth schema and roles. Lets Vitest exercise RLS, RPCs and triggers.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create publication supabase_realtime;
`;

/**
 * Like Supabase: API roles get privileges on objects *as they are created* (default
 * privileges), so REVOKEs inside migrations stay in force.
 */
const SUPABASE_DEFAULT_PRIVILEGES = `
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export interface TestDb {
  db: PGlite;
  /** Run as the given auth user (null = anon), like a PostgREST request. */
  as<T>(userId: string | null, fn: () => Promise<T>): Promise<T>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  createUser(email?: string): Promise<string>;
  playerId(fullName: string): Promise<string>;
}

export async function createTestDb(options: { seed?: boolean } = {}): Promise<TestDb> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  await db.exec(SUPABASE_DEFAULT_PRIVILEGES);
  for (const file of readdirSync(`${root}/migrations`).sort()) {
    await db.exec(readFileSync(`${root}/migrations/${file}`, 'utf8'));
  }
  await db.exec('grant usage on schema extensions to anon, authenticated;');
  if (options.seed !== false) await db.exec(readFileSync(`${root}/seed.sql`, 'utf8'));

  const query = async <T,>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;

  // PGlite has a single connection, so role switches are serialised through this chain.
  let chain: Promise<unknown> = Promise.resolve();
  const as = <T,>(userId: string | null, fn: () => Promise<T>): Promise<T> => {
    const run = async () => {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
      await db.exec(userId ? 'set role authenticated' : 'set role anon');
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    };
    const result = chain.then(run, run);
    chain = result.catch(() => undefined);
    return result;
  };

  return {
    db,
    as,
    query,
    async createUser(email?: string) {
      const id = randomUUID();
      await query('insert into auth.users (id, email) values ($1, $2)', [id, email ?? null]);
      return id;
    },
    async playerId(fullName) {
      const rows = await query<{ id: string }>('select id from public.players where full_name = $1', [fullName]);
      if (!rows[0]) throw new Error(`No player ${fullName}`);
      return rows[0].id;
    },
  };
}

/** A joined device: anonymous auth user + selected player + round session. */
export interface Device {
  userId: string;
  playerId: string;
  rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export async function joinDevice(t: TestDb, playerName: string, code: string): Promise<Device> {
  const userId = await t.createUser();
  const playerId = await t.playerId(playerName);
  await t.as(userId, () => t.query('insert into public.player_device_profiles (player_id) values ($1)', [playerId]));
  const [{ r }] = await t.as(userId, () => t.query<{ r: { status: string } }>('select public.join_round($1) as r', [code]));
  if (r.status !== 'joined') throw new Error(`join failed for ${playerName}: ${r.status}`);
  return {
    userId,
    playerId,
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      const names = Object.keys(args);
      const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
      const rows = await t.as(userId, () => t.query<{ r: T }>(sql, Object.values(args)));
      return rows[0].r;
    },
    select: (sql, params) => t.as(userId, () => t.query(sql, params)),
  };
}
