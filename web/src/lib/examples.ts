/**
 * The demonstration baseline and scenario templates, bundled at build time so the
 * dashboard can load a scenario without the visitor having the files.
 */
import baseline from '../../../infrastructure/demo/baseline.yaml?raw';

const proposed = import.meta.glob<string>('../../../scenarios/*/after.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const expectations = import.meta.glob<{ description: string }>('../../../scenarios/*/expected.json', {
  import: 'default',
  eager: true,
});

export interface Example {
  readonly id: string;
  readonly label: string;
  readonly description: string;
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
    return {
      id,
      label: LABELS[id] ?? id,
      description: expected?.description ?? '',
      proposedTemplate: template,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
