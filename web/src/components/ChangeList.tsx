import { ArrowsClockwiseIcon, PencilSimpleIcon, TargetIcon } from '@phosphor-icons/react';
import { stringify } from 'yaml';
import type { ChangeImpact, ChangeSet } from '@adi/engine/types';
import { plural } from '../lib/format.ts';
import { ResourceGlyph } from '../lib/icons.tsx';
import { ActionBadge } from './Badges.tsx';

/** Values are shown as YAML, the form most CloudFormation authors read templates in. */
function render(value: unknown): string {
  if (value === undefined) {
    return 'not set';
  }
  return typeof value === 'string' ? value : stringify(value, { lineWidth: 0 }).trimEnd();
}

const REPLACEMENT_LABEL = {
  REQUIRED: 'Replacement required',
  NOT_REQUIRED: 'Updated in place',
  UNKNOWN: 'Replacement not documented for this type',
} as const;

export function ChangeList({ changeSet, impacts }: { changeSet: ChangeSet; impacts: readonly ChangeImpact[] }) {
  if (changeSet.changes.length === 0) {
    return <p className="empty">The proposed template is identical to the current one.</p>;
  }
  const impactById = new Map(impacts.map((i) => [i.resourceId, i]));

  return (
    <ul className="change-list">
      {changeSet.changes.map((change) => {
        const impact = impactById.get(change.resourceId);
        return (
          <li key={change.resourceId} className="change-item">
            <header className="change-heading">
              <span className="icon-tile">
                <ResourceGlyph type={change.resourceType} weight="bold" aria-hidden="true" />
              </span>
              <span className="change-name">
                <code>{change.resourceId}</code>
                <span className="muted">{change.resourceType}</span>
              </span>
              <ActionBadge action={change.action} />
            </header>
            <div className="change-facts">
              {change.action !== 'CREATE' && change.action !== 'DELETE' && (
                <span>
                  {change.replacement === 'REQUIRED' ? (
                    <ArrowsClockwiseIcon weight="bold" aria-hidden="true" />
                  ) : (
                    <PencilSimpleIcon weight="bold" aria-hidden="true" />
                  )}
                  {REPLACEMENT_LABEL[change.replacement]}
                  {change.replacementCauses.length > 0 && ` by ${change.replacementCauses.join(', ')}`}
                </span>
              )}
              {impact !== undefined && (
                <span>
                  <TargetIcon weight="bold" aria-hidden="true" />
                  Reaches {plural(impact.affected.length, 'resource')}, {impact.blastRadius.toLowerCase()} blast radius
                </span>
              )}
            </div>
            {change.changedProperties.map((name) => (
              <div key={name} className="property-diff">
                <code className="property-name">{name}</code>
                <div className="diff-panes">
                  <div className="diff-pane before">
                    <span className="diff-label">Current</span>
                    <pre>{render(change.before?.[name])}</pre>
                  </div>
                  <div className="diff-pane after">
                    <span className="diff-label">Proposed</span>
                    <pre>{render(change.after?.[name])}</pre>
                  </div>
                </div>
              </div>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
