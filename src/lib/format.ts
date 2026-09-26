/**
 * Date/time formatting.
 * We do not rely on Intl for Icelandic: some Chromium builds and Android WebViews ship
 * without Icelandic ICU data and silently fall back to English. Names live here instead.
 */
import i18n, { isLanguage } from '../i18n';
import { DEFAULT_LANGUAGE, type Language } from '../config/app';
import type { IsoDate } from '../domain/types';

const NAMES: Record<Language, { weekdays: string[]; months: string[] }> = {
  is: {
    weekdays: ['sun.', 'mán.', 'þri.', 'mið.', 'fim.', 'fös.', 'lau.'],
    months: ['jan.', 'feb.', 'mar.', 'apr.', 'maí', 'jún.', 'júl.', 'ágú.', 'sep.', 'okt.', 'nóv.', 'des.'],
  },
  en: {
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
};

function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

/** Parses YYYY-MM-DD as a calendar date (no timezone shift). */
function parts(date: IsoDate) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday };
}

/** is: "lau. 19. sep. 2026"  en: "Sat 19 Sep 2026" */
export function formatDate(date: IsoDate, lang: Language = currentLanguage()): string {
  const { y, m, d, weekday } = parts(date);
  const n = NAMES[lang];
  return lang === 'is'
    ? `${n.weekdays[weekday]} ${d}. ${n.months[m - 1]} ${y}`
    : `${n.weekdays[weekday]} ${d} ${n.months[m - 1]} ${y}`;
}

/** is: "19. sep."  en: "19 Sep" */
export function formatShortDate(date: IsoDate, lang: Language = currentLanguage()): string {
  const { m, d } = parts(date);
  const month = NAMES[lang].months[m - 1];
  return lang === 'is' ? `${d}. ${month}` : `${d} ${month}`;
}

/** is: "17. okt. 2026"  en: "17 Oct 2026" (no weekday) */
export function formatDayMonthYear(date: IsoDate, lang: Language = currentLanguage()): string {
  return `${formatShortDate(date, lang)} ${parts(date).y}`;
}

/** Timestamp -> is: "17.10.2026 14:05"  en: "17/10/2026 14:05" (24h in both). */
export function formatDateTime(iso: string, lang: Language = currentLanguage()): string {
  const dt = new Date(iso);
  const pad = (v: number) => String(v).padStart(2, '0');
  const sep = lang === 'is' ? '.' : '/';
  return `${pad(dt.getDate())}${sep}${pad(dt.getMonth() + 1)}${sep}${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** "14:00:00" -> "14:00" */
export function formatTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}
