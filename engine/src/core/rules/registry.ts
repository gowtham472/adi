import type { Finding, Severity } from '../../types/index.ts';
import { iamPol001 } from './iam-pol-001.ts';
import { netSg001 } from './net-sg-001.ts';
import type { Rule, RuleContext } from './rule.ts';

export const RULES: readonly Rule[] = [netSg001, iamPol001];

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function compareFindings(a: Finding, b: Finding): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id);
}

export function evaluateRules(contexts: readonly RuleContext[], rules: readonly Rule[] = RULES): Finding[] {
  return contexts
    .flatMap((context) => rules.map((rule) => rule.evaluate(context)))
    .filter((finding): finding is Finding => finding !== undefined)
    .sort(compareFindings);
}
