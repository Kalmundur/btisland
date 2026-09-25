import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronLeft, CloudOff, Pencil } from 'lucide-react';
import { Button } from '../../components/Button';
import type { EncounterState } from '../../domain/encounterState';
import { isValidGameScore } from '../../domain/tableTennis';
import { scorerView, type OwnEntry } from '../../domain/scorer';
import { matchParticipants, type EncounterData } from '../../hooks/useEncounterData';
import { newClientEntryId, scoreOutbox, useOutbox } from '../../offline/scoreSync';
import { ScoreStepper } from './ScoreStepper';
import { scoreDrafts } from './scorecardMemory';

/**
 * Focused scoring for one individual match. Each scorer submits their own entry per game
 * (stored separately server-side); the outbox makes submission safe offline.
 */
export function ScoreEntry({
  data,
  state,
  matchNumber,
  myPlayerId,
}: {
  data: EncounterData;
  state: EncounterState;
  matchNumber: number;
  myPlayerId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const outbox = useOutbox();
  const encounter = data.encounter!;
  const match = state.matches[matchNumber - 1];

  const mine: OwnEntry[] = useMemo(() => {
    const server = data.entries
      .filter((e) => e.matchNumber === matchNumber && e.submittedByPlayerId === myPlayerId)
      .map((e) => ({ gameNumber: e.gameNumber, homePoints: e.homePoints, awayPoints: e.awayPoints, pending: false }));
    const queued = outbox.pending
      .filter((p) => p.encounterId === encounter.id && p.matchNumber === matchNumber)
      .map((p) => ({ gameNumber: p.gameNumber, homePoints: p.homePoints, awayPoints: p.awayPoints, pending: true }));
    return [...server.filter((s) => !queued.some((q) => q.gameNumber === s.gameNumber)), ...queued];
  }, [data.entries, outbox.pending, encounter.id, matchNumber, myPlayerId]);

  const view = scorerView(match.games, mine);
  // A half-entered game survives tab switches (the page unmounts); stale drafts are ignored.
  const draftKey = scoreDrafts.key(encounter.id, matchNumber);
  const [initialDraft] = useState(() => {
    const d = scoreDrafts.get(draftKey);
    return d && (d.editing || d.gameNumber === view.nextGame) ? d : undefined;
  });
  const [editingGame, setEditingGame] = useState<number | null>(initialDraft?.editing ? initialDraft.gameNumber : null);
  const currentGame = editingGame ?? view.nextGame;
  const [score, setScore] = useState(initialDraft ? { home: initialDraft.home, away: initialDraft.away } : { home: 0, away: 0 });
  const [openConflict, setOpenConflict] = useState<number | null>(null);
  const lastGame = useRef(currentGame);

  // Fresh 0–0 whenever the game being entered changes.
  useEffect(() => {
    if (lastGame.current === currentGame) return;
    lastGame.current = currentGame;
    if (editingGame === null) setScore({ home: 0, away: 0 });
  }, [currentGame, editingGame]);

  useEffect(() => {
    if (currentGame) scoreDrafts.set(draftKey, { gameNumber: currentGame, editing: editingGame !== null, ...score });
  }, [draftKey, currentGame, editingGame, score]);

  const players = matchParticipants(data, matchNumber, match.homeSlot, match.awaySlot);
  const label = (ids: string[], fallback: string) => ids.map((id) => data.names[id] ?? '…').join(' / ') || fallback;
  const homeName = label(players.home, encounter.homeTeamName);
  const awayName = label(players.away, encounter.awayTeamName);
  const homeLetter = match.kind === 'doubles' ? null : match.homeSlot;
  const awayLetter = match.kind === 'doubles' ? null : match.awaySlot;

  const scoringOpen = ['available', 'in_progress', 'conflict', 'completed'].includes(match.status) && encounter.status !== 'completed';
  const valid = isValidGameScore(score.home, score.away);

  const confirmGame = async () => {
    if (!currentGame || !valid) return;
    const decidesMatch =
      editingGame === null &&
      scorerView(match.games, [...mine, { gameNumber: currentGame, homePoints: score.home, awayPoints: score.away, pending: true }]).winner !== null;
    await scoreOutbox.enqueue({
      clientEntryId: newClientEntryId(),
      encounterId: encounter.id,
      matchNumber,
      gameNumber: currentGame,
      homePoints: score.home,
      awayPoints: score.away,
      queuedAt: Date.now(),
    });
    setEditingGame(null);
    setScore({ home: 0, away: 0 });
    scoreDrafts.clear(draftKey);
    if (decidesMatch) navigate('/scorecard');
  };

  const startEdit = (gameNumber: number, home: number | null, away: number | null) => {
    setEditingGame(gameNumber);
    setScore({ home: home ?? 0, away: away ?? 0 });
  };

  const othersFor = (gameNumber: number) =>
    data.entries.filter((e) => e.matchNumber === matchNumber && e.gameNumber === gameNumber && e.submittedByPlayerId !== myPlayerId);

  return (
    <div className="score-entry">
      <Link to="/scorecard" className="back-link">
        <ChevronLeft size={18} aria-hidden /> {t('match.allMatches')}
      </Link>

      <div className="score-entry__head">
        <span className="score-entry__title">
          {t('match.title', { number: matchNumber })}
          {match.kind === 'doubles' && ` · ${t('match.doubles')}`}
        </span>
        <span className="score-entry__team-score num">
          {encounter.homeTeamName} {state.homeScore}–{state.awayScore} {encounter.awayTeamName}
        </span>
      </div>

      <div className="duel">
        <div className={`duel__side${view.winner === 'home' ? ' duel__side--won' : ''}`}>
          {homeLetter && <span className="duel__letter">{homeLetter}</span>}
          <span className="duel__name">{homeName}</span>
        </div>
        <div className="duel__games num" aria-label={t('match.gamesWon')}>
          {view.homeGames}
          <span className="duel__dash">–</span>
          {view.awayGames}
        </div>
        <div className={`duel__side duel__side--away${view.winner === 'away' ? ' duel__side--won' : ''}`}>
          {awayLetter && <span className="duel__letter">{awayLetter}</span>}
          <span className="duel__name">{awayName}</span>
        </div>
      </div>

      {view.rows.length > 0 && (
        <ol className="game-history">
          {view.rows.map((r) => (
            <li key={r.gameNumber} className={`game-history__row${r.conflict ? ' game-history__row--conflict' : ''}`}>
              <div className="game-history__main">
                <span className="game-history__label">{t('match.game', { number: r.gameNumber })}</span>
                <span className="game-history__score num">
                  {r.homePoints ?? '–'}–{r.awayPoints ?? '–'}
                </span>
                {r.mine?.pending && (
                  <span className="tag tag--warning">
                    <CloudOff size={12} aria-hidden /> {t('sync.pendingTag')}
                  </span>
                )}
                {r.reconciled && r.reconciled.submitterCount > 1 && !r.conflict && (
                  <span className="game-history__meta muted">{t('match.scorers', { count: r.reconciled.submitterCount })}</span>
                )}
                {scoringOpen && (
                  <button
                    type="button"
                    className="icon-btn game-history__edit"
                    onClick={() => startEdit(r.gameNumber, r.homePoints, r.awayPoints)}
                    aria-label={`${t('match.edit')} ${t('match.game', { number: r.gameNumber })}`}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                )}
              </div>
              {r.conflict && (
                <div className="conflict">
                  <p className="conflict__title">
                    <AlertTriangle size={14} aria-hidden /> {t('match.conflictIn', { number: r.gameNumber })}
                  </p>
                  {r.mine && (
                    <p className="conflict__mine">
                      {t('match.yourEntry')}: <strong className="num">{r.mine.homePoints}–{r.mine.awayPoints}</strong>
                    </p>
                  )}
                  <p className="note">{t('match.conflictHelp')}</p>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setOpenConflict(openConflict === r.gameNumber ? null : r.gameNumber)}
                  >
                    {openConflict === r.gameNumber ? t('match.hideOthers') : t('match.showOthers')}
                  </button>
                  {openConflict === r.gameNumber && (
                    <ul className="conflict__others">
                      {othersFor(r.gameNumber).map((e) => (
                        <li key={e.id}>
                          <span>{data.names[e.submittedByPlayerId] ?? '…'}</span>
                          <strong className="num">
                            {e.homePoints}–{e.awayPoints}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {!scoringOpen ? (
        <p className="placeholder">{t('match.errors.match_not_available')}</p>
      ) : currentGame ? (
        <div className="score-card">
          <p className="score-card__game">
            {editingGame ? t('match.updateGame', { number: editingGame }) : t('match.game', { number: currentGame })}
          </p>
          <ScoreStepper
            home={{ name: homeName, letter: homeLetter, value: score.home }}
            away={{ name: awayName, letter: awayLetter, value: score.away }}
            onChange={(home, away) => setScore({ home, away })}
          />
          <Button block onClick={() => void confirmGame()} disabled={!valid}>
            {t('match.confirmGame')}
          </Button>
          {editingGame && (
            <Button variant="ghost" block onClick={() => setEditingGame(null)}>
              {t('match.cancelEdit')}
            </Button>
          )}
        </div>
      ) : (
        <div className="finished-card">
          <p className="finished-card__title">{t('match.finished')}</p>
          <Button variant="secondary" block onClick={() => navigate('/scorecard')}>
            {t('match.allMatches')}
          </Button>
        </div>
      )}
    </div>
  );
}

