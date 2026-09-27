/**
 * Optional, player-supplied profile details (Leikhönd / Leikstíll / Áhersla).
 * Separate from the official player record; every field may be unanswered (null).
 */
export type PlayingHand = 'right' | 'left';
/** 1 … 5 on a two-ended scale (style: defensive → offensive, emphasis: backhand → forehand). */
export type ScaleValue = 1 | 2 | 3 | 4 | 5;

export interface PlayerProfileDetails {
  playingHand: PlayingHand | null;
  playingStyle: ScaleValue | null;
  strokeEmphasis: ScaleValue | null;
}

export const SCALE_VALUES: readonly ScaleValue[] = [1, 2, 3, 4, 5];

/** Nothing answered – what "Sleppa í bili" stores (never a default middle value). */
export const EMPTY_PROFILE: PlayerProfileDetails = { playingHand: null, playingStyle: null, strokeEmphasis: null };

export function hasAnyDetail(p: PlayerProfileDetails | null | undefined): p is PlayerProfileDetails {
  return !!p && (p.playingHand !== null || p.playingStyle !== null || p.strokeEmphasis !== null);
}
