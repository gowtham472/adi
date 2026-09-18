import type { Evidence, VerificationSignal } from '../../types/index.ts';
import { edgeEvidence } from '../evidence/facts.ts';
import { unique } from '../graph/query.ts';
import { findingId, type Rule, type RuleContext } from './rule.ts';
import { dedupeSignals, RESOURCE_TYPES, serviceUtilization } from './signals.ts';
import { asArray, asNumber, asRecord } from './values.ts';

const RULE_ID = 'ECS-RES-001';

interface Reduction {
  readonly resource: 'CPU' | 'MEMORY';
  readonly location: string;
  readonly before: number;
  readonly after: number;
}

function reduction(
  resource: Reduction['resource'],
  location: string,
  before: unknown,
  after: unknown,
): Reduction | undefined {
  const from = asNumber(before);
  const to = asNumber(after);
  return from !== undefined && to !== undefined && to < from
    ? { resource, location, before: from, after: to }
    : undefined;
}

function containersByName(properties: Readonly<Record<string, unknown>> | undefined): Map<string, Readonly<Record<string, unknown>>> {
  const containers = new Map<string, Readonly<Record<string, unknown>>>();
  for (const raw of asArray(properties?.['ContainerDefinitions'])) {
    const container = asRecord(raw);
    if (container !== undefined && typeof container['Name'] === 'string') {
      containers.set(container['Name'], container);
    }
  }
  return containers;
}

/** Task level and per container CPU and memory reductions, matching containers by name. */
function reductions(context: RuleContext): Reduction[] {
  const { before, after } = context.change;
  const found: (Reduction | undefined)[] = [
    reduction('CPU', 'Cpu', before?.['Cpu'], after?.['Cpu']),
    reduction('MEMORY', 'Memory', before?.['Memory'], after?.['Memory']),
  ];
  const afterContainers = containersByName(after);
  for (const [name, container] of containersByName(before)) {
    const next = afterContainers.get(name);
    if (next === undefined) {
      continue;
    }
    const prefix = `ContainerDefinitions[${name}]`;
    found.push(
      reduction('CPU', `${prefix}.Cpu`, container['Cpu'], next['Cpu']),
      reduction('MEMORY', `${prefix}.Memory`, container['Memory'], next['Memory']),
      reduction('MEMORY', `${prefix}.MemoryReservation`, container['MemoryReservation'], next['MemoryReservation']),
    );
  }
  return found.filter((item): item is Reduction => item !== undefined);
}

function circuitBreakerEnabled(properties: Readonly<Record<string, unknown>> | undefined): boolean {
  const breaker = asRecord(asRecord(properties?.['DeploymentConfiguration'])?.['DeploymentCircuitBreaker']);
  return breaker?.['Enable'] === true && breaker['Rollback'] === true;
}

export const ecsRes001: Rule = {
  id: RULE_ID,
  evaluate(context) {
    const { change } = context;
    if (change.resourceType !== RESOURCE_TYPES.taskDefinition || (change.action !== 'UPDATE' && change.action !== 'REPLACE')) {
      return undefined;
    }
    const found = reductions(context);
    if (found.length === 0) {
      return undefined;
    }

    const taskDefinition = change.resourceId;
    const services = context.graph.dependentsOfType(taskDefinition, RESOURCE_TYPES.service);
    const evidence: Evidence[] = found.map((item) => ({
      source: 'DIFF',
      fact: `${item.location} is reduced from ${String(item.before)} to ${String(item.after)}`,
      resourceId: taskDefinition,
      propertyPath: item.location,
    }));

    const signals: VerificationSignal[] = [];
    const metrics = unique(found.map((item) => (item.resource === 'MEMORY' ? 'MemoryUtilization' : 'CPUUtilization')));
    for (const service of services) {
      const edge = context.graph.dependencyEdges(service, 'RUNS').find((e) => e.target === taskDefinition);
      if (edge !== undefined) {
        evidence.push(edgeEvidence(edge));
      }
      const serviceProperties = context.proposedTemplate.Resources[service]?.Properties;
      if (circuitBreakerEnabled(serviceProperties)) {
        evidence.push({
          source: 'TEMPLATE',
          fact: `${service} enables the deployment circuit breaker with rollback, which returns the service to its last completed deployment if the new tasks fail to reach a steady state`,
          resourceId: service,
          propertyPath: 'DeploymentConfiguration.DeploymentCircuitBreaker',
        });
      }
      const [cluster] = context.graph.dependenciesOfType(service, RESOURCE_TYPES.cluster);
      if (cluster !== undefined) {
        signals.push(...metrics.map((metric) => serviceUtilization(cluster, service, metric)));
      }
    }

    if (services.length === 0) {
      return undefined;
    }

    const primary = found[0] as Reduction;
    return {
      id: findingId(RULE_ID, taskDefinition),
      ruleId: RULE_ID,
      title: `${primary.resource === 'MEMORY' ? 'Memory' : 'CPU'} for ${taskDefinition} is reduced from ${String(primary.before)} to ${String(primary.after)}`,
      severity: 'MEDIUM',
      category: 'CAPACITY',
      changedResource: taskDefinition,
      affectedResources: services,
      causalPath: [taskDefinition, services[0] as string],
      evidence,
      verificationSignals: dedupeSignals(signals),
      recommendation:
        'Check peak utilization of the running service against the new allocation before deploying. The template cannot show how much the workload actually uses, so this finding may not materialize.',
    };
  },
};
