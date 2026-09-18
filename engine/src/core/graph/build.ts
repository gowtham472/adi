import type {
  CfnTemplate,
  DependencyEdge,
  DependencyGraph,
  ReferenceKind,
  Relationship,
  ResourceNode,
} from '../../types/index.ts';
import { extractReferences } from './references.ts';

/** `AWS::RDS::DBInstance` becomes `RDS`. Non-AWS types keep their full name. */
export function serviceOf(type: string): string {
  const parts = type.split('::');
  return parts[0] === 'AWS' && parts[1] !== undefined ? parts[1] : type;
}

const RELATIONSHIP_BY_TARGET_TYPE: Readonly<Record<string, Relationship>> = {
  'AWS::EC2::SecurityGroup': 'PROTECTED_BY',
  'AWS::IAM::Role': 'ASSUMES',
  'AWS::IAM::InstanceProfile': 'ASSUMES',
  'AWS::ElasticLoadBalancingV2::TargetGroup': 'ROUTES_TO',
  'AWS::ECS::TaskDefinition': 'RUNS',
  'AWS::DynamoDB::Table': 'CONNECTS_TO',
  'AWS::EC2::VPC': 'HOSTED_IN',
  'AWS::EC2::Subnet': 'HOSTED_IN',
  'AWS::RDS::DBSubnetGroup': 'HOSTED_IN',
  'AWS::ECS::Cluster': 'HOSTED_IN',
};

/**
 * A security group named as the source of an ingress rule is not protecting the resource
 * that names it; it is being granted access. The property name is what distinguishes the
 * two, so it is checked before the target type.
 */
const ACCESS_GRANT_PROPERTIES = ['SourceSecurityGroupId', 'DestinationSecurityGroupId'];

/**
 * A reference to a database only implies a network connection when it reads the endpoint.
 * Reading the managed master secret ARN, for example, is an IAM concern, not a connection.
 */
const DATABASE_TYPES = new Set(['AWS::RDS::DBInstance', 'AWS::RDS::DBCluster']);

function classifyRelationship(
  kind: ReferenceKind,
  propertyPath: string,
  targetType: string,
  attribute: string | undefined,
): Relationship {
  if (kind === 'DependsOn') {
    return 'ORDERED_AFTER';
  }
  if (ACCESS_GRANT_PROPERTIES.some((name) => propertyPath.endsWith(name))) {
    return 'ALLOWS';
  }
  if (DATABASE_TYPES.has(targetType)) {
    return attribute?.startsWith('Endpoint') === true ? 'CONNECTS_TO' : 'REFERENCES';
  }
  return RELATIONSHIP_BY_TARGET_TYPE[targetType] ?? 'REFERENCES';
}

function edgeKey(edge: DependencyEdge): string {
  return [edge.source, edge.target, edge.kind, edge.propertyPath, edge.attribute ?? ''].join('|');
}

export function buildDependencyGraph(template: CfnTemplate): DependencyGraph {
  const resources = Object.entries(template.Resources);
  const resourceIds = new Set(resources.map(([id]) => id));
  const typeOf = new Map(resources.map(([id, resource]) => [id, resource.Type]));

  const nodes: ResourceNode[] = resources.map(([id, resource]) => ({
    id,
    type: resource.Type,
    service: serviceOf(resource.Type),
  }));

  const edges = new Map<string, DependencyEdge>();
  const addEdge = (edge: DependencyEdge): void => {
    if (edge.source !== edge.target) {
      edges.set(edgeKey(edge), edge);
    }
  };

  for (const [source, resource] of resources) {
    for (const reference of extractReferences(resource.Properties ?? {}, resourceIds)) {
      const targetType = typeOf.get(reference.target) ?? '';
      addEdge({
        source,
        target: reference.target,
        kind: reference.kind,
        relationship: classifyRelationship(
          reference.kind,
          reference.propertyPath,
          targetType,
          reference.attribute,
        ),
        propertyPath: reference.propertyPath,
        ...(reference.attribute === undefined ? {} : { attribute: reference.attribute }),
      });
    }

    const dependsOn =
      resource.DependsOn === undefined
        ? []
        : typeof resource.DependsOn === 'string'
          ? [resource.DependsOn]
          : resource.DependsOn;
    for (const target of dependsOn) {
      if (resourceIds.has(target)) {
        addEdge({
          source,
          target,
          kind: 'DependsOn',
          relationship: 'ORDERED_AFTER',
          propertyPath: 'DependsOn',
        });
      }
    }
  }

  return { nodes, edges: [...edges.values()] };
}

/**
 * Combines the current and proposed graphs. A resource is considered dependent on another
 * if it depends on it in either state, which keeps deleted resources and rewired references
 * visible to impact analysis.
 */
export function mergeGraphs(current: DependencyGraph, proposed: DependencyGraph): DependencyGraph {
  const nodes = new Map<string, ResourceNode>();
  for (const node of [...current.nodes, ...proposed.nodes]) {
    nodes.set(node.id, node);
  }
  const edges = new Map<string, DependencyEdge>();
  for (const edge of [...current.edges, ...proposed.edges]) {
    edges.set(edgeKey(edge), edge);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
