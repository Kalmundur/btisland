/**
 * In-memory scorecard state that must survive tab switches (the Scorecard page unmounts
 * when another tab is shown). Submitted entries live in the IndexedDB outbox; this only
 * keeps the unfinished UI state: the last scorecard route and half-entered game scores.
 */

let lastPath = '/scorecard';

export const scorecardRoute = {
  get: () => lastPath,
  set: (path: string) => {
    if (path.startsWith('/scorecard')) lastPath = path;
  },
};

export interface ScoreDraft {
  gameNumber: number;
  editing: boolean;
  /** null = field still empty */
  home: number | null;
  away: number | null;
}

const drafts = new Map<string, ScoreDraft>();

export const scoreDrafts = {
  key: (encounterId: string, matchNumber: number) => `${encounterId}:${matchNumber}`,
  get: (key: string) => drafts.get(key),
  set: (key: string, draft: ScoreDraft) => drafts.set(key, draft),
  clear: (key: string) => drafts.delete(key),
  /** On logout: the next player must not find the previous player's half-entered games. */
  clearAll: () => drafts.clear(),
};
