/**
 * The demonstration baseline and scenario templates, bundled at build time so the
 * dashboard can load a scenario without the visitor having the files. The rule and
 * severity shown for each come from the scenario's expected.json, the same file the
 * scenario tests assert against.
 */
import type { Severity } from '@adi/engine/types';
import baseline from '../../../infrastructure/demo/baseline.yaml?raw';

interface ExpectedScenario {
  readonly description: string;
  readonly changes: readonly { readonly resourceId: string }[];
  readonly findings: readonly { readonly ruleId: string; readonly severity: Severity }[];
}

const proposed = import.meta.glob<string>('../../../scenarios/*/after.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const expectations = import.meta.glob<ExpectedScenario>('../../../scenarios/*/expected.json', {
  import: 'default',
  eager: true,
});

export interface Example {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly ruleId: string | undefined;
  readonly severity: Severity | undefined;
  readonly changedResource: string | undefined;
  readonly proposedTemplate: string;
}

const LABELS: Readonly<Record<string, string>> = {
  '01-rds-security-group': 'Database port typo',
  '02-iam-policy-removal': 'Secret permission removed',
  '03-alb-health-check': 'Health check path changed',
  '04-ecs-memory-reduction': 'Task memory halved',
  '05-rds-replacement': 'Database renamed',
  '06-orphaned-reference': 'Listener deleted',
};

export const BASELINE_TEMPLATE = baseline;

export const EXAMPLES: readonly Example[] = Object.entries(proposed)
  .map(([path, template]) => {
    const id = path.split('/').at(-2) ?? path;
    const expected = expectations[path.replace('after.yaml', 'expected.json')];
    const finding = expected?.findings[0];
    return {
      id,
      label: LABELS[id] ?? id,
      description: expected?.description ?? '',
      ruleId: finding?.ruleId,
      severity: finding?.severity,
      changedResource: expected?.changes[0]?.resourceId,
      proposedTemplate: template,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
