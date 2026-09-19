import type { ChangeSet } from './change.ts';
import type { Finding } from './finding.ts';
import type { DependencyGraph } from './graph.ts';
import type { ChangeImpact } from './impact.ts';
import type { FindingVerification } from './verification.ts';

/** The deterministic output of the engine. Contains nothing produced by a model. */
export interface AnalysisResult {
  readonly graph: DependencyGraph;
  readonly changeSet: ChangeSet;
  readonly impacts: readonly ChangeImpact[];
  readonly findings: readonly Finding[];
}

export interface Explanation {
  readonly summary: string;
  readonly findings: readonly {
    readonly findingId: string;
    readonly explanation: string;
  }[];
  readonly model: string;
}

/**
 * - `NOT_REQUIRED`: the analysis produced no findings, so there is nothing to explain.
 * - `PENDING`: the explanation is being generated asynchronously.
 * - `READY`: `explanation` is present and passed validation.
 * - `FAILED`: `explanationError` says why. The deterministic findings are unaffected.
 */
export type ExplanationStatus = 'NOT_REQUIRED' | 'PENDING' | 'READY' | 'FAILED';

export interface TimeWindow {
  readonly start: string;
  readonly end: string;
}

export interface VerificationRecord {
  readonly verifiedAt: string;
  /**
   * `AUTOMATIC` when the verification ran by itself after a stack update, started by
   * EventBridge and Step Functions. Absent when someone chose Verify deployment.
   */
  readonly trigger?: 'AUTOMATIC';
  /** The stack update the verification measured, taken from CloudFormation stack events. */
  readonly deployment: {
    readonly startedAt: string;
    readonly completedAt: string;
    readonly status: string;
  };
  readonly baselineWindow: TimeWindow;
  readonly observedWindow: TimeWindow;
  readonly findings: readonly FindingVerification[];
}

export interface AnalysisRecord extends AnalysisResult {
  readonly analysisId: string;
  readonly createdAt: string;
  readonly stackName?: string;
  /** The CloudFormation change set the proposed template was read from, if any. */
  readonly changeSetName?: string;
  readonly explanationStatus: ExplanationStatus;
  readonly explanation?: Explanation;
  readonly explanationError?: string;
  readonly verification?: VerificationRecord;
}

/** The fields shown in the analysis list, without the graph and change details. */
export interface AnalysisSummary {
  readonly analysisId: string;
  readonly createdAt: string;
  readonly stackName?: string;
  readonly changeCount: number;
  readonly findingCount: number;
  readonly highestSeverity?: Finding['severity'];
  readonly verificationStatus?: FindingVerification['status'];
}
