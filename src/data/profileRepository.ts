/** Mapping between this device's anonymous auth user and an official player record. */
import { STORAGE_KEYS } from '../config/app';
import { requireSupabase } from '../lib/supabase';
import { storage } from '../lib/storage';
import type { UUID } from '../domain/types';
import { unwrap } from './result';

export const localProfile = {
  get: (): UUID | null => storage.get(STORAGE_KEYS.playerId),
  set: (playerId: UUID) => storage.set(STORAGE_KEYS.playerId, playerId),
  clear: () => storage.remove(STORAGE_KEYS.playerId),
};

export async function getServerProfile(authUserId: UUID): Promise<UUID | null> {
  const row = unwrap(
    await requireSupabase()
      .from('player_device_profiles')
      .select('player_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle(),
  ) as { player_id: string } | null;
  return row?.player_id ?? null;
}

export async function saveServerProfile(authUserId: UUID, playerId: UUID): Promise<void> {
  unwrap(
    await requireSupabase()
      .from('player_device_profiles')
      .upsert({ auth_user_id: authUserId, player_id: playerId }, { onConflict: 'auth_user_id' }),
  );
}
