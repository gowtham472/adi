import type {
  DependencyEdge,
  DependencyGraph,
  Relationship,
  ResourceNode,
} from '../../types/index.ts';

/** Indexed, read only view over a dependency graph. */
export class GraphIndex {
  private readonly nodesById: ReadonlyMap<string, ResourceNode>;
  private readonly incoming: ReadonlyMap<string, readonly DependencyEdge[]>;
  private readonly outgoing: ReadonlyMap<string, readonly DependencyEdge[]>;

  constructor(readonly graph: DependencyGraph) {
    this.nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const incoming = new Map<string, DependencyEdge[]>();
    const outgoing = new Map<string, DependencyEdge[]>();
    for (const edge of graph.edges) {
      incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
      outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    }
    this.incoming = incoming;
    this.outgoing = outgoing;
  }

  node(id: string): ResourceNode | undefined {
    return this.nodesById.get(id);
  }

  typeOf(id: string): string | undefined {
    return this.nodesById.get(id)?.type;
  }

  /** Edges from resources that depend on `id`. */
  dependentEdges(id: string, relationship?: Relationship): readonly DependencyEdge[] {
    const edges = this.incoming.get(id) ?? [];
    return relationship === undefined ? edges : edges.filter((e) => e.relationship === relationship);
  }

  /** Edges from `id` to the resources it depends on. */
  dependencyEdges(id: string, relationship?: Relationship): readonly DependencyEdge[] {
    const edges = this.outgoing.get(id) ?? [];
    return relationship === undefined ? edges : edges.filter((e) => e.relationship === relationship);
  }

  dependentsOfType(id: string, type: string): string[] {
    return unique(
      this.dependentEdges(id)
        .map((edge) => edge.source)
        .filter((source) => this.typeOf(source) === type),
    );
  }

  dependenciesOfType(id: string, type: string): string[] {
    return unique(
      this.dependencyEdges(id)
        .map((edge) => edge.target)
        .filter((target) => this.typeOf(target) === type),
    );
  }

  /**
   * Shortest chain of dependents from `from` to `to`, inclusive of both, or undefined if
   * `to` does not transitively depend on `from`.
   */
  dependentPath(from: string, to: string): string[] | undefined {
    const previous = new Map<string, string | null>([[from, null]]);
    const queue = [from];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (current === to) {
        const path: string[] = [];
        for (let step: string | null = to; step !== null; step = previous.get(step) ?? null) {
          path.unshift(step);
        }
        return path;
      }
      for (const edge of this.dependentEdges(current)) {
        if (!previous.has(edge.source)) {
          previous.set(edge.source, current);
          queue.push(edge.source);
        }
      }
    }
    return undefined;
  }
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
