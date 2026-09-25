import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Share2 } from 'lucide-react';

/** Web Share API where available (phones), copy-link fallback elsewhere. */
export function ShareButton({ title }: { title: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // user closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(t('share.copyPrompt'), url);
    }
  };

  return (
    <button type="button" className="icon-btn share-btn" onClick={() => void share()} aria-label={copied ? t('share.copied') : t('share.share')}>
      {copied ? <Check size={20} className="accent" aria-hidden /> : <Share2 size={20} aria-hidden />}
      {copied && <span className="share-btn__toast">{t('share.copied')}</span>}
    </button>
  );
}
