import { describe, expect, it } from 'vitest';
import { analyzeTemplates } from '../../../engine/src/core/pipeline.ts';
import { BASELINE_TEMPLATE_PATH, editBaseline, loadTemplate, propertiesOf } from '../../helpers.ts';

const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);

function findingFor(edit: Parameters<typeof editBaseline>[0]) {
  return analyzeTemplates(baseline, editBaseline(edit)).findings.find((f) => f.ruleId === 'NET-SG-001');
}

describe('NET-SG-001', () => {
  it('stays silent when the rule is widened to a range that still covers the port', () => {
    const finding = findingFor((t) => {
      propertiesOf(t, 'DatabaseSecurityGroup')['SecurityGroupIngress'] = [
        { IpProtocol: 'tcp', FromPort: 5000, ToPort: 6000, SourceSecurityGroupId: { 'Fn::GetAtt': ['AppSecurityGroup', 'GroupId'] } },
      ];
    });
    expect(finding).toBeUndefined();
  });

  it('stays silent when only the rule description changes', () => {
    const finding = findingFor((t) => {
      const [rule] = propertiesOf(t, 'DatabaseSecurityGroup')['SecurityGroupIngress'] as Record<string, unknown>[];
      if (rule !== undefined) {
        rule['Description'] = 'Renamed';
      }
    });
    expect(finding).toBeUndefined();
  });

  it('reports removal of every ingress rule', () => {
    const finding = findingFor((t) => {
      propertiesOf(t, 'DatabaseSecurityGroup')['SecurityGroupIngress'] = [];
    });
    expect(finding?.severity).toBe('HIGH');
    expect(finding?.causalPath).toEqual(['DatabaseSecurityGroup', 'Database', 'TaskDefinition', 'Service']);
  });

  it('reports MEDIUM when access is removed but no consumer path exists in the template', () => {
    const finding = findingFor((t) => {
      propertiesOf(t, 'LoadBalancerSecurityGroup')['SecurityGroupIngress'] = [];
    });
    expect(finding?.severity).toBe('MEDIUM');
    expect(finding?.title).toBe('Ingress tcp/80 from 0.0.0.0/0 removed from LoadBalancerSecurityGroup');
    expect(finding?.affectedResources).toContain('LoadBalancer');
  });

  it('reports a deleted standalone ingress resource against the group it was attached to', () => {
    const current = editBaseline((t) => {
      propertiesOf(t, 'DatabaseSecurityGroup')['SecurityGroupIngress'] = [];
      t.Resources['DatabaseIngress'] = {
        Type: 'AWS::EC2::SecurityGroupIngress',
        Properties: {
          GroupId: { 'Fn::GetAtt': ['DatabaseSecurityGroup', 'GroupId'] },
          IpProtocol: 'tcp',
          FromPort: 5432,
          ToPort: 5432,
          SourceSecurityGroupId: { 'Fn::GetAtt': ['AppSecurityGroup', 'GroupId'] },
        },
      };
    });
    const proposed = editBaseline((t) => {
      propertiesOf(t, 'DatabaseSecurityGroup')['SecurityGroupIngress'] = [];
    });
    const finding = analyzeTemplates(current, proposed).findings.find((f) => f.ruleId === 'NET-SG-001');
    expect(finding?.changedResource).toBe('DatabaseIngress');
    expect(finding?.causalPath).toEqual([
      'DatabaseIngress',
      'DatabaseSecurityGroup',
      'Database',
      'TaskDefinition',
      'Service',
    ]);
  });

  it('cites the connection tracking documentation', () => {
    const finding = findingFor((t) => {
      propertiesOf(t, 'DatabaseSecurityGroup')['SecurityGroupIngress'] = [];
    });
    const documentation = finding?.evidence.filter((e) => e.source === 'AWS_DOCUMENTATION') ?? [];
    expect(documentation.map((e) => e.reference)).toEqual([
      'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-connection-tracking.html',
    ]);
  });
});
