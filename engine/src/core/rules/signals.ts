import type { LogSignal, MetricSignal, VerificationSignal } from '../../types/index.ts';
import type { GraphIndex } from '../graph/query.ts';

const TYPES = {
  cluster: 'AWS::ECS::Cluster',
  service: 'AWS::ECS::Service',
  taskDefinition: 'AWS::ECS::TaskDefinition',
  targetGroup: 'AWS::ElasticLoadBalancingV2::TargetGroup',
  listener: 'AWS::ElasticLoadBalancingV2::Listener',
  loadBalancer: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
  database: 'AWS::RDS::DBInstance',
  function: 'AWS::Lambda::Function',
  logGroup: 'AWS::Logs::LogGroup',
} as const;

export const RESOURCE_TYPES = TYPES;

/** The load balancer that forwards to a target group, found through its listener. */
export function loadBalancerFor(graph: GraphIndex, targetGroup: string): string | undefined {
  for (const listener of graph.dependentsOfType(targetGroup, TYPES.listener)) {
    const [loadBalancer] = graph.dependenciesOfType(listener, TYPES.loadBalancer);
    if (loadBalancer !== undefined) {
      return loadBalancer;
    }
  }
  return undefined;
}

export function databaseConnections(database: string): MetricSignal {
  return {
    kind: 'METRIC',
    namespace: 'AWS/RDS',
    metricName: 'DatabaseConnections',
    statistic: 'Average',
    dimensions: [{ name: 'DBInstanceIdentifier', resourceId: database }],
    expectedDirection: 'DECREASE',
    description: `Open connections to ${database} fall as clients can no longer connect`,
  };
}

export function targetErrors(loadBalancer: string, targetGroup: string): MetricSignal {
  return {
    kind: 'METRIC',
    namespace: 'AWS/ApplicationELB',
    metricName: 'HTTPCode_Target_5XX_Count',
    statistic: 'Sum',
    dimensions: [
      { name: 'LoadBalancer', resourceId: loadBalancer },
      { name: 'TargetGroup', resourceId: targetGroup },
    ],
    expectedDirection: 'INCREASE',
    description: `Targets in ${targetGroup} return more 5XX responses`,
  };
}

export function unhealthyHosts(loadBalancer: string, targetGroup: string): MetricSignal {
  return {
    kind: 'METRIC',
    namespace: 'AWS/ApplicationELB',
    metricName: 'UnHealthyHostCount',
    statistic: 'Maximum',
    dimensions: [
      { name: 'LoadBalancer', resourceId: loadBalancer },
      { name: 'TargetGroup', resourceId: targetGroup },
    ],
    expectedDirection: 'INCREASE',
    description: `Targets in ${targetGroup} fail health checks`,
  };
}

export function healthyHosts(loadBalancer: string, targetGroup: string): MetricSignal {
  return {
    kind: 'METRIC',
    namespace: 'AWS/ApplicationELB',
    metricName: 'HealthyHostCount',
    statistic: 'Minimum',
    dimensions: [
      { name: 'LoadBalancer', resourceId: loadBalancer },
      { name: 'TargetGroup', resourceId: targetGroup },
    ],
    expectedDirection: 'DECREASE',
    description: `Healthy targets in ${targetGroup} fall`,
  };
}

export function targetRequests(loadBalancer: string, targetGroup: string): MetricSignal {
  return {
    kind: 'METRIC',
    namespace: 'AWS/ApplicationELB',
    metricName: 'RequestCount',
    statistic: 'Sum',
    dimensions: [
      { name: 'LoadBalancer', resourceId: loadBalancer },
      { name: 'TargetGroup', resourceId: targetGroup },
    ],
    expectedDirection: 'DECREASE',
    description: `Requests routed to ${targetGroup} fall`,
  };
}

export function serviceUtilization(
  cluster: string,
  service: string,
  metric: 'MemoryUtilization' | 'CPUUtilization',
): MetricSignal {
  return {
    kind: 'METRIC',
    namespace: 'AWS/ECS',
    metricName: metric,
    statistic: 'Maximum',
    dimensions: [
      { name: 'ClusterName', resourceId: cluster },
      { name: 'ServiceName', resourceId: service },
    ],
    expectedDirection: 'INCREASE',
    description: `${metric === 'MemoryUtilization' ? 'Memory' : 'CPU'} utilization of ${service} rises against the smaller allocation`,
  };
}

export function functionErrors(fn: string): MetricSignal {
  return {
    kind: 'METRIC',
    namespace: 'AWS/Lambda',
    metricName: 'Errors',
    statistic: 'Sum',
    dimensions: [{ name: 'FunctionName', resourceId: fn }],
    expectedDirection: 'INCREASE',
    description: `Invocations of ${fn} fail`,
  };
}

export function logPattern(logGroup: string, pattern: string, description: string): LogSignal {
  return { kind: 'LOG_PATTERN', resourceId: logGroup, pattern, description };
}

/** The log group an ECS task definition writes to through the awslogs driver. */
export function logGroupForTaskDefinition(graph: GraphIndex, taskDefinition: string): string | undefined {
  return graph.dependenciesOfType(taskDefinition, TYPES.logGroup)[0];
}

/**
 * Signals that show a consumer failing, chosen by resource type. An ECS service behind a
 * load balancer surfaces failure as target 5XX responses; a Lambda function as errors.
 */
export function consumerFailureSignals(graph: GraphIndex, consumer: string): VerificationSignal[] {
  const type = graph.typeOf(consumer);
  if (type === TYPES.service) {
    return graph.dependenciesOfType(consumer, TYPES.targetGroup).flatMap((targetGroup) => {
      const loadBalancer = loadBalancerFor(graph, targetGroup);
      return loadBalancer === undefined ? [] : [targetErrors(loadBalancer, targetGroup)];
    });
  }
  if (type === TYPES.function) {
    return [functionErrors(consumer)];
  }
  return [];
}

export function dedupeSignals(signals: readonly VerificationSignal[]): VerificationSignal[] {
  const seen = new Map<string, VerificationSignal>();
  for (const signal of signals) {
    seen.set(JSON.stringify(signal), signal);
  }
  return [...seen.values()];
}
