import { requireNativeModule } from 'expo-modules-core';

export interface LiveActivityData {
  lineName: string;
  lineColor: string;
  direction: string;
  minutesUntil: number;
  stopName: string;
  isRealtime: boolean;
  isNavigation?: boolean;
  stepIndex?: number;
  totalSteps?: number;
  distanceMeters?: number;
  isStopTracking?: boolean;
}

let GowayNative: {
  startLiveActivity: (data: LiveActivityData) => Promise<void>;
  updateLiveActivity: (data: LiveActivityData) => Promise<void>;
  endLiveActivity: () => Promise<void>;
  setAppGroupValue: (key: string, value: string) => Promise<void>;
} | null = null;

try {
  GowayNative = requireNativeModule('GowayNative');
} catch {
  GowayNative = null;
}

export default GowayNative;
