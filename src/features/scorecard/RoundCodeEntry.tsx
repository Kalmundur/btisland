import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CodeInput } from '../../components/Inputs';
import { Button } from '../../components/Button';
import { List, Section } from '../../components/List';
import { joinRound } from '../../data/roundRepository';
import { getEncounter } from '../../data/leagueRepository';
import { isCompleteRoundCode } from '../../domain/roundCode';
import { classifyError } from '../../lib/errors';
import type { EncounterDetail, JoinRoundResult } from '../../domain/types';

type ErrorKey = Exclude<JoinRoundResult['status'], 'joined' | 'choose'> | 'generic';

/** Six-digit round code entry. On success the parent reloads sessions and shows the match. */
export function RoundCodeEntry({ onJoined }: { onJoined: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [choices, setChoices] = useState<EncounterDetail[] | null>(null);

  const join = async (encounterId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await joinRound(code, encounterId);
      if (result.status === 'joined') {
        onJoined();
      } else if (result.status === 'choose') {
        const details = await Promise.all(result.choices.map((c) => getEncounter(c.encounterId)));
        setChoices(details.filter((d): d is EncounterDetail => d !== null));
      } else {
        setError(result.status);
      }
    } catch (e) {
      const kind = classifyError(e);
      setError(kind === 'offline' || kind === 'network' ? 'not_authenticated' : 'generic');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isCompleteRoundCode(code) && !busy) void join();
  };

  if (choices) {
    return (
      <Section title={t('scorecard.chooseTitle')}>
        <p className="lead">{t('scorecard.chooseIntro')}</p>
        <List>
          {choices.map((c) => (
            <li key={c.id}>
              <button type="button" className="enc-row enc-row--button" onClick={() => void join(c.id)} disabled={busy}>
                <span className="enc-row__team enc-row__team--home">{c.homeTeamName}</span>
                <span className="enc-row__score">{t('common.vs')}</span>
                <span className="enc-row__team enc-row__team--away">{c.awayTeamName}</span>
              </button>
            </li>
          ))}
        </List>
        <Button variant="ghost" block onClick={() => setChoices(null)}>
          {t('common.cancel')}
        </Button>
      </Section>
    );
  }

  return (
    <form className="code-card" onSubmit={submit}>
      <h2 className="code-card__title">{t('scorecard.enterCodeTitle')}</h2>
      <p className="lead">{t('scorecard.enterCodeIntro')}</p>
      <CodeInput
        value={code}
        onChange={(v) => {
          setCode(v);
          setError(null);
        }}
        label={t('scorecard.codeLabel')}
        invalid={!!error}
        disabled={busy}
      />
      {error && (
        <p className="form-error" role="alert">
          {t(`scorecard.errors.${error}`)}
        </p>
      )}
      <Button type="submit" block disabled={!isCompleteRoundCode(code) || busy}>
        {busy ? t('scorecard.joining') : t('scorecard.join')}
      </Button>
    </form>
  );
}
