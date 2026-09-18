import type { DependencyEdge, Evidence, VerificationSignal } from '../../types/index.ts';
import { documentationEvidence, edgeEvidence, formatValue } from '../evidence/facts.ts';
import { unique } from '../graph/query.ts';
import { referencedResource } from '../graph/references.ts';
import { findingId, type Rule, type RuleContext } from './rule.ts';
import {
  dedupeSignals,
  functionErrors,
  healthyHosts,
  loadBalancerFor,
  logGroupForTaskDefinition,
  logPattern,
  RESOURCE_TYPES,
} from './signals.ts';
import { asArray, asRecord } from './values.ts';

const RULE_ID = 'IAM-POL-001';
const ROLE = 'AWS::IAM::Role';
const POLICY_TYPES = new Set(['AWS::IAM::Policy', 'AWS::IAM::ManagedPolicy']);

const EXECUTION_ROLE_URL =
  'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html';
const SENSITIVE_DATA_URL =
  'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html';

interface Permission {
  readonly action: string;
  readonly resource: string;
  /** Where the permission was granted, for example `Policies[read-database-secret]`. */
  readonly grantedBy: string;
}

/** Flattens Allow statements into one entry per action and resource pair. */
function allowedPermissions(document: unknown, grantedBy: string): Permission[] {
  return asArray(asRecord(document)?.['Statement']).flatMap((raw) => {
    const statement = asRecord(raw);
    if (statement?.['Effect'] !== 'Allow') {
      return [];
    }
    const actions = asArray(statement['Action']).filter((a): a is string => typeof a === 'string');
    const resources = asArray(statement['Resource']).map(formatValue);
    return actions.flatMap((action) =>
      (resources.length === 0 ? ['*'] : resources).map((resource) => ({ action, resource, grantedBy })),
    );
  });
}

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

/**
 * A removed permission is still effectively granted if any remaining statement's action
 * pattern matches it on the same resource or on `*`.
 */
function stillGranted(permission: Permission, remaining: readonly Permission[]): boolean {
  return remaining.some(
    (candidate) =>
      globMatches(candidate.action, permission.action) &&
      (candidate.resource === '*' || candidate.resource === permission.resource),
  );
}

function rolePermissions(properties: Readonly<Record<string, unknown>> | undefined): Permission[] {
  return asArray(properties?.['Policies']).flatMap((raw) => {
    const policy = asRecord(raw);
    const name = typeof policy?.['PolicyName'] === 'string' ? policy['PolicyName'] : 'inline';
    return allowedPermissions(policy?.['PolicyDocument'], `Policies[${name}]`);
  });
}

function managedPolicyArns(properties: Readonly<Record<string, unknown>> | undefined): string[] {
  return asArray(properties?.['ManagedPolicyArns']).map(formatValue);
}

interface RemovedAccess {
  readonly roles: readonly string[];
  readonly permissions: readonly Permission[];
  readonly managedPolicies: readonly string[];
}

function removedAccess(context: RuleContext): RemovedAccess | undefined {
  const { change } = context;

  if (change.resourceType === ROLE && change.action !== 'CREATE' && change.action !== 'DELETE') {
    const after = rolePermissions(change.after);
    const permissions = rolePermissions(change.before).filter((p) => !stillGranted(p, after));
    const remainingArns = new Set(managedPolicyArns(change.after));
    const managedPolicies = managedPolicyArns(change.before).filter((arn) => !remainingArns.has(arn));
    return { roles: [change.resourceId], permissions, managedPolicies };
  }

  if (POLICY_TYPES.has(change.resourceType) && change.action !== 'CREATE') {
    const roles = asArray(change.before?.['Roles'])
      .map(referencedResource)
      .filter((role): role is string => role !== undefined);
    const after = change.action === 'DELETE' ? [] : allowedPermissions(change.after?.['PolicyDocument'], change.resourceId);
    const permissions = allowedPermissions(change.before?.['PolicyDocument'], change.resourceId).filter(
      (p) => !stillGranted(p, after),
    );
    return { roles, permissions, managedPolicies: [] };
  }

  return undefined;
}

type RoleUse = 'EXECUTION' | 'TASK' | 'FUNCTION' | 'OTHER';

function roleUse(edge: DependencyEdge, graph: RuleContext['graph']): RoleUse {
  if (edge.propertyPath === 'ExecutionRoleArn') {
    return 'EXECUTION';
  }
  if (edge.propertyPath === 'TaskRoleArn') {
    return 'TASK';
  }
  return graph.typeOf(edge.source) === RESOURCE_TYPES.function ? 'FUNCTION' : 'OTHER';
}

function describePermission(permission: Permission): string {
  return `${permission.action} on ${permission.resource}`;
}

