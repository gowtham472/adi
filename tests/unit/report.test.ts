import { describe, expect, it } from 'vitest';
import { analyzeTemplates } from '../../engine/src/core/pipeline.ts';
import type { AnalysisRecord } from '../../engine/src/types/index.ts';
import { analysisReport } from '../../web/src/lib/report.ts';
import { BASELINE_TEMPLATE_PATH, loadTemplate } from '../helpers.ts';

function record(scenario: string, extra: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    ...analyzeTemplates(loadTemplate(BASELINE_TEMPLATE_PATH), loadTemplate(`scenarios/${scenario}/after.yaml`)),
    analysisId: 'a1',
    createdAt: '2026-09-19T10:00:00.000Z',
    explanationStatus: 'FAILED',
    ...extra,
  };
}

describe('analysisReport', () => {
  it('lists the changes, the finding, its evidence with sources and the recommendation', () => {
    const report = analysisReport(record('01-rds-security-group'));
    expect(report).toContain('| `DatabaseSecurityGroup` | AWS::EC2::SecurityGroup | UPDATE |');
    expect(report).toContain('### HIGH: Service loses network access to Database');
    expect(report).toContain('Causal path: `DatabaseSecurityGroup` → `Database` → `TaskDefinition` → `Service`');
    expect(report).toContain('[source](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-connection-tracking.html)');
    expect(report).toContain('**Recommendation:** Restore ingress tcp/5432');
  });

  it('includes an explanation and its attribution only when one exists', () => {
    const without = analysisReport(record('01-rds-security-group'));
    expect(without).not.toContain('Amazon Bedrock');

    const base = record('01-rds-security-group');
    const findingId = base.findings[0]?.id ?? '';
    const withExplanation = analysisReport({
      ...base,
      explanationStatus: 'READY',
      explanation: { summary: 'The port moved.', findings: [{ findingId, explanation: 'Connections fail.' }], model: 'anthropic.claude-opus-5' },
    });
    expect(withExplanation).toContain('> Connections fail.');
    expect(withExplanation).toContain('_Explanations written by anthropic.claude-opus-5 on Amazon Bedrock');
  });

  it('says so when no rule matched', () => {
    const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);
    const empty: AnalysisRecord = {
      ...analyzeTemplates(baseline, baseline),
      analysisId: 'a2',
      createdAt: '2026-09-19T10:00:00.000Z',
      explanationStatus: 'NOT_REQUIRED',
    };
    expect(analysisReport(empty)).toContain('No rule matched these changes.');
  });
});
