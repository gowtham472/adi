import { ArrowDownRightIcon, ArrowUpLeftIcon, XIcon } from '@phosphor-icons/react';
import type { AnalysisRecord, DependencyEdge, Finding } from '@adi/engine/types';
import { edgeLabel } from '../lib/graph.ts';
import { ResourceGlyph, SEVERITY_ICONS } from '../lib/icons.tsx';

interface NodeInspectorProps {
  readonly record: AnalysisRecord;
  readonly resourceId: string;
  readonly onInspect: (resourceId: string) => void;
  readonly onSelectFinding: (findingId: string) => void;
  readonly onClose: () => void;
}

function involves(finding: Finding, resourceId: string): boolean {
  return (
    finding.changedResource === resourceId ||
    finding.affectedResources.includes(resourceId) ||
    finding.causalPath.includes(resourceId)
  );
}

/** Groups edges by the other resource so several references to one resource read as one row. */
function byResource(edges: readonly DependencyEdge[], other: (edge: DependencyEdge) => string): Map<string, DependencyEdge[]> {
  const grouped = new Map<string, DependencyEdge[]>();
  for (const edge of edges) {
    const key = other(edge);
    grouped.set(key, [...(grouped.get(key) ?? []), edge]);
  }
  return grouped;
}

/**
 * Everything the analysis knows about one resource: what it depends on, what depends on
 * it, whether it changed, how far the change reached it, and which findings involve it.
 */
export function NodeInspector({ record, resourceId, onInspect, onSelectFinding, onClose }: NodeInspectorProps) {
  const node = record.graph.nodes.find((n) => n.id === resourceId);
  if (node === undefined) {
    return null;
  }
  const change = record.changeSet.changes.find((c) => c.resourceId === resourceId);
  const depth = Math.min(
    ...record.impacts.flatMap((impact) => impact.affected.filter((a) => a.resourceId === resourceId).map((a) => a.depth)),
  );
  const dependsOn = byResource(record.graph.edges.filter((e) => e.source === resourceId), (e) => e.target);
  const dependedOnBy = byResource(record.graph.edges.filter((e) => e.target === resourceId), (e) => e.source);
  const findings = record.findings.filter((f) => involves(f, resourceId));

  return (
    <aside className="inspector" aria-label={`Resource ${resourceId}`}>
      <header className="inspector-header">
        <span className="node-icon">
          <ResourceGlyph type={node.type} weight="bold" aria-hidden="true" />
        </span>
        <div>
          <code className="inspector-id">{node.id}</code>
          <span className="muted">{node.type}</span>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close inspector">
          <XIcon weight="bold" />
        </button>
      </header>

      <p className="inspector-state">
        {change !== undefined
          ? `Changed: ${change.action.toLowerCase()}${change.changedProperties.length > 0 ? ` of ${change.changedProperties.join(', ')}` : ''}`
          : Number.isFinite(depth)
            ? `Affected, ${depth === 1 ? 'directly' : `${String(depth)} hops from the change`}`
            : 'Not reached by this change'}
      </p>

      {findings.length > 0 && (
        <section>
          <h3>Findings</h3>
          <ul className="inspector-list">
            {findings.map((finding) => {
              const SeverityIcon = SEVERITY_ICONS[finding.severity];
              return (
                <li key={finding.id}>
                  <button type="button" className="inspector-row" onClick={() => { onSelectFinding(finding.id); }}>
                    <SeverityIcon weight="fill" className={`tone-${finding.severity.toLowerCase()}`} aria-hidden="true" />
                    <span>{finding.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h3>
          <ArrowUpLeftIcon weight="bold" aria-hidden="true" />
          Depends on
          <span className="count">{dependsOn.size}</span>
        </h3>
        <ul className="inspector-list">
          {[...dependsOn.entries()].map(([target, edges]) => (
            <li key={target}>
              <button type="button" className="inspector-row" onClick={() => { onInspect(target); }}>
                <code>{target}</code>
                <span className="muted">
                  {[...new Set(edges.map((e) => e.relationship.toLowerCase().replaceAll('_', ' ')))].join(', ')}
                </span>
                <span className="property-paths">{[...new Set(edges.map((e) => e.propertyPath))].join(', ')}</span>
              </button>
            </li>
          ))}
          {dependsOn.size === 0 && <li className="muted">Nothing in this template</li>}
        </ul>
      </section>

      <section>
        <h3>
          <ArrowDownRightIcon weight="bold" aria-hidden="true" />
          Depended on by
          <span className="count">{dependedOnBy.size}</span>
        </h3>
        <ul className="inspector-list">
          {[...dependedOnBy.entries()].map(([source, edges]) => (
            <li key={source}>
              <button type="button" className="inspector-row" onClick={() => { onInspect(source); }}>
                <code>{source}</code>
                <span className="muted">
                  {edgeLabel(edges.map((e) => e.relationship))}
                </span>
              </button>
            </li>
          ))}
          {dependedOnBy.size === 0 && <li className="muted">Nothing depends on it</li>}
        </ul>
      </section>
    </aside>
  );
}
