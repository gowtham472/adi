import { describe, expect, it } from 'vitest';
import { analyzeTemplates } from '../../../engine/src/core/pipeline.ts';
import type { CfnTemplate } from '../../../engine/src/types/index.ts';
import { BASELINE_TEMPLATE_PATH, editBaseline, loadTemplate, propertiesOf } from '../../helpers.ts';

const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);

function iamFinding(current: CfnTemplate, proposed: CfnTemplate) {
  return analyzeTemplates(current, proposed).findings.find((f) => f.ruleId === 'IAM-POL-001');
}

describe('IAM-POL-001', () => {
  it('stays silent when a wildcard statement still grants the removed action', () => {
    const proposed = editBaseline((t) => {
      propertiesOf(t, 'TaskExecutionRole')['Policies'] = [
        {
          PolicyName: 'broader',
          PolicyDocument: { Statement: [{ Effect: 'Allow', Action: 'secretsmanager:*', Resource: '*' }] },
        },
      ];
    });
    expect(iamFinding(baseline, proposed)).toBeUndefined();
  });

  it('reports a detached managed policy', () => {
    const proposed = editBaseline((t) => {
      propertiesOf(t, 'TaskExecutionRole')['ManagedPolicyArns'] = [];
    });
    const finding = iamFinding(baseline, proposed);
    expect(finding?.title).toBe('Managed policy detached from TaskExecutionRole');
    expect(finding?.evidence.some((e) => e.propertyPath === 'ManagedPolicyArns')).toBe(true);
  });

  it('declares a log signal for a task role and no health signal', () => {
    const withTaskRole = (policy: boolean) =>
      editBaseline((t) => {
        t.Resources['AppRole'] = {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {},
            Policies: policy
              ? [{ PolicyName: 'app', PolicyDocument: { Statement: [{ Effect: 'Allow', Action: 's3:GetObject', Resource: '*' }] } }]
              : [],
          },
        };
        propertiesOf(t, 'TaskDefinition')['TaskRoleArn'] = { 'Fn::GetAtt': ['AppRole', 'Arn'] };
      });
    const finding = iamFinding(withTaskRole(true), withTaskRole(false));
    expect(finding?.verificationSignals).toEqual([
      {
        kind: 'LOG_PATTERN',
        resourceId: 'LogGroup',
        pattern: 'AccessDenied',
        description: 'Application calls from TaskDefinition are denied',
      },
    ]);
    expect(finding?.evidence.some((e) => e.source === 'AWS_DOCUMENTATION')).toBe(false);
  });

  it('stays silent when the role is not assumed by anything in the template', () => {
    const withOrphanRole = (policy: boolean) =>
      editBaseline((t) => {
        t.Resources['UnusedRole'] = {
          Type: 'AWS::IAM::Role',
          Properties: {
            Policies: policy
              ? [{ PolicyName: 'p', PolicyDocument: { Statement: [{ Effect: 'Allow', Action: 'sqs:SendMessage', Resource: '*' }] } }]
              : [],
          },
        };
      });
    expect(iamFinding(withOrphanRole(true), withOrphanRole(false))).toBeUndefined();
  });
});
