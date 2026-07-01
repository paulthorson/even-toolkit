import {
  EvenAppBridge,
  type AppLocation,
  type AppLocationOptions,
  AppLocationAccuracy,
  type AppImageAsset,
  ImuReportPace,
  type DeviceInfo,
  type DeviceStatus,
  type UserInfo,
} from '@evenrealities/even_hub_sdk';

export { AppLocationAccuracy, ImuReportPace };
export type { AppLocation, AppLocationOptions, AppImageAsset, DeviceInfo, DeviceStatus, UserInfo };

async function getBridge(): Promise<EvenAppBridge> {
  const bridge = EvenAppBridge.getInstance();
  let waited = 0;
  while (!bridge.ready) {
    await new Promise((r) => setTimeout(r, 50));
    waited++;
    if (waited > 100) throw new Error('EvenAppBridge not ready after 5s');
  }
  return bridge;
}

export async function getLocation(options?: AppLocationOptions): Promise<AppLocation | null> {
  const bridge = await getBridge();
  return bridge.getAppLocation(options);
}

export async function startLocationUpdates(options?: AppLocationOptions): Promise<boolean> {
  const bridge = await getBridge();
  return bridge.startAppLocationUpdates(options);
}

export async function stopLocationUpdates(): Promise<boolean> {
  const bridge = await getBridge();
  return bridge.stopAppLocationUpdates();
}

export function onLocationChanged(callback: (location: AppLocation) => void): () => void {
  const bridge = EvenAppBridge.getInstance();
  return bridge.onAppLocationChanged(callback);
}

export async function capturePhoto(): Promise<AppImageAsset | null> {
  const bridge = await getBridge();
  return bridge.captureImageFromCamera();
}

export async function pickPhoto(): Promise<AppImageAsset | null> {
  const bridge = await getBridge();
  return bridge.pickImageFromAlbum();
}

export async function startImu(pace: ImuReportPace = ImuReportPace.P100): Promise<boolean> {
  const bridge = await getBridge();
  return bridge.imuControl(true, pace);
}

export async function stopImu(): Promise<boolean> {
  const bridge = await getBridge();
  return bridge.imuControl(false);
}

export async function getDeviceInfo(): Promise<DeviceInfo | null> {
  const bridge = await getBridge();
  return bridge.getDeviceInfo();
}

export function onDeviceStatusChanged(callback: (status: DeviceStatus) => void): () => void {
  const bridge = EvenAppBridge.getInstance();
  return bridge.onDeviceStatusChanged(callback);
}

export async function getUserInfo(): Promise<UserInfo> {
  const bridge = await getBridge();
  return bridge.getUserInfo();
}
