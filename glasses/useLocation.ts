import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppLocation, AppLocationOptions } from '@evenrealities/even_hub_sdk';
import { getLocation, startLocationUpdates, stopLocationUpdates, onLocationChanged } from './device';

export type { AppLocation, AppLocationOptions };

export interface UseLocationResult {
  location: AppLocation | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLocation(options?: AppLocationOptions & { continuous?: boolean }): UseLocationResult {
  const [location, setLocation] = useState<AppLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const continuous = options?.continuous ?? false;
  const unsubRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await getLocation(options);
      setLocation(loc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get location');
    } finally {
      setLoading(false);
    }
  }, [options?.accuracy, options?.timeoutMs]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!continuous) return;
    const unsub = onLocationChanged((loc) => {
      setLocation(loc);
      setError(null);
    });
    unsubRef.current = unsub;
    startLocationUpdates(options).catch((e) => {
      setError(e instanceof Error ? e.message : 'Failed to start location updates');
    });
    return () => {
      unsub();
      unsubRef.current = null;
      stopLocationUpdates().catch(() => {});
    };
  }, [continuous, options?.accuracy, options?.distanceFilter, options?.intervalMs]);

  return { location, loading, error, refresh };
}
