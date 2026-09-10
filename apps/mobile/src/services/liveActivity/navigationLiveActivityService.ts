import type { NavigationStep } from '../routing/navigationSteps';
import { liveActivityService, type LiveActivityData } from './liveActivityService';
import { stopLiveActivityService } from './stopLiveActivityService';
import i18n from '../../i18n';

function stepLineName(step: NavigationStep): string {
  if (step.kind === 'transit') return step.lineName ?? i18n.t('common.line');
  if (step.kind === 'walk') return i18n.t('common.walk');
  return i18n.t('common.arrival');
}

function stepLineColor(step: NavigationStep): string {
  if (step.kind === 'transit') return step.lineColor ?? '#5B8DEF';
  if (step.kind === 'walk') return '#5B8DEF';
  return '#34D399';
}

let active = false;

export const navigationLiveActivityService = {
  isActive(): boolean {
    return active;
  },

  buildPayload(
    step: NavigationStep,
    stepIndex: number,
    totalSteps: number,
    distanceMeters?: number
  ): LiveActivityData {
    return {
      lineName: stepLineName(step),
      lineColor: stepLineColor(step),
      direction: step.subtitle,
      minutesUntil: 0,
      stopName: step.title,
      isRealtime: true,
      isNavigation: true,
      stepIndex: stepIndex + 1,
      totalSteps,
      distanceMeters: distanceMeters ?? 0,
    };
  },

  async start(data: LiveActivityData): Promise<boolean> {
    if (!liveActivityService.isSupported()) return false;

    if (stopLiveActivityService.isActive()) {
      await stopLiveActivityService.end();
    }

    active = true;
    return liveActivityService.start(data);
  },

  async update(data: LiveActivityData): Promise<void> {
    if (!liveActivityService.isSupported() || !active) return;
    await liveActivityService.update(data);
  },

  async end(): Promise<void> {
    if (!liveActivityService.isSupported()) {
      active = false;
      return;
    }
    await liveActivityService.end();
    active = false;
  },
};
