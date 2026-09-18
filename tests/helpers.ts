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
