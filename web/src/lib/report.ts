import type { AnalysisRecord, Finding, VerificationSignal } from '@adi/engine/types';

const EVIDENCE_LABEL = {
  DIFF: 'Diff',
  GRAPH: 'Graph',
  TEMPLATE: 'Template',
  AWS_DOCUMENTATION: 'AWS docs',
} as const;

function signalLine(signal: VerificationSignal): string {
  return signal.kind === 'METRIC'
    ? `\`${signal.namespace} ${signal.metricName}\` ${signal.expectedDirection === 'INCREASE' ? 'rises' : 'falls'}: ${signal.description}`
    : `\`${signal.pattern}\` appears: ${signal.description}`;
}

function findingSection(finding: Finding, explanation: string | undefined): string[] {
  const lines = [
    `### ${finding.severity}: ${finding.title}`,
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
    '| Resource | Type | Action |',
    '|---|---|---|',
    ...record.changeSet.changes.map((c) => `| \`${c.resourceId}\` | ${c.resourceType} | ${c.action} |`),
    '',
  ];

  if (record.findings.length === 0) {
    lines.push('No rule matched these changes.', '');
  } else {
    lines.push(`**${String(record.findings.length)} finding${record.findings.length === 1 ? '' : 's'}**`, '');
    if (record.explanation !== undefined) {
      lines.push(record.explanation.summary, '');
    }
    for (const finding of record.findings) {
      const explanation = record.explanation?.findings.find((f) => f.findingId === finding.id)?.explanation;
      lines.push(...findingSection(finding, explanation));
    }
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
