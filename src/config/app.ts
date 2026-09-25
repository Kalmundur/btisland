/** Central app configuration. Rename the app here only. */
export const APP_NAME = 'Borðtennis Live';
export const APP_VERSION = '0.1.0';

export const SUPPORTED_LANGUAGES = ['is', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'is';

/** League table points. */
export const STANDINGS_POINTS = { win: 2, draw: 1, loss: 0 } as const;

/** How many players the Players tab ranks. */
export const TOP_PLAYERS_LIMIT = 10;

/** localStorage keys (kept together so they are easy to migrate). */
export const STORAGE_KEYS = {
  language: 'btl.language',
  playerId: 'btl.playerId',
} as const;
