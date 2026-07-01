import { useState, useEffect } from 'react';
import type { DeviceInfo, DeviceStatus, UserInfo } from '@evenrealities/even_hub_sdk';
import { getDeviceInfo, onDeviceStatusChanged, getUserInfo } from './device';

export type { DeviceInfo, DeviceStatus, UserInfo };

export interface UseDeviceInfoResult {
  device: DeviceInfo | null;
  status: DeviceStatus | null;
  user: UserInfo | null;
  loading: boolean;
}

export function useDeviceInfo(): UseDeviceInfoResult {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dev, usr] = await Promise.all([getDeviceInfo(), getUserInfo()]);
        if (cancelled) return;
        setDevice(dev);
        if (dev?.status) setStatus(dev.status);
        setUser(usr);
      } catch {
        // Bridge not available (browser dev mode)
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const unsub = onDeviceStatusChanged((s) => {
      setStatus(s);
      setDevice((prev) => {
        if (!prev) return prev;
        prev.updateStatus(s);
        return { ...prev } as unknown as DeviceInfo;
      });
    });
    return unsub;
  }, []);

  return { device, status, user, loading };
}
