import { describe, expect, it } from 'vitest';
import { analyzeTemplates } from '../../../engine/src/core/pipeline.ts';
import { BASELINE_TEMPLATE_PATH, editBaseline, loadTemplate, propertiesOf } from '../../helpers.ts';

const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);

function findingFor(edit: Parameters<typeof editBaseline>[0]) {
  return analyzeTemplates(baseline, editBaseline(edit)).findings.find((f) => f.ruleId === 'ALB-HC-001');
}

describe('ALB-HC-001', () => {
  it('escalates to HIGH when the targets security group blocks the new health check port', () => {
    const finding = findingFor((t) => {
      propertiesOf(t, 'TargetGroup')['HealthCheckPort'] = '8081';
    });
    expect(finding?.severity).toBe('HIGH');
    expect(finding?.title).toBe('Health check probes for TargetGroup are blocked on tcp/8081');
    expect(finding?.evidence.map((e) => e.fact)).toContain(
      'No ingress rule on AppSecurityGroup admits tcp/8081 from LoadBalancerSecurityGroup, so health check probes on the new port are dropped',
    );
  });

  it('stays MEDIUM when the same change also opens the port', () => {
    const finding = findingFor((t) => {
      propertiesOf(t, 'TargetGroup')['HealthCheckPort'] = '8081';
      (propertiesOf(t, 'AppSecurityGroup')['SecurityGroupIngress'] as unknown[]).push({
        IpProtocol: 'tcp',
        FromPort: 8081,
        ToPort: 8081,
        SourceSecurityGroupId: { 'Fn::GetAtt': ['LoadBalancerSecurityGroup', 'GroupId'] },
      });
    });
    expect(finding?.severity).toBe('MEDIUM');
  });

  it('ignores target group changes that do not affect health checks', () => {
    const finding = findingFor((t) => {
      propertiesOf(t, 'TargetGroup')['TargetGroupAttributes'] = [];
    });
    expect(finding).toBeUndefined();
  });

  it('names the documented default matcher when none is set', () => {
    const finding = findingFor((t) => {
      propertiesOf(t, 'TargetGroup')['HealthCheckPath'] = '/ready';
    });
    expect(finding?.recommendation).toContain('HTTP 200 (the default Matcher)');
  });
});
