import { NativeModules, Platform } from 'react-native';
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
  try {
    GowayNative = NativeModules.GowayNative ?? null;
  } catch {
    GowayNative = null;
  }
}

export const liveActivityService = {
  isSupported(): boolean {
    return Platform.OS === 'ios' && !!GowayNative?.startLiveActivity;
  },

  async start(data: LiveActivityData): Promise<boolean> {
    if (!GowayNative?.startLiveActivity) return false;
    try {
      await GowayNative.startLiveActivity(data);
      return true;
    } catch {
      return false;
    }
  },

  async update(data: LiveActivityData): Promise<void> {
    if (!GowayNative?.updateLiveActivity) return;
    try {
      await GowayNative.updateLiveActivity(data);
    } catch {
      /* ignore */
    }
  },

  async end(): Promise<void> {
    if (!GowayNative?.endLiveActivity) return;
    try {
      await GowayNative.endLiveActivity();
    } catch {
      /* ignore */
    }
  },

  async setAppGroupData(key: string, value: string): Promise<void> {
    if (!GowayNative?.setAppGroupValue) return;
    try {
      await GowayNative.setAppGroupValue(key, value);
    } catch {
      /* ignore */
    }
  },
};
