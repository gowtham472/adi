import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { DisplayNode } from '../lib/graph.ts';

export type ResourceNodeData = Node<{ resource: DisplayNode; vertical: boolean }, 'resource'>;

const SERVICE_LABEL: Readonly<Record<string, string>> = { ElasticLoadBalancingV2: 'ELBv2' };

/** `AWS::RDS::DBInstance` is shown as `DBInstance`; the service is shown separately. */
function shortType(type: string): string {
  return type.split('::').at(-1) ?? type;
}

export function ResourceNode({ data }: NodeProps<ResourceNodeData>) {
  const { resource, vertical } = data;
  const classes = [
    'resource-node',
    `state-${resource.state.toLowerCase()}`,
    resource.onPath ? 'on-path' : '',
    resource.dimmed ? 'dimmed' : '',
  ].join(' ');

  return (
    <div className={classes} title={resource.type}>
      <Handle type="target" position={vertical ? Position.Top : Position.Left} isConnectable={false} />
      <div className="resource-node-top">
        <span className="service-chip">{SERVICE_LABEL[resource.service] ?? resource.service}</span>
        {resource.changeAction !== undefined ? (
          <span className="node-tag tag-changed">{resource.changeAction}</span>
        ) : resource.depth !== undefined ? (
          <span className="node-tag tag-affected">{resource.depth === 1 ? 'direct' : `${String(resource.depth)} hops`}</span>
        ) : null}
      </div>
      <div className="resource-id">{resource.id}</div>
      <div className="resource-type">{shortType(resource.type)}</div>
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} isConnectable={false} />
    </div>
  );
}
