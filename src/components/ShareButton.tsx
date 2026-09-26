import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Share2 } from 'lucide-react';
import { currentPageUrl, shareLink } from '../lib/share';

/** Shares the current page: native share sheet in the apps, Web Share / copy link on the web. */
export function ShareButton({ title }: { title: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const result = await shareLink({ title });
    if (result === 'copied') {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else if (result === 'failed') {
      window.prompt(t('share.copyPrompt'), currentPageUrl());
    }
  };

  return (
    <button type="button" className="icon-btn share-btn" onClick={() => void share()} aria-label={copied ? t('share.copied') : t('share.share')}>
      {copied ? <Check size={20} className="accent" aria-hidden /> : <Share2 size={20} aria-hidden />}
      {copied && <span className="share-btn__toast">{t('share.copied')}</span>}
    </button>
  );
}
