import type { Finding } from '../../types/index.ts';
import { redactDeep } from './sanitize.ts';

export const SYSTEM_PROMPT = `You explain the findings of a deterministic AWS infrastructure change analyzer to the developer who proposed the change.

Each finding was produced by a rule, not by you. It names the changed resource, the resources it can affect, a causal path through the stack's dependency graph, the evidence the rule relied on, and the CloudWatch signals expected to move if the finding is correct. Your job is to make each finding understandable: how the change travels along the causal path to a failure the developer would notice, and what the evidence establishes.

Ground every statement in the supplied findings. Use resource names exactly as given and do not mention resources, metrics, permissions, ports or values that do not appear in them. Where you draw a conclusion the evidence does not state directly, say that it is an inference. Do not restate the recommendation; it is shown separately. If findings are related, the summary may say how.

Write plainly for an engineer: two to four sentences per finding, and a summary of at most three sentences covering the change as a whole.

Respond with a single JSON object and nothing else, in this shape:
{"summary": string, "findings": [{"findingId": string, "explanation": string}]}
Include every finding exactly once, using its id.`;

/** The finding fields the model needs, with documentation links and internal paths left out. */
export function buildFindingsPayload(findings: readonly Finding[]): string {
  const payload = findings.map((finding) => ({
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    category: finding.category,
    changedResource: finding.changedResource,
    affectedResources: finding.affectedResources,
    causalPath: finding.causalPath,
    evidence: finding.evidence.map((e) => ({ source: e.source, fact: e.fact })),
    expectedSignals: finding.verificationSignals.map((s) => s.description),
    recommendation: finding.recommendation,
  }));
  return JSON.stringify({ findings: redactDeep(payload) }, null, 2);
}
