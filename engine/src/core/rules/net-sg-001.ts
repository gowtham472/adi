import type { Evidence, VerificationSignal } from '../../types/index.ts';
import { documentationEvidence, edgeEvidence, pathEvidence } from '../evidence/facts.ts';
import { unique } from '../graph/query.ts';
import { referencedResource } from '../graph/references.ts';
import {
  covers,
  describePermission,
  inlineRules,
  toPermission,
  type IngressPermission,
} from './ingress.ts';
import { findingId, type Rule, type RuleContext } from './rule.ts';
import {
  consumerFailureSignals,
  databaseConnections,
  dedupeSignals,
  RESOURCE_TYPES,
} from './signals.ts';

const RULE_ID = 'NET-SG-001';
const SECURITY_GROUP = 'AWS::EC2::SecurityGroup';
const INGRESS = 'AWS::EC2::SecurityGroupIngress';

const CONNECTION_TRACKING_URL =
  'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-connection-tracking.html';

interface LostPermission {
  readonly protectedGroup: string;
  readonly permission: IngressPermission;
  /** Rules in the proposed template from the same source, shown as what replaced it. */
  readonly replacements: readonly IngressPermission[];
}

function lostPermissions(context: RuleContext): LostPermission[] {
  const { change } = context;

  if (change.resourceType === SECURITY_GROUP && change.action !== 'CREATE' && change.action !== 'DELETE') {
    const before = inlineRules(change.before);
    const after = inlineRules(change.after);
    return before
      .filter((rule) => !after.some((candidate) => covers(candidate, rule)))
      .map((permission) => ({
        protectedGroup: change.resourceId,
        permission,
        replacements: after.filter((candidate) => candidate.sourceKey === permission.sourceKey),
      }));
  }

  if (change.resourceType === INGRESS && (change.action === 'DELETE' || change.action === 'UPDATE' || change.action === 'REPLACE')) {
    const before = toPermission(change.before, 'Properties');
    const protectedGroup = referencedResource(change.before?.['GroupId']);
    if (before === undefined || protectedGroup === undefined) {
      return [];
    }
    const after = change.action === 'DELETE' ? undefined : toPermission(change.after, 'Properties');
    if (after !== undefined && covers(after, before)) {
      return [];
    }
    return [{ protectedGroup, permission: before, replacements: after === undefined ? [] : [after] }];
  }

  return [];
}

/** Resources a security group is attached to, excluding standalone rule resources. */
function protectedResources(context: RuleContext, group: string): string[] {
  return unique(
    context.graph
      .dependentEdges(group, 'PROTECTED_BY')
      .map((edge) => edge.source)
      .filter((source) => {
        const type = context.graph.typeOf(source);
        return type !== INGRESS && type !== 'AWS::EC2::SecurityGroupEgress';
      }),
  );
}

interface Connection {
  readonly consumer: string;
  readonly target: string;
  readonly path: readonly string[];
}

/**
 * A consumer is a resource attached to the source group of the lost rule. It is shown to
 * use the protected resource when it transitively depends on it, for example a service
 * running a task definition that reads the database endpoint.
 */
function connectionsThrough(context: RuleContext, lost: LostPermission, targets: readonly string[]): Connection[] {
  if (lost.permission.sourceGroup === undefined) {
    return [];
  }
  const consumers = protectedResources(context, lost.permission.sourceGroup);
  return consumers.flatMap((consumer) =>
    targets.flatMap((target) => {
      const path = context.graph.dependentPath(target, consumer);
      return path === undefined ? [] : [{ consumer, target, path }];
    }),
  );
}

export const netSg001: Rule = {
  id: RULE_ID,
  evaluate(context) {
    const lost = lostPermissions(context);
    if (lost.length === 0) {
      return undefined;
    }

    const evidence: Evidence[] = [];
    const signals: VerificationSignal[] = [];
    const affected: string[] = [];
    let causalPath: readonly string[] | undefined;
    let primary: Connection | undefined;

    for (const item of lost) {
      evidence.push({
        source: 'DIFF',
        fact: `Ingress ${describePermission(item.permission)} on ${item.protectedGroup} is allowed in the current template and by no rule in the proposed template`,
        resourceId: context.change.resourceId,
        propertyPath: item.permission.propertyPath,
      });
      for (const replacement of item.replacements) {
        evidence.push({
          source: 'DIFF',
          fact: `The proposed template allows ${describePermission(replacement)} instead, which does not cover the removed rule`,
          resourceId: context.change.resourceId,
          propertyPath: replacement.propertyPath,
        });
      }

      const targets = protectedResources(context, item.protectedGroup);
      for (const target of targets) {
        const edge = context.graph.dependencyEdges(target, 'PROTECTED_BY').find((e) => e.target === item.protectedGroup);
        if (edge !== undefined) {
          evidence.push(edgeEvidence(edge));
        }
        affected.push(target);
        if (context.graph.typeOf(target) === RESOURCE_TYPES.database) {
          signals.push(databaseConnections(target));
        }
      }

      for (const connection of connectionsThrough(context, item, targets)) {
        primary ??= connection;
        const sourceGroup = item.permission.sourceGroup as string;
        const attachment = context.graph
          .dependencyEdges(connection.consumer, 'PROTECTED_BY')
          .find((edge) => edge.target === sourceGroup);
        if (attachment !== undefined) {
          evidence.push(edgeEvidence(attachment));
        }
        evidence.push(...pathEvidence(context.graph, connection.path));
        affected.push(...connection.path);
        signals.push(...consumerFailureSignals(context.graph, connection.consumer));
      }
    }

    const protectedGroup = lost[0]?.protectedGroup as string;
    if (primary !== undefined) {
      const prefix =
        context.change.resourceId === protectedGroup
          ? [protectedGroup]
          : [context.change.resourceId, protectedGroup];
      causalPath = [...prefix, ...primary.path];
    } else if (affected.length > 0) {
      causalPath = unique([context.change.resourceId, protectedGroup, affected[0] as string]);
    } else {
      return undefined;
    }

    evidence.push(
      documentationEvidence(
        'Security groups do not interrupt tracked connections when a rule changes. New connections are refused immediately; established connections keep working until they close, so the failure appears as clients reconnect rather than at UPDATE_COMPLETE.',
        CONNECTION_TRACKING_URL,
      ),
    );

    const first = lost[0] as LostPermission;
    const title =
      primary === undefined
        ? `Ingress ${describePermission(first.permission)} removed from ${protectedGroup}`
        : `${primary.consumer} loses network access to ${primary.target}`;

    return {
      id: findingId(RULE_ID, context.change.resourceId),
      ruleId: RULE_ID,
      title,
      // Without a path from a consumer to the protected resource, the template shows that
      // access was removed but not that anything in the stack relied on it.
      severity: primary === undefined ? 'MEDIUM' : 'HIGH',
      category: 'NETWORK',
      changedResource: context.change.resourceId,
      affectedResources: unique(affected.filter((id) => id !== context.change.resourceId)),
      causalPath,
      evidence,
      verificationSignals: dedupeSignals(signals),
      recommendation:
        primary === undefined
          ? `Confirm nothing outside this template relies on ${describePermission(first.permission)} to reach ${protectedGroup} before deploying.`
          : `Restore ingress ${describePermission(first.permission)} on ${protectedGroup}, or confirm ${primary.consumer} no longer needs to reach ${primary.target} before deploying.`,
    };
  },
};
