import type { VerificationSignal } from './finding.ts';

/**
 * - `MATCHED`: every collected signal moved in the expected direction.
 * - `CONTRADICTED`: at least one collected signal moved against the expected direction.
 * - `UNCONFIRMED`: signals were missing, flat, or could not be collected.
 */
export type VerificationStatus = 'MATCHED' | 'UNCONFIRMED' | 'CONTRADICTED';

export type ObservedMovement = 'INCREASED' | 'DECREASED' | 'UNCHANGED' | 'NO_DATA';

export interface SignalObservation {
  readonly signal: VerificationSignal;
  readonly movement: ObservedMovement;
  readonly baseline?: number;
  readonly observed?: number;
  /** Why the signal could not be evaluated, when `movement` is `NO_DATA`. */
  readonly note?: string;
}

export interface FindingVerification {
  readonly findingId: string;
  readonly status: VerificationStatus;
  readonly observations: readonly SignalObservation[];
}
