import { Background, Controls, MarkerType, ReactFlow } from '@xyflow/react';
import { useMemo, useState } from 'react';
import type { AnalysisRecord, Finding } from '@adi/engine/types';
import { buildDisplayGraph, edgeLabel, type GraphFocus } from '../lib/graph.ts';
import { ResourceNode, type ResourceNodeData } from './ResourceNode.tsx';
import { RoutedEdge, type RoutedEdgeData } from './RoutedEdge.tsx';

const NODE_TYPES = { resource: ResourceNode };
const EDGE_TYPES = { routed: RoutedEdge };

interface ImpactGraphProps {
  readonly record: AnalysisRecord;
  readonly selected: Finding | undefined;
}

export function ImpactGraph({ record, selected }: ImpactGraphProps) {
  const [focus, setFocus] = useState<GraphFocus>('IMPACT');
  const display = useMemo(() => buildDisplayGraph(record, selected, focus), [record, selected, focus]);

  const nodes = useMemo<ResourceNodeData[]>(
    () =>
      display.nodes.map((resource) => ({
        id: resource.id,
        type: 'resource',
        position: { x: resource.x, y: resource.y },
        data: { resource, vertical: focus === 'IMPACT' },
        draggable: false,
      })),
    [display, focus],
  );

  const edges = useMemo<RoutedEdgeData[]>(
    () =>
      display.edges.map((edge) => ({
        id: edge.id,
        type: 'routed',
        source: edge.from,
        target: edge.to,
        data: { points: edge.points },
        animated: edge.onPath,
        className: [edge.onPath ? 'edge-path' : '', edge.dimmed ? 'edge-dimmed' : ''].join(' '),
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        ...(edge.onPath ? { label: edgeLabel(edge.relationships) } : {}),
      })),
    [display],
  );

  return (
    <div className="graph-frame">
      <div className="graph-toolbar">
        <div className="segmented" role="group" aria-label="Graph scope">
          <button type="button" className={focus === 'IMPACT' ? 'active' : ''} onClick={() => { setFocus('IMPACT'); }}>
            Impact
          </button>
          <button type="button" className={focus === 'FULL' ? 'active' : ''} onClick={() => { setFocus('FULL'); }}>
            Full stack
          </button>
        </div>
        <div className="legend">
          <span><i className="swatch swatch-changed" />Changed</span>
          <span><i className="swatch swatch-affected" />Affected</span>
          <span><i className="swatch swatch-path" />Causal path</span>
        </div>
      </div>
      <ReactFlow
        key={focus}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        minZoom={0.2}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <p className="graph-caption">
        Arrows point from a resource to the resources that depend on it, the direction a change travels.
      </p>
    </div>
  );
}
