import { useCallback, useEffect, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** Re-runs the loader (e.g. after a realtime event or a retry tap). Keeps showing old data meanwhile. */
  reload: () => void;
}

const sameDeps = (a: DependencyList | null, b: DependencyList) =>
  a !== null && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Minimal data-loading hook: runs `load` when deps change and ignores stale responses.
 *
 * `deps` say WHAT is loaded (a player, a team, …): when they change, the previous result is
 * never shown for the new inputs – it would be another player's or team's data. `refresh`
 * are mere triggers to load the same thing again (like `reload`): the old data stays
 * visible until the new result arrives.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList, refresh: DependencyList = []): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean; deps: DependencyList | null }>({
    data: undefined,
    error: undefined,
    loading: true,
    deps: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const forDeps = deps;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load().then(
      (data) => !cancelled && setState({ data, error: undefined, loading: false, deps: forDeps }),
      (error: unknown) =>
        !cancelled && setState((s) => ({ data: sameDeps(s.deps, forDeps) ? s.data : undefined, error, loading: false, deps: forDeps })),
    );
    return () => {
      cancelled = true;
    };
    // `load` is intentionally not a dependency: callers pass the values it closes over in `deps`.
  }, [...deps, ...refresh, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // A result that belongs to other inputs is not shown, not even for the render before the effect runs.
  if (!sameDeps(state.deps, deps)) return { data: undefined, error: undefined, loading: true, reload };
  return { data: state.data, error: state.error, loading: state.loading, reload };
}
