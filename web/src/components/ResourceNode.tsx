import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { DisplayNode } from '../lib/graph.ts';
import { ResourceGlyph } from '../lib/icons.tsx';

export type ResourceNodeData = Node<
  { resource: DisplayNode; vertical: boolean; inspected: boolean; revealDelay: number },
  'resource'
>;

const SERVICE_LABEL: Readonly<Record<string, string>> = { ElasticLoadBalancingV2: 'ELBv2' };

/** `AWS::RDS::DBInstance` is shown as `DBInstance`; the service is shown separately. */
function shortType(type: string): string {
  return type.split('::').at(-1) ?? type;
}

export function ResourceNode({ data }: NodeProps<ResourceNodeData>) {
  const { resource, vertical, inspected, revealDelay } = data;
  const classes = [
    'resource-node',
    `state-${resource.state.toLowerCase()}`,
    resource.onPath ? 'on-path' : '',
    resource.dimmed && !inspected ? 'dimmed' : '',
    inspected ? 'inspected' : '',
  ].join(' ');

  return (
    <div className={classes} title={resource.type} style={{ animationDelay: `${String(revealDelay)}ms` }}>
      {resource.state === 'CHANGED' && <span className="change-pulse" aria-hidden="true" />}
      <Handle type="target" position={vertical ? Position.Top : Position.Left} isConnectable={false} />
      <span className="node-icon">
        <ResourceGlyph type={resource.type} weight="bold" aria-hidden="true" />
      </span>
      <span className="node-body">
        <span className="node-top">
          <span className="service-chip">{SERVICE_LABEL[resource.service] ?? resource.service}</span>
          {resource.changeAction !== undefined ? (
            <span className="node-tag tag-changed">{resource.changeAction}</span>
          ) : resource.depth !== undefined ? (
            <span className="node-tag tag-affected">{resource.depth === 1 ? 'direct' : `${String(resource.depth)} hops`}</span>
          ) : null}
        </span>
        <span className="resource-id">{resource.id}</span>
        <span className="resource-type">{shortType(resource.type)}</span>
      </span>
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} isConnectable={false} />
    </div>
  );
}
