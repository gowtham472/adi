import type {
  Finding,
  FindingVerification,
  MetricSignal,
  ObservedMovement,
  SignalObservation,
  VerificationSignal,
  VerificationStatus,
} from '../../types/index.ts';

/**
 * A change counts as movement only when it exceeds both a relative and an absolute floor.
 * The relative floor ignores ordinary noise on busy metrics; the absolute floor stops a
 * change from 0.1 to 0.3 on a quiet metric from being reported as a 200% rise.
 */
const RELATIVE_THRESHOLD = 0.25;
const ABSOLUTE_THRESHOLD: Readonly<Record<MetricSignal['statistic'], number>> = {
  Sum: 1,
  Maximum: 1,
  Minimum: 1,
  Average: 0.5,
};

function mean(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface MetricSamples {
  readonly baseline: readonly number[];
  readonly observed: readonly number[];
}

export function classifyMovement(signal: MetricSignal, samples: MetricSamples): SignalObservation {
  const baseline = mean(samples.baseline);
  const observed = mean(samples.observed);
  if (baseline === undefined || observed === undefined) {
    return {
      signal,
      movement: 'NO_DATA',
      ...(baseline === undefined ? {} : { baseline }),
      ...(observed === undefined ? {} : { observed }),
      note:
        baseline === undefined
          ? 'No datapoints before the deployment to compare against'
          : 'No datapoints after the deployment yet',
    };
  }
  const delta = observed - baseline;
  const floor = Math.max(ABSOLUTE_THRESHOLD[signal.statistic], RELATIVE_THRESHOLD * Math.max(Math.abs(baseline), Math.abs(observed)));
  const movement: ObservedMovement = Math.abs(delta) < floor ? 'UNCHANGED' : delta > 0 ? 'INCREASED' : 'DECREASED';
  return { signal, movement, baseline, observed };
}

function matchesExpectation(observation: SignalObservation): boolean | undefined {
  if (observation.signal.kind !== 'METRIC' || observation.movement === 'NO_DATA') {
    return undefined;
  }
  if (observation.movement === 'UNCHANGED') {
    return false;
  }
  const expected = observation.signal.expectedDirection === 'INCREASE' ? 'INCREASED' : 'DECREASED';
  return observation.movement === expected;
}

/**
 * - `CONTRADICTED` when any signal moved against the prediction.
 * - `MATCHED` only when every signal with data moved as predicted, and at least one did.
 * - `UNCONFIRMED` otherwise: missing data or flat signals are never read as confirmation.
 */
export function assessFinding(findingId: string, observations: readonly SignalObservation[]): FindingVerification {
  const moved = observations.filter(
    (o) => o.movement === 'INCREASED' || o.movement === 'DECREASED',
  );
  const contradicted = moved.some((o) => matchesExpectation(o) === false);
  const judged = observations.map(matchesExpectation).filter((m): m is boolean => m !== undefined);

  let status: VerificationStatus;
  if (contradicted) {
    status = 'CONTRADICTED';
  } else if (judged.length > 0 && judged.every(Boolean)) {
    status = 'MATCHED';
  } else {
    status = 'UNCONFIRMED';
  }
  return { findingId, status, observations };
}

export function unsupportedSignal(signal: VerificationSignal, note: string): SignalObservation {
  return { signal, movement: 'NO_DATA', note };
}

/** Collapses per finding results into one status for an analysis, worst first. */
export function overallStatus(results: readonly FindingVerification[]): VerificationStatus | undefined {
  if (results.length === 0) {
    return undefined;
  }
  if (results.some((r) => r.status === 'CONTRADICTED')) {
    return 'CONTRADICTED';
  }
  return results.every((r) => r.status === 'MATCHED') ? 'MATCHED' : 'UNCONFIRMED';
}

export function metricSignals(finding: Finding): MetricSignal[] {
  return finding.verificationSignals.filter((s): s is MetricSignal => s.kind === 'METRIC');
}
