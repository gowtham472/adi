import type { ChangeSet, ReportedChange, ResourceChange } from '../../types/index.ts';

function withReportedReplacement(change: ResourceChange, reported: ReportedChange): ResourceChange {
  if (reported.replacement === 'True') {
    const causes =
      reported.recreationCauses.length > 0
        ? reported.recreationCauses
        : change.replacementCauses.length > 0
          ? change.replacementCauses
          : change.changedProperties;
    return { ...change, action: 'REPLACE', replacement: 'REQUIRED', replacementCauses: causes, replacementSource: 'CHANGE_SET' };
  }
  return { ...change, action: 'UPDATE', replacement: 'NOT_REQUIRED', replacementCauses: [], replacementSource: 'CHANGE_SET' };
}

/**
 * Replaces the engine's replacement decision with CloudFormation's wherever a change set
 * gives a definite one. `Conditional` means CloudFormation cannot tell until it runs, so
 * the documented table's answer stands. Creations and deletions are unaffected.
 */
export function applyReportedReplacements(changeSet: ChangeSet, reported: readonly ReportedChange[]): ChangeSet {
  const byId = new Map(reported.map((r) => [r.resourceId, r]));
  return {
    changes: changeSet.changes.map((change) => {
      const report = byId.get(change.resourceId);
      const modified = change.action === 'UPDATE' || change.action === 'REPLACE';
      return report === undefined || !modified || report.replacement === 'Conditional'
        ? change
        : withReportedReplacement(change, report);
    }),
  };
}
