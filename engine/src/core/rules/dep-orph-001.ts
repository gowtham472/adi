import type { Evidence, VerificationSignal } from '../../types/index.ts';
import { edgeEvidence } from '../evidence/facts.ts';
import { unique } from '../graph/query.ts';
import { extractReferences } from '../graph/references.ts';
import { findingId, type Rule, type RuleContext } from './rule.ts';
import {
  consumerFailureSignals,
  dedupeSignals,
  loadBalancerFor,
  RESOURCE_TYPES,
  targetRequests,
} from './signals.ts';

const RULE_ID = 'DEP-ORPH-001';
const LISTENER_RULE = 'AWS::ElasticLoadBalancingV2::ListenerRule';
const ROUTING_TYPES = new Set<string>([RESOURCE_TYPES.listener, LISTENER_RULE]);

interface OrphanedTargetGroup {
  readonly targetGroup: string;
  readonly services: readonly string[];
}

/**
 * Deleting the last listener or listener rule that forwards to a target group leaves the
 * group registered but unreachable: no request arrives at its targets.
 */
function orphanedTargetGroups(context: RuleContext, deleted: string): OrphanedTargetGroup[] {
  if (!ROUTING_TYPES.has(context.change.resourceType)) {
    return [];
  }
  return context.current
    .dependencyEdges(deleted, 'ROUTES_TO')
    .map((edge) => edge.target)
    .filter((targetGroup) =>
      context.proposed.dependentEdges(targetGroup, 'ROUTES_TO').every(
        (edge) => !ROUTING_TYPES.has(context.proposed.typeOf(edge.source) ?? ''),
      ),
    )
    .map((targetGroup) => ({
      targetGroup,
      services: context.proposed.dependentsOfType(targetGroup, RESOURCE_TYPES.service),
    }));
}

export const depOrph001: Rule = {
  id: RULE_ID,
  evaluate(context) {
    const { change } = context;
    if (change.action !== 'DELETE') {
      return undefined;
    }
    const deleted = change.resourceId;
    const surviving = context.current
      .dependentEdges(deleted)
      .filter((edge) => context.proposedTemplate.Resources[edge.source] !== undefined);
    const orphaned = orphanedTargetGroups(context, deleted);
    if (surviving.length === 0 && orphaned.length === 0) {
      return undefined;
    }

    const evidence: Evidence[] = [
      { source: 'DIFF', fact: `${deleted} (${change.resourceType}) is removed from the template`, resourceId: deleted },
    ];
    const signals: VerificationSignal[] = [];
    const affected: string[] = [];
    let rejected = false;

    for (const edge of surviving) {
      evidence.push(edgeEvidence(edge));
      affected.push(edge.source);
      // The proposed graph has no node for the deleted resource and so no edge to it. A
      // dangling reference is only visible in the raw proposed properties.
      const proposedResource = context.proposedTemplate.Resources[edge.source];
      const dependsOn = proposedResource?.DependsOn;
      const stillReferenced =
        extractReferences(proposedResource?.Properties ?? {}, new Set([deleted])).length > 0 ||
        dependsOn === deleted ||
        (Array.isArray(dependsOn) && dependsOn.includes(deleted));
      if (stillReferenced) {
        rejected = true;
        evidence.push({
          source: 'TEMPLATE',
          fact: `${edge.source} still references ${deleted} in the proposed template, so CloudFormation rejects the template with an unresolved dependency`,
          resourceId: edge.source,
        });
      } else {
        evidence.push({
          source: 'DIFF',
          fact: `${edge.source} no longer references ${deleted} in the proposed template and remains in the stack`,
          resourceId: edge.source,
        });
      }
      // A DependsOn edge only orders creation. It says nothing about runtime traffic, so it
      // is not evidence that the dependent will start failing.
      if (edge.kind !== 'DependsOn') {
        signals.push(...consumerFailureSignals(context.graph, edge.source));
      }
    }

    for (const item of orphaned) {
      evidence.push({
        source: 'GRAPH',
        fact: `No listener or listener rule forwards to ${item.targetGroup} in the proposed template`,
        resourceId: item.targetGroup,
      });
      affected.push(item.targetGroup, ...item.services);
      const loadBalancer = context.current.dependenciesOfType(deleted, RESOURCE_TYPES.loadBalancer)[0] ??
        loadBalancerFor(context.current, item.targetGroup);
      if (loadBalancer !== undefined) {
        affected.push(loadBalancer);
        signals.push(targetRequests(loadBalancer, item.targetGroup));
      }
    }

    const firstOrphan = orphaned[0];
    const causalPath =
      firstOrphan === undefined
        ? [deleted, (surviving[0]?.source) as string]
        : unique([deleted, firstOrphan.targetGroup, ...firstOrphan.services.slice(0, 1)]);

    return {
      id: findingId(RULE_ID, deleted),
      ruleId: RULE_ID,
      title:
        firstOrphan !== undefined
          ? `Deleting ${deleted} leaves ${firstOrphan.targetGroup} with no route from the load balancer`
          : rejected
            ? `${deleted} is deleted while still referenced`
            : `${deleted} is deleted while ${String(surviving.length)} resource(s) depended on it`,
      severity: 'HIGH',
      category: 'DEPENDENCY',
      changedResource: deleted,
      affectedResources: unique(affected),
      causalPath,
      evidence,
      verificationSignals: dedupeSignals(signals),
      recommendation: rejected
        ? `Remove the remaining references to ${deleted} or keep the resource.`
        : firstOrphan !== undefined
          ? `Keep ${deleted}, or route ${firstOrphan.targetGroup} through another listener before deleting it.`
          : `Confirm each former dependent of ${deleted} works without it before deploying.`,
    };
  },
};
