import {
  paginateGetMetricData,
  type CloudWatchClient,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import { classifyMovement, unsupportedSignal } from '../../core/verification/assess.ts';
import type { MetricSignal, SignalObservation, TimeWindow, VerificationSignal } from '../../types/index.ts';
import { dimensionValue } from './dimensions.ts';

const PERIOD_SECONDS = 60;

interface ResolvedSignal {
  readonly signal: MetricSignal;
  readonly queryId: string;
  readonly query: MetricDataQuery[];
}

/**
 * Builds the queries for one metric signal. Load balancer counts are only published when
 * they are non zero, so for `Sum` metrics a missing datapoint means zero; `FILL` makes that
 * explicit instead of leaving the minute out of the average.
 */
function resolve(signal: MetricSignal, index: number, physicalIds: ReadonlyMap<string, string>): ResolvedSignal | SignalObservation {
  const dimensions = [];
  for (const dimension of signal.dimensions) {
    const physicalId = physicalIds.get(dimension.resourceId);
    if (physicalId === undefined) {
      return unsupportedSignal(signal, `${dimension.resourceId} is not a resource in the deployed stack`);
    }
    dimensions.push({ Name: dimension.name, Value: dimensionValue(dimension.name, physicalId) });
  }
  const metricId = `m${String(index)}`;
  const metric: MetricDataQuery = {
    Id: metricId,
    MetricStat: {
      Metric: { Namespace: signal.namespace, MetricName: signal.metricName, Dimensions: dimensions },
      Period: PERIOD_SECONDS,
      Stat: signal.statistic,
    },
    ReturnData: signal.statistic !== 'Sum',
  };
  if (signal.statistic !== 'Sum') {
    return { signal, queryId: metricId, query: [metric] };
  }
  const filledId = `f${String(index)}`;
  return {
    signal,
    queryId: filledId,
    query: [metric, { Id: filledId, Expression: `FILL(${metricId}, 0)`, ReturnData: true }],
  };
}

function isResolved(value: ResolvedSignal | SignalObservation): value is ResolvedSignal {
  return 'queryId' in value;
}

function within(timestamp: Date, window: TimeWindow): boolean {
  const time = timestamp.getTime();
  return time >= Date.parse(window.start) && time < Date.parse(window.end);
}

/**
 * Collects every metric signal of a finding over both windows in a single GetMetricData
 * request and classifies how each one moved. Log pattern signals are reported as not
 * collected rather than being silently dropped.
 */
export async function observeSignals(
  client: CloudWatchClient,
  signals: readonly VerificationSignal[],
  physicalIds: ReadonlyMap<string, string>,
  windows: { baseline: TimeWindow; observed: TimeWindow },
): Promise<SignalObservation[]> {
  const resolved = signals.map((signal, index) =>
    signal.kind === 'METRIC'
      ? resolve(signal, index, physicalIds)
      : unsupportedSignal(signal, 'Log pattern signals are not collected in this version'),
  );
  const queries = resolved.filter(isResolved);

  const samples = new Map<string, { baseline: number[]; observed: number[] }>(
    queries.map((q) => [q.queryId, { baseline: [], observed: [] }]),
  );
  if (queries.length > 0) {
    const pages = paginateGetMetricData(
      { client },
      {
        MetricDataQueries: queries.flatMap((q) => q.query),
        StartTime: new Date(windows.baseline.start),
        EndTime: new Date(windows.observed.end),
        ScanBy: 'TimestampAscending',
      },
    );
    for await (const page of pages) {
      for (const result of page.MetricDataResults ?? []) {
        const bucket = result.Id === undefined ? undefined : samples.get(result.Id);
        if (bucket === undefined) {
          continue;
        }
        (result.Timestamps ?? []).forEach((timestamp, i) => {
          const value = result.Values?.[i];
          if (value === undefined) {
            return;
          }
          if (within(timestamp, windows.baseline)) {
            bucket.baseline.push(value);
          } else if (within(timestamp, windows.observed)) {
            bucket.observed.push(value);
          }
        });
      }
    }
  }

  return resolved.map((item) =>
    isResolved(item)
      ? classifyMovement(item.signal, samples.get(item.queryId) ?? { baseline: [], observed: [] })
      : item,
  );
}
