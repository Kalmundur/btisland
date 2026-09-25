import { useCallback, useEffect, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** Re-runs the loader (e.g. after a realtime event or a retry tap). Keeps showing old data meanwhile. */
  reload: () => void;
}

/** Minimal data-loading hook: runs `load` when deps change and ignores stale responses. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({
    data: undefined,
    error: undefined,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load().then(
      (data) => !cancelled && setState({ data, error: undefined, loading: false }),
      (error: unknown) => !cancelled && setState((s) => ({ data: s.data, error, loading: false })),
    );
    return () => {
      cancelled = true;
    };
    // `load` is intentionally not a dependency: callers pass the values it closes over in `deps`.
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
