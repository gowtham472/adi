export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type FindingCategory = 'NETWORK' | 'IAM' | 'AVAILABILITY' | 'CAPACITY' | 'DEPENDENCY';

/** Where a fact was established. Every piece of evidence names exactly one source. */
export type EvidenceSource = 'TEMPLATE' | 'DIFF' | 'GRAPH' | 'CHANGE_SET' | 'AWS_DOCUMENTATION';

export interface Evidence {
  readonly source: EvidenceSource;
  readonly fact: string;
  readonly resourceId?: string;
  readonly propertyPath?: string;
  /** Documentation URL. Required when `source` is `AWS_DOCUMENTATION`. */
  readonly reference?: string;
}

export type ExpectedDirection = 'INCREASE' | 'DECREASE';

/**
 * A CloudWatch metric that should move if the finding is correct. Dimensions are expressed
 * against logical IDs and resolved to physical identifiers at verification time.
 */
export interface MetricSignal {
  readonly kind: 'METRIC';
  readonly namespace: string;
  readonly metricName: string;
  readonly statistic: 'Average' | 'Sum' | 'Maximum' | 'Minimum';
  readonly dimensions: readonly SignalDimension[];
  readonly expectedDirection: ExpectedDirection;
  readonly description: string;
}

/** A log pattern that should appear if the finding is correct. */
export interface LogSignal {
  readonly kind: 'LOG_PATTERN';
  readonly pattern: string;
  readonly resourceId: string;
  readonly description: string;
}

export type VerificationSignal = MetricSignal | LogSignal;

export interface SignalDimension {
  readonly name: string;
  /** Logical ID whose physical identifier supplies the dimension value. */
  readonly resourceId: string;
}

export interface Finding {
  /** Stable within an analysis: `${ruleId}:${changedResource}`. */
  readonly id: string;
  readonly ruleId: string;
  readonly title: string;
  readonly severity: Severity;
  readonly category: FindingCategory;
  readonly changedResource: string;
  readonly affectedResources: readonly string[];
  /** Ordered chain of logical IDs describing how the change reaches the failure point. */
  readonly causalPath: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly verificationSignals: readonly VerificationSignal[];
  readonly recommendation: string;
}
