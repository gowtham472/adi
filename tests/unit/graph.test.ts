import { describe, expect, it } from 'vitest';
import { buildDependencyGraph, mergeGraphs } from '../../engine/src/core/graph/build.ts';
import { GraphIndex } from '../../engine/src/core/graph/query.ts';
import type { DependencyEdge } from '../../engine/src/types/index.ts';
import { BASELINE_TEMPLATE_PATH, loadTemplate } from '../helpers.ts';

const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);
const graph = buildDependencyGraph(baseline);

function edgesBetween(source: string, target: string): DependencyEdge[] {
  return graph.edges.filter((edge) => edge.source === source && edge.target === target);
}

describe('buildDependencyGraph on the demo baseline', () => {
  it('creates one node per resource with its service', () => {
    const database = graph.nodes.find((node) => node.id === 'Database');
    expect(database).toEqual({ id: 'Database', type: 'AWS::RDS::DBInstance', service: 'RDS' });
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(
      Object.keys(baseline.Resources).sort(),
    );
  });

  it('marks the database as protected by its security group', () => {
    expect(edgesBetween('Database', 'DatabaseSecurityGroup')).toEqual([
      {
        source: 'Database',
        target: 'DatabaseSecurityGroup',
        kind: 'GetAtt',
        relationship: 'PROTECTED_BY',
        propertyPath: 'VPCSecurityGroups[0]',
        attribute: 'GroupId',
      },
    ]);
  });

  it('distinguishes an ingress source group from a protecting group', () => {
    const [edge] = edgesBetween('DatabaseSecurityGroup', 'AppSecurityGroup');
    expect(edge?.relationship).toBe('ALLOWS');
    expect(edge?.propertyPath).toBe('SecurityGroupIngress[0].SourceSecurityGroupId');
  });

  it('records the task definition connecting to the database endpoint', () => {
    const relationships = edgesBetween('TaskDefinition', 'Database').map((e) => e.relationship);
    expect(relationships).toContain('CONNECTS_TO');
  });

  it('does not treat reading the managed secret as a database connection', () => {
    const [edge] = edgesBetween('TaskExecutionRole', 'Database');
    expect(edge?.relationship).toBe('REFERENCES');
    expect(edge?.attribute).toBe('MasterUserSecret.SecretArn');
  });

  it('includes DependsOn as an ordering edge', () => {
    expect(edgesBetween('Service', 'Listener')).toEqual([
      {
        source: 'Service',
        target: 'Listener',
        kind: 'DependsOn',
        relationship: 'ORDERED_AFTER',
        propertyPath: 'DependsOn',
      },
    ]);
  });

  it('never creates self edges', () => {
    expect(graph.edges.filter((edge) => edge.source === edge.target)).toEqual([]);
  });
});

describe('GraphIndex', () => {
  const index = new GraphIndex(graph);

  it('finds the chain of dependents from the database security group to the service', () => {
    expect(index.dependentPath('DatabaseSecurityGroup', 'Service')).toEqual([
      'DatabaseSecurityGroup',
      'Database',
      'TaskDefinition',
      'Service',
    ]);
  });

  it('returns undefined when there is no dependent path', () => {
    expect(index.dependentPath('Service', 'Database')).toBeUndefined();
  });
});

describe('mergeGraphs', () => {
  it('keeps edges that exist in only one of the two graphs', () => {
    const merged = mergeGraphs(
      { nodes: [], edges: [] },
      {
        nodes: [{ id: 'A', type: 'AWS::S3::Bucket', service: 'S3' }],
        edges: [
          { source: 'A', target: 'B', kind: 'Ref', relationship: 'REFERENCES', propertyPath: 'X' },
        ],
      },
    );
    expect(merged.nodes).toHaveLength(1);
    expect(merged.edges).toHaveLength(1);
  });
});
