import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { ApiError } from '@/api/errors';
import { config } from '@/config';
import { Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';

type Status =
  | { state: 'checking' }
  | { state: 'ok' }
  | { state: 'error'; error: ApiError };

// Dev helper: shows whether the app can reach the API (GET /health).
// Plain useEffect for now — 5B replaces this pattern with React Query.
export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ state: 'checking' });

  useEffect(() => {
    unwrap(api.GET('/health'))
      .then(() => setStatus({ state: 'ok' }))
      .catch((err: unknown) =>
        setStatus({
          state: 'error',
          // unwrap only throws ApiError, but `catch` can't know that.
          error:
            err instanceof ApiError
              ? err
              : new ApiError('UNKNOWN', 'Unexpected error'),
        }),
      );
  }, []);

  const label =
    status.state === 'checking'
      ? 'Checking…'
      : status.state === 'ok'
        ? 'Connected'
        : `${status.error.code}: ${status.error.message}`;

  return (
    <View style={styles.row}>
      <ThemedText type="small">API</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {config.apiUrl}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.one,
    alignItems: 'center',
  },
});
