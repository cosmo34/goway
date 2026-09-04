import type { Departure, Stop } from '../../stores/transitStore';
import { liveActivityService, type LiveActivityData } from './liveActivityService';

export interface StopLiveActivityPage {
  stop: Stop;
  lineName: string;
  lineColor: string;
  direction: string;
  departures: Departure[];
}

let active = false;

function minutesUntilDeparture(departure: Departure): number {
  const time = departure.realtimeTime ?? departure.scheduledTime;
  return Math.max(0, Math.round((time.getTime() - Date.now()) / 60_000));
}

export const stopLiveActivityService = {
  isActive(): boolean {
    return active;
  },

  buildPayload(page: StopLiveActivityPage): LiveActivityData {
    const next = page.departures[0];

    if (!next) {
      return {
        lineName: page.lineName || '?',
        lineColor: page.lineColor || '#5B8DEF',
        direction: page.direction,
        minutesUntil: 0,
        stopName: page.stop.name,
        isRealtime: false,
        isStopTracking: true,
      };
    }

    return {
      lineName: next.lineName,
      lineColor: next.lineColor,
      direction: next.direction,
      minutesUntil: minutesUntilDeparture(next),
      stopName: page.stop.name,
      isRealtime: next.isRealtime,
      isStopTracking: true,
    };
  },

  async start(page: StopLiveActivityPage): Promise<{ active: boolean; liveActivity: boolean }> {
    active = true;

    if (!liveActivityService.isSupported()) {
      return { active: true, liveActivity: false };
    }

    const liveActivity = await liveActivityService.start(this.buildPayload(page));
    return { active: true, liveActivity };
  },

  async update(page: StopLiveActivityPage): Promise<void> {
    if (!liveActivityService.isSupported() || !active) return;
    await liveActivityService.update(this.buildPayload(page));
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
