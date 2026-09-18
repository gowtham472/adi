import type { CfnTemplate, ChangeImpact, Finding, ResourceChange } from '../../types/index.ts';
import type { GraphIndex } from '../graph/query.ts';

export interface RuleContext {
  readonly change: ResourceChange;
  /** Absent for CREATE, which has no existing dependents. */
  readonly impact: ChangeImpact | undefined;
  /** Union of the current and proposed graphs. */
  readonly graph: GraphIndex;
  readonly current: GraphIndex;
  readonly proposed: GraphIndex;
  readonly currentTemplate: CfnTemplate;
  readonly proposedTemplate: CfnTemplate;
}

/**
 * A deterministic check applied to one resource change. A rule either returns a finding
 * backed by evidence or returns nothing; it never returns a finding without evidence.
 */
export interface Rule {
  readonly id: string;
  evaluate(context: RuleContext): Finding | undefined;
}

export function findingId(ruleId: string, resourceId: string): string {
  return `${ruleId}:${resourceId}`;
}
