import type {
  CfnResource,
  CfnTemplate,
  ChangeSet,
  ReplacementRequirement,
  ResourceChange,
} from '../../types/index.ts';
import { REPLACEMENT_PROPERTIES } from './replacement.ts';

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

function changedPropertyNames(before: CfnResource, after: CfnResource): string[] {
  const beforeProps = before.Properties ?? {};
  const afterProps = after.Properties ?? {};
  const names = new Set([...Object.keys(beforeProps), ...Object.keys(afterProps)]);
  return [...names].filter((name) => !deepEqual(beforeProps[name], afterProps[name])).sort();
}

function modification(id: string, before: CfnResource, after: CfnResource): ResourceChange | undefined {
  if (before.Type !== after.Type) {
    return {
      resourceId: id,
      resourceType: after.Type,
      action: 'REPLACE',
      replacement: 'REQUIRED',
      changedProperties: changedPropertyNames(before, after),
      replacementCauses: ['Type'],
      before: before.Properties ?? {},
      after: after.Properties ?? {},
    };
  }

  const changedProperties = changedPropertyNames(before, after);
  if (changedProperties.length === 0) {
    return undefined;
  }

  const documented = REPLACEMENT_PROPERTIES[after.Type];
  const replacementCauses =
    documented === undefined ? [] : changedProperties.filter((name) => documented.has(name));
  const replacement: ReplacementRequirement =
    documented === undefined ? 'UNKNOWN' : replacementCauses.length > 0 ? 'REQUIRED' : 'NOT_REQUIRED';

  return {
    resourceId: id,
    resourceType: after.Type,
    action: replacement === 'REQUIRED' ? 'REPLACE' : 'UPDATE',
    replacement,
    changedProperties,
    replacementCauses,
    before: before.Properties ?? {},
    after: after.Properties ?? {},
  };
}

/**
 * Compares two templates resource by resource, keyed on logical ID. Changes to
 * `DependsOn`, `Condition` and resource policies are not reported here; only the resource
 * type and its properties determine whether a resource changed.
 */
export function compareTemplates(current: CfnTemplate, proposed: CfnTemplate): ChangeSet {
  const changes: ResourceChange[] = [];
  const ids = new Set([...Object.keys(current.Resources), ...Object.keys(proposed.Resources)]);

  for (const id of [...ids].sort()) {
    const before = current.Resources[id];
    const after = proposed.Resources[id];

    if (before === undefined && after !== undefined) {
      changes.push({
        resourceId: id,
        resourceType: after.Type,
        action: 'CREATE',
        replacement: 'NOT_REQUIRED',
        changedProperties: [],
        replacementCauses: [],
        after: after.Properties ?? {},
      });
    } else if (before !== undefined && after === undefined) {
      changes.push({
        resourceId: id,
        resourceType: before.Type,
        action: 'DELETE',
        replacement: 'NOT_REQUIRED',
        changedProperties: [],
        replacementCauses: [],
        before: before.Properties ?? {},
      });
    } else if (before !== undefined && after !== undefined) {
      const change = modification(id, before, after);
      if (change !== undefined) {
        changes.push(change);
      }
    }
  }

  return { changes };
}
