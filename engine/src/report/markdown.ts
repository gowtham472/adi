import type {
  AnalysisRecord,
  AnalysisResult,
  Explanation,
  Finding,
  ResourceChange,
  Severity,
  VerificationSignal,
} from '../types/index.ts';

const EVIDENCE_LABEL = {
  DIFF: 'Diff',
  GRAPH: 'Graph',
  TEMPLATE: 'Template',
  AWS_DOCUMENTATION: 'AWS docs',
} as const;

const SEVERITY_ORDER: readonly Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function signalLine(signal: VerificationSignal): string {
  return signal.kind === 'METRIC'
    ? `\`${signal.namespace} ${signal.metricName}\` ${signal.expectedDirection === 'INCREASE' ? 'rises' : 'falls'}: ${signal.description}`
    : `\`${signal.pattern}\` appears: ${signal.description}`;
}

function changesTable(changes: readonly ResourceChange[]): string[] {
  return [
    '| Resource | Type | Action |',
    '|---|---|---|',
    ...changes.map((c) => `| \`${c.resourceId}\` | ${c.resourceType} | ${c.action} |`),
    '',
  ];
}

function findingSection(finding: Finding, explanation: string | undefined, heading: string): string[] {
  const lines = [
    `${heading} ${finding.severity}: ${finding.title}`,
    '',
    `Rule \`${finding.ruleId}\`, category ${finding.category.toLowerCase()}.`,
    '',
    `Causal path: ${finding.causalPath.map((id) => `\`${id}\``).join(' → ')}`,
    '',
  ];
  if (explanation !== undefined) {
    lines.push(`> ${explanation}`, '');
  }
  lines.push('**Evidence**', '');
  for (const evidence of finding.evidence) {
    const source = evidence.reference === undefined ? '' : ` ([source](${evidence.reference}))`;
    lines.push(`- ${EVIDENCE_LABEL[evidence.source]}: ${evidence.fact}${source}`);
  }
  lines.push('', '**Expected after deployment**', '');
  for (const signal of finding.verificationSignals) {
    lines.push(`- ${signalLine(signal)}`);
  }
  lines.push('', `**Recommendation:** ${finding.recommendation}`, '');
  return lines;
}

function findingSections(findings: readonly Finding[], explanation: Explanation | undefined, heading: string): string[] {
  return findings.flatMap((finding) =>
    findingSection(finding, explanation?.findings.find((f) => f.findingId === finding.id)?.explanation, heading),
  );
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** The most severe finding's severity, or undefined when there are none. */
export function highestSeverity(findings: readonly Finding[]): Severity | undefined {
  return SEVERITY_ORDER.find((severity) => findings.some((f) => f.severity === severity));
}

/**
 * Renders an analysis as Markdown for a pull request or a ticket. Only what the analysis
 * contains is written: explanations appear when they exist, verification when it ran.
 */
export function analysisReport(record: AnalysisRecord): string {
  const lines = [
    '## ADI change analysis',
    '',
    record.stackName === undefined
      ? `Template comparison, analyzed ${record.createdAt}.`
      : `Against stack \`${record.stackName}\`, analyzed ${record.createdAt}.`,
    '',
    ...changesTable(record.changeSet.changes),
  ];

  if (record.findings.length === 0) {
    lines.push('No rule matched these changes.', '');
  } else {
    lines.push(`**${plural(record.findings.length, 'finding')}**`, '');
    if (record.explanation !== undefined) {
      lines.push(record.explanation.summary, '');
    }
    lines.push(...findingSections(record.findings, record.explanation, '###'));
  }

  if (record.verification !== undefined) {
    lines.push('### Verification', '');
    lines.push(
      `Stack update ${record.verification.deployment.status}, completed ${record.verification.deployment.completedAt}.`,
      '',
    );
    for (const result of record.verification.findings) {
      lines.push(`- \`${result.findingId}\`: ${result.status}`);
    }
    lines.push('');
  }

  if (record.explanation !== undefined) {
    lines.push(`_Explanations written by ${record.explanation.model} on Amazon Bedrock from the evidence above. Findings come from deterministic rules._`);
  }
  return lines.join('\n').trimEnd() + '\n';
}

/**
 * One CloudFormation template changed in a pull request: what ADI found in it, or why it
 * could not be analyzed.
 */
export type TemplateReview =
  | {
      readonly path: string;
      readonly result: AnalysisResult;
      /** The analysis in the dashboard, when it was stored there. */
      readonly link?: string;
    }
  | { readonly path: string; readonly error: string };

/** Marks the comment ADI owns on a pull request, so a new push updates it in place. */
export const PULL_REQUEST_MARKER = '<!-- adi-pull-request-review -->';

/**
 * Renders the pull request comment: a summary table across every changed template, then
 * each template's changes and findings. Templates without changes to resources are left
 * out of the detail, since there is nothing to review in them.
 */
export function pullRequestReport(reviews: readonly TemplateReview[]): string {
  const analyzed = reviews.flatMap((r) => ('error' in r ? [] : [r.result]));
  const findingCount = analyzed.reduce((sum, result) => sum + result.findings.length, 0);
  const worst = highestSeverity(analyzed.flatMap((result) => result.findings));
  const lines = [
    PULL_REQUEST_MARKER,
    '## ADI change analysis',
    '',
    worst === undefined
      ? `Analyzed ${plural(reviews.length, 'CloudFormation template')} changed in this pull request. No rule matched the changes.`
      : `Analyzed ${plural(reviews.length, 'CloudFormation template')} changed in this pull request: ${plural(findingCount, 'finding')}, highest severity **${worst}**.`,
    '',
    '| Template | Changes | Findings | Highest severity |',
    '|---|---|---|---|',
    ...reviews.map((r) =>
      'error' in r
        ? `| \`${r.path}\` | Not analyzed | Not analyzed | Invalid template |`
        : `| \`${r.path}\` | ${String(r.result.changeSet.changes.length)} | ${String(r.result.findings.length)} | ${highestSeverity(r.result.findings) ?? 'None'} |`,
    ),
    '',
  ];

  for (const review of reviews) {
    if ('error' in review) {
      lines.push(`### \`${review.path}\``, '', `The template could not be parsed: ${review.error}`, '');
      continue;
    }
    if (review.result.changeSet.changes.length === 0) {
      continue;
    }
    lines.push(`### \`${review.path}\``, '');
    if (review.link !== undefined) {
      lines.push(`[Open the impact graph in ADI](${review.link})`, '');
    }
    lines.push(...changesTable(review.result.changeSet.changes));
    lines.push(...findingSections(review.result.findings, undefined, '####'));
  }

  lines.push('_Findings come from deterministic rules over the template diff and its dependency graph. Each cites the evidence it rests on._');
  return lines.join('\n').trimEnd() + '\n';
}
