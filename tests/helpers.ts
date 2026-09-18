import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTemplate } from '../engine/src/aws/cloudformation/parse.ts';
import type { CfnTemplate } from '../engine/src/types/index.ts';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

export function loadTemplate(relativePath: string): CfnTemplate {
  return parseTemplate(readRepositoryFile(relativePath));
}

export const BASELINE_TEMPLATE_PATH = 'infrastructure/demo/baseline.yaml';

type MutableTemplate = {
  Resources: Record<string, { Type: string; Properties?: Record<string, unknown>; [key: string]: unknown }>;
};

/**
 * Returns a deep copy of the demo baseline with `edit` applied, so each rule test can state
 * its one change inline instead of maintaining another template file.
 */
export function editBaseline(edit: (template: MutableTemplate) => void): CfnTemplate {
  const copy = structuredClone(loadTemplate(BASELINE_TEMPLATE_PATH)) as unknown as MutableTemplate;
  edit(copy);
  return copy;
}

/** Properties of a resource in a mutable template, failing loudly if it does not exist. */
export function propertiesOf(template: MutableTemplate, id: string): Record<string, unknown> {
  const resource = template.Resources[id];
  if (resource === undefined) {
    throw new Error(`Resource ${id} is not in the template`);
  }
  resource.Properties ??= {};
  return resource.Properties;
}
