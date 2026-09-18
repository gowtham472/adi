import { paginateFilterLogEvents, type CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import type { MetricSamples } from '../../core/verification/assess.ts';
import type { TimeWindow } from '../../types/index.ts';

const MINUTE_MS = 60_000;

/**
 * Pages read per signal. Each page holds up to 10,000 events, so the cap only bites when a
 * failure is already obvious, and it keeps a verification request inside the API timeout.
 */
const MAX_PAGES = 5;

function minutesIn(window: TimeWindow): number {
  return Math.max(1, Math.ceil((Date.parse(window.end) - Date.parse(window.start)) / MINUTE_MS));
}

/**
 * Turns matching event times into per minute counts for each window, so a log pattern is
 * compared the way a `Sum` metric is. Minutes without a match count as zero.
 */
export function countPerMinute(timestamps: readonly number[], windows: { baseline: TimeWindow; observed: TimeWindow }): MetricSamples {
  const bucket = (window: TimeWindow): number[] => {
    const start = Date.parse(window.start);
    const counts = new Array<number>(minutesIn(window)).fill(0);
    for (const time of timestamps) {
      const index = Math.floor((time - start) / MINUTE_MS);
      if (time < Date.parse(window.end) && index >= 0 && index < counts.length) {
        counts[index] = (counts[index] ?? 0) + 1;
      }
    }
    return counts;
  };
  return { baseline: bucket(windows.baseline), observed: bucket(windows.observed) };
}

/** Times of the events in a log group that match a filter pattern, across both windows. */
export async function matchingEventTimes(
  client: CloudWatchLogsClient,
  logGroupName: string,
  pattern: string,
  windows: { baseline: TimeWindow; observed: TimeWindow },
): Promise<number[]> {
  const times: number[] = [];
  let pages = 0;
  const paginator = paginateFilterLogEvents(
    { client },
    {
      logGroupName,
      filterPattern: pattern,
      startTime: Date.parse(windows.baseline.start),
      endTime: Date.parse(windows.observed.end),
    },
  );
  for await (const page of paginator) {
    for (const event of page.events ?? []) {
      if (event.timestamp !== undefined) {
        times.push(event.timestamp);
      }
    }
    pages += 1;
    if (pages >= MAX_PAGES) {
      break;
    }
  }
  return times;
}
