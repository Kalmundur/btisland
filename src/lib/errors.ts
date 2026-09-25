/**
 * Turns any failure into a small, translatable category. Raw Supabase/Postgres messages
 * are never shown to users; they only drive the classification.
 */
export type ErrorKind =
  | 'notConfigured'
  | 'offline'
  | 'network'
  | 'sessionExpired'
  | 'forbidden'
  | 'notFound'
  | 'duplicate'
  | 'inUse'
  | 'invalid'
  | 'generic';

interface ErrorLike {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
}

export function classifyError(error: unknown, isOnline: boolean = typeof navigator === 'undefined' || navigator.onLine !== false): ErrorKind {
  const e = (typeof error === 'object' && error !== null ? error : { message: String(error) }) as ErrorLike;
  const message = e.message ?? '';
  const code = e.code ?? '';
  if (e.name === 'SupabaseNotConfiguredError') return 'notConfigured';
  if (!isOnline) return 'offline';
  if (/failed to fetch|networkerror|network request failed|load failed|timeout/i.test(message)) return 'network';
  if (code.startsWith('PGRST30') || e.status === 401 || /jwt expired|invalid jwt|refresh token/i.test(message)) return 'sessionExpired';
  if (code === '42501' || /permission denied|row-level security|forbidden/i.test(message)) return 'forbidden';
  if (code === 'P0002' || code === 'PGRST116' || /not_found/.test(message)) return 'notFound';
  if (code === '23505') return 'duplicate';
  if (code === '23503') return 'inUse';
  if (code === '23514' || code === '22P02' || code === '23502' || /invalid/.test(message)) return 'invalid';
  return 'generic';
}

/** Translation key for an error (under `errors.*`). */
export function errorKey(error: unknown): string {
  const kind = classifyError(error);
  // errors.notFound is the page-level 404 text; data lookups use notFoundData.
  return kind === 'notFound' ? 'errors.notFoundData' : `errors.${kind}`;
}

/** The key a SECURITY DEFINER function raised (e.g. "lineup_changed"), or 'generic'. */
export function rpcErrorKey(error: unknown): string {
  const message = (error instanceof Error ? error.message : String((error as ErrorLike)?.message ?? error)).trim();
  if (/^[a-z][a-z_]*$/.test(message)) return message;
  const match = message.match(/\b[a-z]+(?:_[a-z]+)+\b/);
  return match ? match[0] : 'generic';
}
