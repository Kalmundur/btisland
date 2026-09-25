import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { classifyError, errorKey, rpcErrorKey } from '../lib/errors';

/**
 * Human-readable text for a failed action: a specific workflow message when the server
 * raised a known key (e.g. `selection.errors.lineup_changed`), otherwise the general
 * connectivity / session / permission message. Never the raw database text.
 */
export function useErrorText(namespace?: 'selection.errors' | 'result.errors' | 'match.errors') {
  const { t, i18n } = useTranslation();
  return useCallback(
    (error: unknown): string => {
      const kind = classifyError(error);
      if (namespace && kind !== 'offline' && kind !== 'network' && kind !== 'sessionExpired') {
        const key = `${namespace}.${rpcErrorKey(error)}`;
        if (i18n.exists(key)) return t(key);
      }
      return t(errorKey(error));
    },
    [namespace, t, i18n],
  );
}
