import type { DependencyEdge, Evidence } from '../../types/index.ts';
import type { GraphIndex } from '../graph/query.ts';

/**
 * Renders a template value for a sentence of evidence. References are shown the way they
 * read in a template, `Database.MasterUserSecret.SecretArn` rather than the object form.
 */
export function formatValue(value: unknown): string {
  if (value === undefined) {
    return 'unset';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record['Ref'] === 'string') {
      return record['Ref'];
    }
    const getAtt = record['Fn::GetAtt'];
    if (Array.isArray(getAtt) && getAtt.every((part) => typeof part === 'string')) {
      return getAtt.join('.');
    }
    if (typeof record['Fn::Sub'] === 'string') {
      return record['Fn::Sub'];
    }
  }
  return JSON.stringify(value);
}

export function edgeEvidence(edge: DependencyEdge): Evidence {
  const fact =
    edge.kind === 'DependsOn'
      ? `${edge.source} declares DependsOn ${edge.target}`
      : `${edge.source} references ${edge.target}${edge.attribute === undefined ? '' : `.${edge.attribute}`} at ${edge.propertyPath}`;
  return { source: 'GRAPH', fact, resourceId: edge.source, propertyPath: edge.propertyPath };
}

/**
 * Evidence for each hop of a dependent path. `path[i + 1]` depends on `path[i]`, so the
 * edge for each hop runs from the later element to the earlier one.
 */
export function pathEvidence(graph: GraphIndex, path: readonly string[]): Evidence[] {
  const evidence: Evidence[] = [];
  for (let i = 0; i + 1 < path.length; i += 1) {
    const dependency = path[i] as string;
    const dependent = path[i + 1] as string;
    const edge = graph
      .dependentEdges(dependency)
      .find((candidate) => candidate.source === dependent && candidate.kind !== 'DependsOn');
    const fallback = graph.dependentEdges(dependency).find((c) => c.source === dependent);
    const chosen = edge ?? fallback;
    if (chosen !== undefined) {
      evidence.push(edgeEvidence(chosen));
    }
  }
  return evidence;
}

export function documentationEvidence(fact: string, reference: string): Evidence {
  return { source: 'AWS_DOCUMENTATION', fact, reference };
}
