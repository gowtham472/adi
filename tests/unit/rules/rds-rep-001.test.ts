import { describe, expect, it } from 'vitest';
import { analyzeTemplates } from '../../../engine/src/core/pipeline.ts';
import { BASELINE_TEMPLATE_PATH, editBaseline, loadTemplate, propertiesOf } from '../../helpers.ts';

const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);

function findingFor(edit: Parameters<typeof editBaseline>[0]) {
  return analyzeTemplates(baseline, editBaseline(edit)).findings.find((f) => f.ruleId === 'RDS-REP-001');
}

describe('RDS-REP-001', () => {
  it('stays silent for a change that does not require replacement', () => {
    expect(
      findingFor((t) => {
        propertiesOf(t, 'Database')['DBInstanceClass'] = 'db.t4g.small';
      }),
    ).toBeUndefined();
  });

  it('does not claim data deletion when the replace policy is Snapshot', () => {
    const current = editBaseline((t) => {
      const database = t.Resources['Database'];
      if (database !== undefined) {
        database['UpdateReplacePolicy'] = 'Snapshot';
      }
    });
    const proposed = editBaseline((t) => {
      const database = t.Resources['Database'];
      if (database !== undefined) {
        database['UpdateReplacePolicy'] = 'Snapshot';
      }
      propertiesOf(t, 'Database')['StorageEncrypted'] = true;
    });
    const finding = analyzeTemplates(current, proposed).findings.find((f) => f.ruleId === 'RDS-REP-001');
    expect(finding?.title).toBe('Database will be replaced by a new DB instance');
    expect(finding?.evidence.some((e) => e.propertyPath === 'UpdateReplacePolicy')).toBe(false);
  });

  it('warns that an explicit identifier makes the replacement fail', () => {
    const current = editBaseline((t) => {
      propertiesOf(t, 'Database')['DBInstanceIdentifier'] = 'orders';
    });
    const proposed = editBaseline((t) => {
      propertiesOf(t, 'Database')['DBInstanceIdentifier'] = 'orders';
      propertiesOf(t, 'Database')['MasterUsername'] = 'admin2';
    });
    const finding = analyzeTemplates(current, proposed).findings.find((f) => f.ruleId === 'RDS-REP-001');
    expect(finding?.evidence.map((e) => e.fact)).toContain(
      'If DBInstanceIdentifier is specified, updates that require replacement of the DB instance cannot be performed, so the stack update fails.',
    );
  });
});
