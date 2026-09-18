import { ArrowRightIcon, CornersOutIcon, CrosshairIcon, GraphIcon } from '@phosphor-icons/react';
import { Background, Controls, MarkerType, ReactFlow, useReactFlow } from '@xyflow/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AnalysisRecord, Finding } from '@adi/engine/types';
import { buildDisplayGraph, edgeLabel, type GraphFocus } from '../lib/graph.ts';
import { ResourceNode, type ResourceNodeData } from './ResourceNode.tsx';
import { RoutedEdge, type RoutedEdgeData } from './RoutedEdge.tsx';

const NODE_TYPES = { resource: ResourceNode };
const EDGE_TYPES = { routed: RoutedEdge };

interface ImpactGraphProps {
  readonly record: AnalysisRecord;
  readonly selected: Finding | undefined;
  readonly inspectedId: string | undefined;
  readonly onInspect: (resourceId: string | undefined) => void;
  readonly inspector?: ReactNode;
}

/** Brings the inspected resource into view when it is chosen from outside the graph. */
function FocusOnInspected({ inspectedId }: { inspectedId: string | undefined }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (inspectedId !== undefined) {
      void fitView({ nodes: [{ id: inspectedId }], duration: 400, maxZoom: 1.1, padding: 1.2 });
    }
  }, [inspectedId, fitView]);
  return null;
}

export function ImpactGraph({ record, selected, inspectedId, onInspect, inspector }: ImpactGraphProps) {
  const [focus, setFocus] = useState<GraphFocus>('IMPACT');
  const display = useMemo(() => buildDisplayGraph(record, selected, focus), [record, selected, focus]);

  const nodes = useMemo<ResourceNodeData[]>(
    () =>
      display.nodes.map((resource) => ({
        id: resource.id,
        type: 'resource',
        position: { x: resource.x, y: resource.y },
        data: { resource, vertical: focus === 'IMPACT', inspected: resource.id === inspectedId },
        draggable: false,
      })),
    [display, focus, inspectedId],
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
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        ...(edge.onPath ? { label: edgeLabel(edge.relationships) } : {}),
      })),
    [display],
  );

  const changedCount = display.nodes.filter((n) => n.state === 'CHANGED').length;
  const affectedCount = display.nodes.filter((n) => n.state === 'AFFECTED').length;

  return (
    <section className="graph-frame" aria-label="Impact graph">
      <header className="graph-header">
        <div className="graph-title">
          <GraphIcon weight="bold" aria-hidden="true" />
          <h2>Impact graph</h2>
          <span className="muted">
            {changedCount} changed, {affectedCount} affected
          </span>
        </div>
        <div className="graph-tools">
          <div className="legend">
            <span><i className="swatch swatch-changed" />Changed</span>
            <span><i className="swatch swatch-affected" />Affected</span>
            <span><i className="swatch swatch-path" />Causal path</span>
          </div>
          <div className="segmented" role="group" aria-label="Graph scope">
            <button type="button" className={focus === 'IMPACT' ? 'active' : ''} onClick={() => { setFocus('IMPACT'); }}>
              <CrosshairIcon weight="bold" aria-hidden="true" />
              Impact
            </button>
            <button type="button" className={focus === 'FULL' ? 'active' : ''} onClick={() => { setFocus('FULL'); }}>
              <CornersOutIcon weight="bold" aria-hidden="true" />
              Full stack
            </button>
          </div>
        </div>
      </header>
      <div className="graph-canvas">
        <ReactFlow
          key={focus}
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.16, maxZoom: 1.1 }}
          minZoom={0.2}
          nodesConnectable={false}
          elementsSelectable={false}
          onNodeClick={(_, node) => { onInspect(node.id); }}
          onPaneClick={() => { onInspect(undefined); }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
          <FocusOnInspected inspectedId={inspectedId} />
        </ReactFlow>
        {inspector}
      </div>
      <footer className="graph-caption">
        <ArrowRightIcon weight="bold" aria-hidden="true" />
        Arrows point from a resource to what depends on it. Select a resource to inspect it.
        {selected === undefined ? null : (
          <span className="caption-path">
            Highlighted: causal path of <code>{selected.ruleId}</code>
          </span>
        )}
      </footer>
    </section>
  );
}
