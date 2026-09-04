import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import type { Coordinates } from '../stores/transitStore';
import type { NavigationStep } from '../services/routing/navigationSteps';
import {
  hasReachedNavigationStep,
  haversineMeters,
  NAVIGATION_AUTO_ADVANCE_COOLDOWN_MS,
} from '../utils/geo';
import { navigationLiveActivityService } from '../services/liveActivity/navigationLiveActivityService';

const LIVE_ACTIVITY_DISTANCE_SYNC_MS = 5_000;

interface UseNavigationTrackingOptions {
  navigationActive: boolean;
  navigationStepIndex: number;
  navigationSteps: NavigationStep[];
  currentStep?: NavigationStep;
  location: Coordinates | null;
  hapticFeedback: boolean;
  advanceNavigationStep: () => void;
}

export function useNavigationTracking({
  navigationActive,
  navigationStepIndex,
  navigationSteps,
  currentStep,
  location,
  hapticFeedback,
  advanceNavigationStep,
}: UseNavigationTrackingOptions) {
  const lastAdvanceAtRef = useRef(0);
  const liveActivityStartedRef = useRef(false);
  const lastLiveActivitySyncAtRef = useRef(0);

  useEffect(() => {
    if (!navigationActive) {
      liveActivityStartedRef.current = false;
      void navigationLiveActivityService.end();
    }
  }, [navigationActive]);

  useEffect(() => {
    if (!navigationActive || !currentStep) return;

    const distanceMeters = location
      ? Math.round(haversineMeters(location, currentStep.to))
      : undefined;

    const syncLiveActivity = async () => {
      const payload = navigationLiveActivityService.buildPayload(
        currentStep,
        navigationStepIndex,
        navigationSteps.length,
        distanceMeters
      );

      if (!liveActivityStartedRef.current) {
        const started = await navigationLiveActivityService.start(payload);
        liveActivityStartedRef.current = started;
        return;
      }

      await navigationLiveActivityService.update(payload);
    };

    void syncLiveActivity();
  }, [
    navigationActive,
    navigationStepIndex,
    navigationSteps.length,
    currentStep?.id,
    currentStep,
    location?.latitude,
    location?.longitude,
  ]);

  useEffect(() => {
    if (!navigationActive || !location || !currentStep) return;
    if (currentStep.kind === 'arrive') return;
    if (!hasReachedNavigationStep(location, currentStep)) return;

    const now = Date.now();
    if (now - lastAdvanceAtRef.current < NAVIGATION_AUTO_ADVANCE_COOLDOWN_MS) return;

    lastAdvanceAtRef.current = now;
    if (hapticFeedback) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    advanceNavigationStep();
  }, [
    location,
    navigationActive,
    navigationStepIndex,
    currentStep,
    advanceNavigationStep,
    hapticFeedback,
  ]);

  useEffect(() => {
    if (!navigationActive || !currentStep || !location) return;
    if (!liveActivityStartedRef.current) return;

    const now = Date.now();
    if (now - lastLiveActivitySyncAtRef.current < LIVE_ACTIVITY_DISTANCE_SYNC_MS) return;

    lastLiveActivitySyncAtRef.current = now;
    const distanceMeters = Math.round(haversineMeters(location, currentStep.to));

    void navigationLiveActivityService.update(
      navigationLiveActivityService.buildPayload(
        currentStep,
        navigationStepIndex,
        navigationSteps.length,
        distanceMeters
      )
    );
  }, [
    location?.latitude,
    location?.longitude,
    navigationActive,
    navigationStepIndex,
    navigationSteps.length,
    currentStep,
  ]);
}
