import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { useDialog } from '../hooks/useDialog';

/**
 * Small centred confirmation dialog. `onConfirm` may be async: the buttons are disabled while
 * it runs, and a thrown error is shown inside the dialog (mapped by `errorText`).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
  errorText,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  errorText?: (error: unknown) => string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };
  const ref = useDialog<HTMLDivElement>(open, close);
  const titleId = useId();
  const bodyId = useId();

  if (!open) return null;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(errorText ? errorText(e) : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="confirm">
      <div className="confirm__backdrop" onClick={close} aria-hidden />
      <div className="confirm__panel" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} ref={ref}>
        <h2 id={titleId} className="confirm__title">
          {title}
        </h2>
        <p id={bodyId} className="confirm__body">
          {body}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm__actions">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={() => void confirm()} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
