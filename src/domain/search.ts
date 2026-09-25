/** Folds Icelandic/accented letters so "david" finds "Davíð" and "thor" finds "Þór". */
export function foldForSearch(text: string): string {
  return text
    .toLocaleLowerCase('is')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/æ/g, 'ae')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Every whitespace-separated query term must appear in one of the fields. */
export function matchesSearch(fields: ReadonlyArray<string | null | undefined>, query: string): boolean {
  const terms = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = foldForSearch(fields.filter(Boolean).join(' '));
  return terms.every((t) => haystack.includes(t));
}
