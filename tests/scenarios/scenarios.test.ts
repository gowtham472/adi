import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeTemplates } from '../../engine/src/core/pipeline.ts';
import type { VerificationSignal } from '../../engine/src/types/index.ts';
import {
  BASELINE_TEMPLATE_PATH,
  loadTemplate,
  readRepositoryFile,
  REPOSITORY_ROOT,
} from '../helpers.ts';

interface ExpectedScenario {
  readonly description: string;
  readonly changes: readonly { readonly resourceId: string; readonly action: string }[];
  readonly findings: readonly {
    readonly ruleId: string;
    readonly severity: string;
    readonly changedResource: string;
    readonly causalPath: readonly string[];
    readonly affectedResources: readonly string[];
    readonly signals: readonly string[];
  }[];
}

function signalKey(signal: VerificationSignal): string {
  return signal.kind === 'METRIC'
    ? `${signal.namespace}:${signal.metricName}`
    : `LOG:${signal.pattern}`;
}

// Empty directories are skipped because version control cannot hold them. Any directory
// with files is a scenario, and a scenario missing expected.json fails loudly below.
const scenariosRoot = resolve(REPOSITORY_ROOT, 'scenarios');
const scenarioNames = readdirSync(scenariosRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && readdirSync(resolve(scenariosRoot, entry.name)).length > 0)
  .map((entry) => entry.name)
  .sort();

const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);

describe.each(scenarioNames)('scenario %s', (name) => {
  const expected = JSON.parse(
    readRepositoryFile(`scenarios/${name}/expected.json`),
  ) as ExpectedScenario;
  const result = analyzeTemplates(baseline, loadTemplate(`scenarios/${name}/after.yaml`));

  it('changes exactly the intended resources', () => {
    // An exact match catches drift: if the baseline changes and a scenario template is not
    // regenerated, unrelated resources appear here and the scenario stops being a clean test.
    expect(result.changeSet.changes.map((c) => ({ resourceId: c.resourceId, action: c.action }))).toEqual(
      expected.changes,
    );
  });

  it('produces exactly the expected findings', () => {
    expect(result.findings.map((f) => f.ruleId)).toEqual(expected.findings.map((f) => f.ruleId));
  });

  it.each(expected.findings.map((finding) => [finding.ruleId, finding] as const))(
    '%s has the expected severity, causal path, affected resources and signals',
    (ruleId, expectedFinding) => {
      const finding = result.findings.find((f) => f.ruleId === ruleId);
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(expectedFinding.severity);
      expect(finding?.changedResource).toBe(expectedFinding.changedResource);
      expect(finding?.causalPath).toEqual(expectedFinding.causalPath);
      expect([...(finding?.affectedResources ?? [])].sort()).toEqual(
        [...expectedFinding.affectedResources].sort(),
      );
      expect(finding?.verificationSignals.map(signalKey).sort()).toEqual(
        [...expectedFinding.signals].sort(),
      );
    },
  );

  it('backs every finding with evidence from more than one source', () => {
    for (const finding of result.findings) {
      expect(new Set(finding.evidence.map((e) => e.source)).size).toBeGreaterThan(1);
      for (const evidence of finding.evidence.filter((e) => e.source === 'AWS_DOCUMENTATION')) {
        expect(evidence.reference).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
      }
    }
  });
});
