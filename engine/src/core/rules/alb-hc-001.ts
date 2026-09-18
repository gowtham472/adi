import type { Evidence, VerificationSignal } from '../../types/index.ts';
import { documentationEvidence, edgeEvidence, formatValue } from '../evidence/facts.ts';
import { unique } from '../graph/query.ts';
import { admitsPort, inlineRules } from './ingress.ts';
import { findingId, type Rule, type RuleContext } from './rule.ts';
import {
  dedupeSignals,
  healthyHosts,
  loadBalancerFor,
  RESOURCE_TYPES,
  unhealthyHosts,
} from './signals.ts';
import { asNumber } from './values.ts';

const RULE_ID = 'ALB-HC-001';

const HEALTH_CHECKS_URL =
  'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html';

const HEALTH_CHECK_PROPERTIES = [
  'HealthCheckEnabled',
  'HealthCheckIntervalSeconds',
  'HealthCheckPath',
  'HealthCheckPort',
  'HealthCheckProtocol',
  'HealthCheckTimeoutSeconds',
  'HealthyThresholdCount',
  'Matcher',
  'UnhealthyThresholdCount',
];

interface BlockedProbe {
  readonly port: number;
  readonly targetGroupSecurityGroups: readonly string[];
  readonly loadBalancerSecurityGroups: readonly string[];
}

/**
 * When the health check moves to an explicit port, the load balancer's probes must be
 * admitted by a security group attached to the targets. The check uses the proposed
 * template, so a rule added in the same change counts.
 */
function blockedProbe(context: RuleContext, services: readonly string[], loadBalancer: string | undefined): BlockedProbe | undefined {
  const port = asNumber(context.change.after?.['HealthCheckPort']);
  if (port === undefined || loadBalancer === undefined) {
    return undefined;
  }
  const loadBalancerGroups = context.proposed
    .dependencyEdges(loadBalancer, 'PROTECTED_BY')
    .map((edge) => edge.target);
  const targetGroups = unique(
    services.flatMap((service) => context.proposed.dependencyEdges(service, 'PROTECTED_BY').map((edge) => edge.target)),
  );
  if (loadBalancerGroups.length === 0 || targetGroups.length === 0) {
    return undefined;
  }
  const admitted = targetGroups.some((group) =>
    inlineRules(context.proposedTemplate.Resources[group]?.Properties).some(
      (rule) =>
        rule.sourceGroup !== undefined &&
        loadBalancerGroups.includes(rule.sourceGroup) &&
        admitsPort(rule, 'tcp', port),
    ),
  );
  return admitted
    ? undefined
    : { port, targetGroupSecurityGroups: targetGroups, loadBalancerSecurityGroups: loadBalancerGroups };
}

export const albHc001: Rule = {
  id: RULE_ID,
  evaluate(context) {
    const { change } = context;
    if (change.resourceType !== RESOURCE_TYPES.targetGroup || (change.action !== 'UPDATE' && change.action !== 'REPLACE')) {
      return undefined;
    }
    const changed = change.changedProperties.filter((name) => HEALTH_CHECK_PROPERTIES.includes(name));
    if (changed.length === 0) {
      return undefined;
    }

    const targetGroup = change.resourceId;
    const services = context.graph.dependentsOfType(targetGroup, RESOURCE_TYPES.service);
    const loadBalancer = loadBalancerFor(context.graph, targetGroup);

    const evidence: Evidence[] = changed.map((name) => ({
      source: 'DIFF',
      fact: `${name} changes from ${formatValue(change.before?.[name])} to ${formatValue(change.after?.[name])}`,
      resourceId: targetGroup,
      propertyPath: name,
    }));
    for (const service of services) {
      const edge = context.graph.dependencyEdges(service, 'ROUTES_TO').find((e) => e.target === targetGroup);
      if (edge !== undefined) {
        evidence.push(edgeEvidence(edge));
      }
    }

    const blocked = blockedProbe(context, services, loadBalancer);
    if (blocked !== undefined) {
      evidence.push({
        source: 'TEMPLATE',
        fact: `No ingress rule on ${blocked.targetGroupSecurityGroups.join(', ')} admits tcp/${String(blocked.port)} from ${blocked.loadBalancerSecurityGroups.join(', ')}, so health check probes on the new port are dropped`,
        resourceId: blocked.targetGroupSecurityGroups[0] as string,
        propertyPath: 'SecurityGroupIngress',
      });
    }

    evidence.push(
      documentationEvidence(
        'If every target in a target group is unhealthy, the load balancer fails open and routes requests to all of them regardless of health. Clients may keep receiving responses while every target is reported unhealthy.',
        HEALTH_CHECKS_URL,
      ),
    );

    // Target health is the reliable signal. Client facing errors are not, because the load
    // balancer fails open when no target is healthy.
    const signals: VerificationSignal[] =
      loadBalancer === undefined ? [] : [unhealthyHosts(loadBalancer, targetGroup), healthyHosts(loadBalancer, targetGroup)];
    const affected = unique([
      ...(context.impact?.affected.map((a) => a.resourceId) ?? []),
      ...(loadBalancer === undefined ? [] : [loadBalancer]),
    ]);

    const newPath = change.after?.['HealthCheckPath'];
    // The documented default Matcher for HTTP health checks is 200.
    const accepted = change.after?.['Matcher'] === undefined ? 'HTTP 200 (the default Matcher)' : 'a status code accepted by the target group Matcher';
    return {
      id: findingId(RULE_ID, targetGroup),
      ruleId: RULE_ID,
      title:
        blocked === undefined
          ? `Health check for ${targetGroup} changes: ${changed.join(', ')}`
          : `Health check probes for ${targetGroup} are blocked on tcp/${String(blocked.port)}`,
      severity: blocked === undefined ? 'MEDIUM' : 'HIGH',
      category: 'AVAILABILITY',
      changedResource: targetGroup,
      affectedResources: affected,
      causalPath: services.length > 0 ? [targetGroup, services[0] as string] : [targetGroup],
      evidence,
      verificationSignals: dedupeSignals(signals),
      recommendation:
        blocked !== undefined
          ? `Allow tcp/${String(blocked.port)} from the load balancer security group on the targets, or keep the health check on the traffic port.`
          : typeof newPath === 'string'
            ? `Confirm the application answers ${newPath} with ${accepted} before deploying. The template does not show which paths the application serves.`
            : 'Confirm the targets pass the new health check settings before deploying.',
    };
  },
};
