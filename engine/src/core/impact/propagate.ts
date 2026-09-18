import type {
  AffectedResource,
  BlastRadius,
  ChangeImpact,
  ChangeSet,
} from '../../types/index.ts';
import type { GraphIndex } from '../graph/query.ts';

/**
 * Breadth first walk over dependents, so each affected resource is recorded at its
 * shortest distance from the change along with the path that reaches it.
 */
function affectedBy(index: GraphIndex, origin: string): AffectedResource[] {
  const paths = new Map<string, readonly string[]>([[origin, [origin]]]);
  const queue = [origin];
  const affected: AffectedResource[] = [];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentPath = paths.get(current) ?? [current];
    for (const edge of index.dependentEdges(current)) {
      if (paths.has(edge.source)) {
        continue;
      }
      const path = [...currentPath, edge.source];
      paths.set(edge.source, path);
      affected.push({ resourceId: edge.source, depth: path.length - 1, path });
      queue.push(edge.source);
    }
  }

  return affected;
}

function blastRadiusOf(index: GraphIndex, origin: string, affected: readonly AffectedResource[]): BlastRadius {
  if (affected.length === 0) {
    return 'LOCAL';
  }
  const originService = index.node(origin)?.service;
  const crossesService = affected.some(
    (resource) => index.node(resource.resourceId)?.service !== originService,
  );
  return crossesService ? 'APPLICATION' : 'SERVICE';
}

/**
 * Computes the impact of every change except creations. A newly created resource has no
 * existing dependents, and any resource that starts depending on it is itself reported as
 * a change.
 */
export function propagateChanges(index: GraphIndex, changeSet: ChangeSet): ChangeImpact[] {
  return changeSet.changes
    .filter((change) => change.action !== 'CREATE')
    .map((change) => {
      const affected = affectedBy(index, change.resourceId);
      return {
        resourceId: change.resourceId,
        affected,
        blastRadius: blastRadiusOf(index, change.resourceId, affected),
      };
    });
}
