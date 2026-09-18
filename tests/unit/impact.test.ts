import { describe, expect, it } from 'vitest';
import { buildDependencyGraph } from '../../engine/src/core/graph/build.ts';
import { GraphIndex } from '../../engine/src/core/graph/query.ts';
import { propagateChanges } from '../../engine/src/core/impact/propagate.ts';
import type { ResourceChange } from '../../engine/src/types/index.ts';
import { BASELINE_TEMPLATE_PATH, loadTemplate } from '../helpers.ts';

const index = new GraphIndex(buildDependencyGraph(loadTemplate(BASELINE_TEMPLATE_PATH)));

function change(resourceId: string, action: ResourceChange['action']): ResourceChange {
  return {
    resourceId,
    resourceType: index.typeOf(resourceId) ?? '',
    action,
    replacement: 'NOT_REQUIRED',
    changedProperties: [],
    replacementCauses: [],
  };
}

describe('propagateChanges', () => {
  it('reaches the service from the database security group through the database', () => {
    const [impact] = propagateChanges(index, { changes: [change('DatabaseSecurityGroup', 'UPDATE')] });
    const byId = new Map(impact?.affected.map((a) => [a.resourceId, a]));

    expect(byId.get('Database')?.depth).toBe(1);
    expect(byId.get('TaskDefinition')?.depth).toBe(2);
    expect(byId.get('Service')?.path).toEqual([
      'DatabaseSecurityGroup',
      'Database',
      'TaskDefinition',
      'Service',
    ]);
    expect(impact?.blastRadius).toBe('APPLICATION');
  });

  it('records each affected resource once, at its shortest distance', () => {
    const [impact] = propagateChanges(index, { changes: [change('Database', 'UPDATE')] });
    const ids = impact?.affected.map((a) => a.resourceId) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    expect(impact?.affected.find((a) => a.resourceId === 'TaskDefinition')?.depth).toBe(1);
  });

  it('reports a local blast radius when nothing depends on the change', () => {
    const [impact] = propagateChanges(index, { changes: [change('Service', 'UPDATE')] });
    expect(impact).toMatchObject({ affected: [], blastRadius: 'LOCAL' });
  });

  it('skips created resources, which have no existing dependents', () => {
    expect(propagateChanges(index, { changes: [change('Service', 'CREATE')] })).toEqual([]);
  });
});
