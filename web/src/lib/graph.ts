import { Graph, layout } from '@dagrejs/dagre';
import type { AnalysisRecord, Finding, Relationship } from '@adi/engine/types';

export type NodeState = 'CHANGED' | 'AFFECTED' | 'UNAFFECTED';

export interface DisplayNode {
  readonly id: string;
  readonly type: string;
  readonly service: string;
  readonly state: NodeState;
  readonly onPath: boolean;
  readonly dimmed: boolean;
  readonly changeAction?: string;
  readonly depth?: number;
  readonly x: number;
  readonly y: number;
}

/**
 * An edge drawn from a dependency to its dependent, the direction impact travels. The
 * engine stores the opposite direction (dependent to dependency); the view flips it so the
 * graph reads left to right from the change to what it reaches.
 */
export interface DisplayEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly relationships: readonly Relationship[];
  /** The route dagre computed around other nodes, from the source boundary to the target. */
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly onPath: boolean;
  readonly dimmed: boolean;
}

/**
 * Relationships are stored from the dependent's side ("Database is protected by the group").
 * Edges are drawn from the dependency, so labels use the verb from that side instead.
 */
export const RELATIONSHIP_VERB: Readonly<Record<Relationship, string>> = {
  PROTECTED_BY: 'protects',
  ALLOWS: 'admitted by',
  ASSUMES: 'assumed by',
  ROUTES_TO: 'used by',
  RUNS: 'run by',
  CONNECTS_TO: 'endpoint read by',
  HOSTED_IN: 'hosts',
  ORDERED_AFTER: 'precedes',
  REFERENCES: 'referenced by',
};

const GENERIC: ReadonlySet<Relationship> = new Set(['REFERENCES', 'ORDERED_AFTER']);

/** Drops generic relationships when a more specific one describes the same pair. */
export function edgeLabel(relationships: readonly Relationship[]): string {
  const specific = relationships.filter((r) => !GENERIC.has(r));
  return (specific.length > 0 ? specific : relationships).map((r) => RELATIONSHIP_VERB[r]).join(', ');
}

export const NODE_WIDTH = 230;
export const NODE_HEIGHT = 66;

function pathPairs(path: readonly string[]): Set<string> {
  const pairs = new Set<string>();
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i] as string;
    const b = path[i + 1] as string;
    pairs.add(`${a}|${b}`);
    pairs.add(`${b}|${a}`);
  }
  return pairs;
}

/** Every resource a finding or impact touches, used to focus the graph on the change. */
function impactResources(record: AnalysisRecord): Set<string> {
  const ids = new Set<string>();
  for (const change of record.changeSet.changes) {
    ids.add(change.resourceId);
  }
  for (const impact of record.impacts) {
    for (const affected of impact.affected) {
      ids.add(affected.resourceId);
    }
  }
  for (const finding of record.findings) {
    for (const id of [finding.changedResource, ...finding.affectedResources, ...finding.causalPath]) {
      ids.add(id);
    }
  }
  return ids;
}

export type GraphFocus = 'IMPACT' | 'FULL';

export function buildDisplayGraph(
  record: AnalysisRecord,
  selected: Finding | undefined,
  focus: GraphFocus,
): { nodes: DisplayNode[]; edges: DisplayEdge[] } {
  const focused = impactResources(record);
  const visible = (id: string) => focus === 'FULL' || focused.size === 0 || focused.has(id);

  const changes = new Map(record.changeSet.changes.map((c) => [c.resourceId, c]));
  const depth = new Map<string, number>();
  for (const impact of record.impacts) {
    for (const affected of impact.affected) {
      depth.set(affected.resourceId, Math.min(depth.get(affected.resourceId) ?? Infinity, affected.depth));
    }
  }
  const selectedPath = new Set(selected?.causalPath ?? []);
  const selectedResources = new Set(
    selected === undefined ? [] : [selected.changedResource, ...selected.affectedResources, ...selected.causalPath],
  );
  const pairs = pathPairs(selected?.causalPath ?? []);

  const nodes = record.graph.nodes.filter((n) => visible(n.id));
  const nodeIds = new Set(nodes.map((n) => n.id));

  const merged = new Map<string, { from: string; to: string; relationships: Set<Relationship> }>();
  for (const edge of record.graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    const key = `${edge.target}|${edge.source}`;
    const entry = merged.get(key) ?? { from: edge.target, to: edge.source, relationships: new Set<Relationship>() };
    entry.relationships.add(edge.relationship);
    merged.set(key, entry);
  }

  const dagreGraph = new Graph();
  // The impact view is a short chain and reads best top to bottom in the tall graph panel;
  // the full stack is wide and shallow, so it reads left to right.
  dagreGraph.setGraph({
    rankdir: focus === 'IMPACT' ? 'TB' : 'LR',
    nodesep: focus === 'IMPACT' ? 60 : 28,
    edgesep: focus === 'IMPACT' ? 140 : 20,
    ranksep: focus === 'IMPACT' ? 56 : 90,
    marginx: 20,
    marginy: 20,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of merged.values()) {
    dagreGraph.setEdge(edge.from, edge.to);
  }
  layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const position = dagreGraph.node(node.id) as { x: number; y: number };
      const change = changes.get(node.id);
      const nodeDepth = depth.get(node.id);
      return {
        id: node.id,
        type: node.type,
        service: node.service,
        state: change !== undefined ? 'CHANGED' : nodeDepth !== undefined ? 'AFFECTED' : 'UNAFFECTED',
        onPath: selectedPath.has(node.id),
        dimmed: selected !== undefined && !selectedResources.has(node.id),
        ...(change === undefined ? {} : { changeAction: change.action }),
        ...(nodeDepth === undefined ? {} : { depth: nodeDepth }),
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      };
    }),
    edges: [...merged.entries()].map(([key, edge]) => {
      const onPath = pairs.has(key);
      const route = dagreGraph.edge(edge.from, edge.to) as { points?: { x: number; y: number }[] } | undefined;
      return {
        id: key,
        from: edge.from,
        to: edge.to,
        relationships: [...edge.relationships],
        points: route?.points ?? [],
        onPath,
        dimmed: selected !== undefined && !onPath,
      };
    }),
  };
}
