import type { Explanation, Finding } from '../../types/index.ts';

export class ExplanationRejected extends Error {
  override readonly name = 'ExplanationRejected';
}

const MAX_SUMMARY_LENGTH = 1500;
const MAX_EXPLANATION_LENGTH = 2000;

/** Accepts a bare JSON object, optionally wrapped in a Markdown code fence. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new ExplanationRejected('The response did not contain a JSON object');
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ExplanationRejected('The response was not valid JSON');
  }
}

/**
 * Logical IDs that are single capitalized words, such as `Service` or `Database`, are
 * indistinguishable from ordinary English at the start of a sentence. Only IDs with an
 * internal capital or a digit, such as `DatabaseSecurityGroup`, are checked for mentions.
 */
function isDistinctive(resourceId: string): boolean {
  return /[a-z][A-Z]|\d/.test(resourceId);
}

function mentions(text: string, resourceIds: readonly string[]): string[] {
  return resourceIds.filter((id) => new RegExp(`\\b${id}\\b`).test(text));
}

function allowedResources(finding: Finding, candidates: readonly string[]): Set<string> {
  const allowed = new Set([
    finding.changedResource,
    ...finding.affectedResources,
    ...finding.causalPath,
    ...finding.evidence.flatMap((e) => (e.resourceId === undefined ? [] : [e.resourceId])),
  ]);
  for (const evidence of finding.evidence) {
    for (const id of mentions(evidence.fact, candidates)) {
      allowed.add(id);
    }
  }
  return allowed;
}

/**
 * Parses and checks a model response against the findings it was asked to explain. The
 * response is rejected, not repaired, if it skips or invents a finding or names a resource
 * that the finding's evidence does not mention.
 */
export function validateExplanation(
  text: string,
  findings: readonly Finding[],
  resourceIds: readonly string[],
): Omit<Explanation, 'model'> {
  const parsed = extractJson(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ExplanationRejected('The response JSON was not an object');
  }
  const record = parsed as Record<string, unknown>;
  const summary = record['summary'];
  if (typeof summary !== 'string' || summary.trim() === '' || summary.length > MAX_SUMMARY_LENGTH) {
    throw new ExplanationRejected('The summary was missing, empty or too long');
  }
  if (!Array.isArray(record['findings'])) {
    throw new ExplanationRejected('The findings list was missing');
  }

  const checked = resourceIds.filter(isDistinctive);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const explained = new Map<string, string>();

  for (const raw of record['findings'] as unknown[]) {
    const item = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    const findingId = item['findingId'];
    const explanation = item['explanation'];
    if (typeof findingId !== 'string' || typeof explanation !== 'string') {
      throw new ExplanationRejected('A finding explanation was malformed');
    }
    const finding = byId.get(findingId);
    if (finding === undefined) {
      throw new ExplanationRejected(`The response explained an unknown finding ${findingId}`);
    }
    if (explained.has(findingId)) {
      throw new ExplanationRejected(`The response explained ${findingId} more than once`);
    }
    if (explanation.trim() === '' || explanation.length > MAX_EXPLANATION_LENGTH) {
      throw new ExplanationRejected(`The explanation for ${findingId} was empty or too long`);
    }
    const allowed = allowedResources(finding, checked);
    const foreign = mentions(explanation, checked).filter((id) => !allowed.has(id));
    if (foreign.length > 0) {
      throw new ExplanationRejected(
        `The explanation for ${findingId} names ${foreign.join(', ')}, which its evidence does not mention`,
      );
    }
    explained.set(findingId, explanation.trim());
  }

  const missing = findings.filter((f) => !explained.has(f.id)).map((f) => f.id);
  if (missing.length > 0) {
    throw new ExplanationRejected(`The response did not explain ${missing.join(', ')}`);
  }

  const allAllowed = new Set(findings.flatMap((f) => [...allowedResources(f, checked)]));
  const foreignInSummary = mentions(summary, checked).filter((id) => !allAllowed.has(id));
  if (foreignInSummary.length > 0) {
    throw new ExplanationRejected(`The summary names ${foreignInSummary.join(', ')}, which no finding mentions`);
  }

  return {
    summary: summary.trim(),
    findings: findings.map((f) => ({ findingId: f.id, explanation: explained.get(f.id) as string })),
  };
}