/** True when the task definition injects secrets that need the removed permission to fetch. */
function injectsSecrets(context: RuleContext, taskDefinition: string): boolean {
  const properties = context.proposedTemplate.Resources[taskDefinition]?.Properties;
  return asArray(properties?.['ContainerDefinitions']).some(
    (container) => asArray(asRecord(container)?.['Secrets']).length > 0,
  );
}

export const iamPol001: Rule = {
  id: RULE_ID,
  evaluate(context) {
    const removed = removedAccess(context);
    if (removed === undefined || (removed.permissions.length === 0 && removed.managedPolicies.length === 0)) {
      return undefined;
    }

    const evidence: Evidence[] = [
      ...removed.permissions.map((permission) => ({
        source: 'DIFF' as const,
        fact: `${describePermission(permission)}, granted by ${permission.grantedBy}, is not granted by any statement in the proposed template`,
        resourceId: context.change.resourceId,
      })),
      ...removed.managedPolicies.map((arn) => ({
        source: 'DIFF' as const,
        fact: `Managed policy ${arn} is detached`,
        resourceId: context.change.resourceId,
        propertyPath: 'ManagedPolicyArns',
      })),
    ];

    const signals: VerificationSignal[] = [];
    const affected: string[] = [];
    let causalPath: string[] | undefined;
    let executionRoleAffected = false;
    let secretsAffected = false;

    for (const role of removed.roles) {
      for (const edge of context.graph.dependentEdges(role, 'ASSUMES')) {
        evidence.push(edgeEvidence(edge));
        affected.push(edge.source);
        const use = roleUse(edge, context.graph);
        const services = context.graph.dependentsOfType(edge.source, RESOURCE_TYPES.service);
        affected.push(...services);
        causalPath ??= unique([context.change.resourceId, role, edge.source, ...services.slice(0, 1)]);

        if (use === 'EXECUTION') {
          executionRoleAffected = true;
          const secretFetch = removed.permissions.some((p) => globMatches(p.action, 'secretsmanager:GetSecretValue'));
          if (secretFetch && injectsSecrets(context, edge.source)) {
            secretsAffected = true;
            evidence.push({
              source: 'TEMPLATE',
              fact: `${edge.source} injects container secrets from Secrets Manager through ContainerDefinitions Secrets`,
              resourceId: edge.source,
              propertyPath: 'ContainerDefinitions',
            });
          }
          for (const service of services) {
            for (const targetGroup of context.graph.dependenciesOfType(service, RESOURCE_TYPES.targetGroup)) {
              const loadBalancer = loadBalancerFor(context.graph, targetGroup);
              if (loadBalancer !== undefined) {
                signals.push(healthyHosts(loadBalancer, targetGroup));
              }
            }
          }
        } else if (use === 'TASK') {
          const logGroup = logGroupForTaskDefinition(context.graph, edge.source);
          if (logGroup !== undefined) {
            signals.push(logPattern(logGroup, 'AccessDenied', `Application calls from ${edge.source} are denied`));
          }
        } else if (use === 'FUNCTION') {
          signals.push(functionErrors(edge.source));
        }
      }
    }

    if (causalPath === undefined) {
      return undefined;
    }

    if (executionRoleAffected) {
      evidence.push(
        documentationEvidence(
          'The task execution role grants the ECS container and Fargate agents permission to make AWS API calls on behalf of the task, including pulling images, sending awslogs output and retrieving Secrets Manager secrets referenced by the task definition.',
          EXECUTION_ROLE_URL,
        ),
      );
    }
    if (secretsAffected) {
      evidence.push(
        documentationEvidence(
          'A changed secret is only picked up by forcing a new deployment or launching a new task, so ECS retrieves secret values when a task launches rather than while it runs.',
          SENSITIVE_DATA_URL,
        ),
      );
    }

    const first = removed.permissions[0];
    return {
      id: findingId(RULE_ID, context.change.resourceId),
      ruleId: RULE_ID,
      title:
        first === undefined
          ? `Managed policy detached from ${removed.roles.join(', ')}`
          : `${first.action} removed from ${removed.roles.join(', ')}`,
      severity: 'HIGH',
      category: 'IAM',
      changedResource: context.change.resourceId,
      affectedResources: unique(affected),
      causalPath,
      evidence,
      verificationSignals: dedupeSignals(signals),
      recommendation: executionRoleAffected
        ? 'Restore the permission before deploying. Tasks that are already running were started with the permission in place, so the failure is expected at the next task launch, such as a deployment, a scale out or the replacement of an unhealthy task. A quiet deployment is not confirmation.'
        : 'Restore the permission, or confirm the workload no longer calls the affected API before deploying.',
    };
  },
};
