/**
 * The one place that shares a link. Native apps use the system share sheet (Capacitor Share);
 * the web keeps the Web Share API with a copy-to-clipboard fallback.
 */
import { Share } from '@capacitor/share';
import { isNative } from './platform';

/**
 * Public web address, used for links shared from the native apps (inside them the page runs
 * on a local origin). Override with VITE_PUBLIC_URL, e.g. when a custom domain is added.
 */
export const PUBLIC_WEB_URL = (import.meta.env.VITE_PUBLIC_URL || 'https://btisland.vercel.app').replace(/\/$/, '');

export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed';

/** The shareable address of the current page (native pages run on a local origin). */
export function currentPageUrl(): string {
  const { pathname, search, href } = window.location;
  return isNative ? `${PUBLIC_WEB_URL}${pathname}${search}` : href;
}

const isCancel = (e: unknown) => /abort|cancel/i.test(`${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''}`);

export async function shareLink({ title, url = currentPageUrl() }: { title: string; url?: string }): Promise<ShareResult> {
  if (isNative) {
    try {
      await Share.share({ title, url, dialogTitle: title });
      return 'shared';
    } catch (e) {
      return isCancel(e) ? 'cancelled' : 'failed';
    }
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'; // user closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
