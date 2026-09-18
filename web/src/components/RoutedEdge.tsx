import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';

type Point = { readonly x: number; readonly y: number };

export type RoutedEdgeData = Edge<{ points: readonly Point[] }, 'routed'>;

/**
 * Draws a smooth curve through the route the layout computed, so an edge bends around the
 * nodes between its ends instead of passing underneath them. Each interior point is a
 * quadratic control point, and the curve passes through the midpoints between them.
 */
function smoothPath(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) {
    return '';
  }
  let path = `M ${String(first.x)} ${String(first.y)}`;
  for (let i = 0; i < rest.length - 1; i += 1) {
    const control = rest[i] as Point;
    const next = rest[i + 1] as Point;
    path += ` Q ${String(control.x)} ${String(control.y)} ${String((control.x + next.x) / 2)} ${String((control.y + next.y) / 2)}`;
  }
  const last = rest.at(-1);
  return last === undefined ? path : `${path} L ${String(last.x)} ${String(last.y)}`;
}

export function RoutedEdge({ id, data, sourceX, sourceY, targetX, targetY, markerEnd, label }: EdgeProps<RoutedEdgeData>) {
  const points = data !== undefined && data.points.length >= 2
    ? data.points
    : [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }];
  const middle = points[Math.floor(points.length / 2)] as Point;

  return (
    <>
      <BaseEdge id={id} path={smoothPath(points)} {...(markerEnd === undefined ? {} : { markerEnd })} />
      {typeof label === 'string' && (
        <EdgeLabelRenderer>
          <div className="edge-label" style={{ transform: `translate(-50%, -50%) translate(${String(middle.x)}px, ${String(middle.y)}px)` }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
