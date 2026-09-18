import { describe, expect, it } from 'vitest';
import { analyzeTemplates } from '../../../engine/src/core/pipeline.ts';
import { BASELINE_TEMPLATE_PATH, editBaseline, loadTemplate } from '../../helpers.ts';

const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);

function findingFor(edit: Parameters<typeof editBaseline>[0]) {
  return analyzeTemplates(baseline, editBaseline(edit)).findings.find((f) => f.ruleId === 'DEP-ORPH-001');
}

describe('DEP-ORPH-001', () => {
  it('stays silent when a resource nothing depends on is deleted', () => {
    expect(
      findingFor((t) => {
        delete t.Resources['PublicSubnetBRouteTableAssociation'];
      }),
    ).toBeUndefined();
  });

  it('reports a template CloudFormation will reject when a reference remains', () => {
    const finding = findingFor((t) => {
      delete t.Resources['LogGroup'];
    });
    expect(finding?.title).toBe('LogGroup is deleted while still referenced');
    expect(finding?.evidence.map((e) => e.fact)).toContain(
      'TaskDefinition still references LogGroup in the proposed template, so CloudFormation rejects the template with an unresolved dependency',
    );
  });

  it('does not treat a DependsOn edge as a runtime failure signal', () => {
    const finding = findingFor((t) => {
      delete t.Resources['Listener'];
      const service = t.Resources['Service'];
      if (service !== undefined) {
        delete service['DependsOn'];
      }
    });
    const metrics = finding?.verificationSignals.map((s) => (s.kind === 'METRIC' ? s.metricName : ''));
    expect(metrics).toEqual(['RequestCount']);
  });
});
