import { stringify } from 'yaml';
import type { ChangeSet, ChangeImpact } from '@adi/engine/types';
import { plural } from '../lib/format.ts';
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
            <div className="change-heading">
              <ActionBadge action={change.action} />
              <code className="change-id">{change.resourceId}</code>
              <span className="muted">{change.resourceType}</span>
            </div>
            <div className="change-facts">
              {change.action !== 'CREATE' && change.action !== 'DELETE' && <span>{REPLACEMENT_LABEL[change.replacement]}</span>}
              {change.replacementCauses.length > 0 && <span>Caused by {change.replacementCauses.join(', ')}</span>}
              {impact !== undefined && (
                <span>
                  Reaches {plural(impact.affected.length, 'resource')}, blast radius {impact.blastRadius.toLowerCase()}
                </span>
              )}
            </div>
            {change.changedProperties.length > 0 && (
              <table className="property-diff">
                <colgroup>
                  <col className="property-column" />
                  <col />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Current</th>
                    <th>Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {change.changedProperties.map((name) => (
                    <tr key={name}>
                      <td>
                        <code>{name}</code>
                      </td>
                      <td>
                        <pre>{render(change.before?.[name])}</pre>
                      </td>
                      <td>
                        <pre>{render(change.after?.[name])}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        );
      })}
    </ul>
  );
}
