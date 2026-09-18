import { describe, expect, it } from 'vitest';
import { buildFindingsPayload } from '../../engine/src/aws/bedrock/prompt.ts';
import { redactSecrets } from '../../engine/src/aws/bedrock/sanitize.ts';
import { ExplanationRejected, validateExplanation } from '../../engine/src/aws/bedrock/validate.ts';
import { dimensionValue } from '../../engine/src/aws/cloudwatch/dimensions.ts';
import { analyzeTemplates } from '../../engine/src/core/pipeline.ts';
import { BASELINE_TEMPLATE_PATH, loadTemplate } from '../helpers.ts';

describe('dimensionValue', () => {
  it('uses the final portion of load balancer and target group ARNs', () => {
    expect(
      dimensionValue('LoadBalancer', 'arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/adi-demo/50dc6c495c0c9188'),
    ).toBe('app/adi-demo/50dc6c495c0c9188');
    expect(
      dimensionValue('TargetGroup', 'arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/adi-tg/73e2d6bc24d8a067'),
    ).toBe('targetgroup/adi-tg/73e2d6bc24d8a067');
  });

  it('uses the service name from an ECS service ARN', () => {
    expect(dimensionValue('ServiceName', 'arn:aws:ecs:ap-south-1:123456789012:service/demo-cluster/demo-service')).toBe(
      'demo-service',
    );
  });

  it('passes other identifiers through unchanged', () => {
    expect(dimensionValue('DBInstanceIdentifier', 'adi-demo-database-abc123')).toBe('adi-demo-database-abc123');
  });
});

describe('redactSecrets', () => {
  it('removes access keys, credentials in URLs and assigned secrets', () => {
    expect(redactSecrets('key AKIAABCDEFGHIJKLMNOP here')).toBe('key [REDACTED ACCESS KEY ID] here');
    expect(redactSecrets('postgres://admin:hunter2@db:5432/app')).toBe('postgres://[REDACTED CREDENTIALS]@db:5432/app');
    expect(redactSecrets('password=hunter2;')).toBe('password=[REDACTED];');
  });

  it('leaves ordinary evidence untouched', () => {
    const fact = 'Ingress tcp/5432 from AppSecurityGroup on DatabaseSecurityGroup is allowed';
    expect(redactSecrets(fact)).toBe(fact);
  });
});

describe('Bedrock explanation', () => {
  const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);
  const { findings, graph } = analyzeTemplates(baseline, loadTemplate('scenarios/01-rds-security-group/after.yaml'));
  const resourceIds = graph.nodes.map((n) => n.id);
  const [finding] = findings;
  const answer = (explanation: string, summary = 'The ingress port moved from 5432 to 5433.') =>
    JSON.stringify({ summary, findings: [{ findingId: finding?.id, explanation }] });

  it('sends findings without documentation links', () => {
    const payload = buildFindingsPayload(findings);
    expect(payload).toContain('NET-SG-001:DatabaseSecurityGroup');
    expect(payload).not.toContain('https://');
  });

  it('accepts an explanation that stays within the evidence, even inside a code fence', () => {
    const text = '```json\n' + answer('DatabaseSecurityGroup no longer admits tcp/5432 from AppSecurityGroup, so TaskDefinition containers cannot reach Database.') + '\n```';
    expect(validateExplanation(text, findings, resourceIds).findings[0]?.findingId).toBe(finding?.id);
  });

  it('rejects an explanation that names a resource outside the finding', () => {
    expect(() =>
      validateExplanation(answer('This also breaks LoadBalancerSecurityGroup.'), findings, resourceIds),
    ).toThrow(/names LoadBalancerSecurityGroup/);
  });

  it('rejects a response that omits a finding', () => {
    expect(() =>
      validateExplanation(JSON.stringify({ summary: 'x', findings: [] }), findings, resourceIds),
    ).toThrow(ExplanationRejected);
  });

  it('rejects text that is not JSON', () => {
    expect(() => validateExplanation('I cannot help with that.', findings, resourceIds)).toThrow(
      'The response did not contain a JSON object',
    );
  });
});
