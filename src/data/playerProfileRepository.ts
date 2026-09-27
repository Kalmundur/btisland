/** Player-supplied profile details (player_profiles). RLS: public read; only the device's own player (or an organizer) writes. */
import { requireSupabase } from '../lib/supabase';
import type { PlayerProfileDetails, PlayingHand, ScaleValue } from '../domain/playerProfile';
import type { UUID } from '../domain/types';
import { unwrap } from './result';

interface Row {
  playing_hand: PlayingHand | null;
  playing_style: ScaleValue | null;
  stroke_emphasis: ScaleValue | null;
}

/** null = no row: the optional setup was never completed or skipped for this player. */
export async function getPlayerProfile(playerId: UUID): Promise<PlayerProfileDetails | null> {
  const row = unwrap(
    await requireSupabase()
      .from('player_profiles')
      .select('playing_hand, playing_style, stroke_emphasis')
      .eq('player_id', playerId)
      .maybeSingle(),
  ) as Row | null;
  return row ? { playingHand: row.playing_hand, playingStyle: row.playing_style, strokeEmphasis: row.stroke_emphasis } : null;
}

/** Creates or replaces the row (all-null = skipped). */
export async function savePlayerProfile(playerId: UUID, p: PlayerProfileDetails): Promise<void> {
  unwrap(
    await requireSupabase().from('player_profiles').upsert(
      { player_id: playerId, playing_hand: p.playingHand, playing_style: p.playingStyle, stroke_emphasis: p.strokeEmphasis },
      { onConflict: 'player_id' },
    ),
  );
}
