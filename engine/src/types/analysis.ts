import type { ChangeSet } from './change.ts';
import type { Finding } from './finding.ts';
import type { DependencyGraph } from './graph.ts';
import type { ChangeImpact } from './impact.ts';

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
    readonly recommendation: string;
  }[];
}

/**
 * The explanation is optional by design. If Bedrock is unavailable or its response fails
 * validation, `explanation` is absent and `explanationError` says why.
 */
export interface AnalysisRecord extends AnalysisResult {
  readonly analysisId: string;
  readonly createdAt: string;
  readonly stackName?: string;
  readonly explanation?: Explanation;
  readonly explanationError?: string;
}
