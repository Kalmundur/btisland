import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness.ts';

// One database for the whole file (building it runs every migration).
describe('player profiles (database)', { timeout: 60_000 }, () => {
  let t: TestDb;
  let isak: string;
  let hugo: string;
  let device: string; // anonymous device that selected Isak
  let other: string; // anonymous device that selected Hugo

  beforeAll(async () => {
    t = await createTestDb();
    isak = await t.playerId('Isak Alfredsson');
    hugo = await t.playerId('Hugo Nylen');
    device = await t.createUser();
    other = await t.createUser();
    await t.as(device, () => t.query('insert into public.player_device_profiles (player_id) values ($1)', [isak]));
    await t.as(other, () => t.query('insert into public.player_device_profiles (player_id) values ($1)', [hugo]));
  }, 120_000);

  const upsert = (userId: string | null, playerId: string, fields: Record<string, unknown>) =>
    t.as(userId, () =>
      t.query(
        `insert into public.player_profiles (player_id, playing_hand, playing_style, stroke_emphasis)
         values ($1, $2, $3, $4)
         on conflict (player_id) do update set playing_hand = excluded.playing_hand,
           playing_style = excluded.playing_style, stroke_emphasis = excluded.stroke_emphasis`,
        [playerId, fields.hand ?? null, fields.style ?? null, fields.emphasis ?? null],
      ),
    );
  const fails = (p: Promise<unknown>) => p.then(() => false, () => true);

  it('the selected player can create and edit their own profile; unanswered fields stay null', async () => {
    await upsert(device, isak, { hand: 'left', style: 4 });
    const [row] = await t.as(null, () => t.query('select * from public.player_profiles where player_id = $1', [isak]));
    expect(row).toMatchObject({ playing_hand: 'left', playing_style: 4, stroke_emphasis: null });
    await upsert(device, isak, { hand: 'left', style: 5, emphasis: 2 });
    const [again] = await t.as(null, () => t.query('select * from public.player_profiles where player_id = $1', [isak]));
    expect(again).toMatchObject({ playing_style: 5, stroke_emphasis: 2 });
  });

  it('skipping stores a row with every field null', async () => {
    await upsert(other, hugo, {});
    const [row] = await t.as(null, () => t.query('select * from public.player_profiles where player_id = $1', [hugo]));
    expect(row).toMatchObject({ playing_hand: null, playing_style: null, stroke_emphasis: null });
  });

  it("another player's device cannot create or change someone else's profile", async () => {
    const before = await t.as(null, () => t.query('select * from public.player_profiles where player_id = $1', [isak]));
    expect(await fails(upsert(other, isak, { hand: 'right', style: 1 }))).toBe(true);
    // A direct update matches no rows (RLS), so nothing changes.
    await t.as(other, () => t.query(`update public.player_profiles set playing_style = 1 where player_id = $1`, [isak]));
    // And moving one's own row onto someone else is rejected by the check clause.
    expect(await fails(t.as(other, () => t.query(`update public.player_profiles set player_id = $1 where player_id = $2`, [isak, hugo])))).toBe(true);
    const after = await t.as(null, () => t.query('select * from public.player_profiles where player_id = $1', [isak]));
    expect(after).toEqual(before);
  });

  it('signed-out visitors can read but not write', async () => {
    expect((await t.as(null, () => t.query('select * from public.player_profiles'))).length).toBeGreaterThan(0);
    expect(await fails(upsert(null, isak, { hand: 'right' }))).toBe(true);
  });

  it('values outside the allowed range are rejected', async () => {
    expect(await fails(upsert(device, isak, { style: 0 }))).toBe(true);
    expect(await fails(upsert(device, isak, { emphasis: 6 }))).toBe(true);
    expect(await fails(upsert(device, isak, { hand: 'both' }))).toBe(true);
  });

  it('organizers can moderate any profile; the official player record is untouched', async () => {
    const org = await t.createUser('org@example.com');
    await t.query('insert into public.organizers (user_id) values ($1)', [org]);
    await upsert(org, isak, {});
    const [row] = await t.as(null, () => t.query('select * from public.player_profiles where player_id = $1', [isak]));
    expect(row).toMatchObject({ playing_hand: null, playing_style: null, stroke_emphasis: null });
    const [player] = await t.query<{ full_name: string }>('select full_name from public.players where id = $1', [isak]);
    expect(player.full_name).toBe('Isak Alfredsson');
  });
});
