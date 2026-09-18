import { describe, expect, it } from 'vitest';
import { createAnalysis, readCreateRequest } from '../../engine/src/api/service.ts';
import { MemoryAnalysisRepository } from '../../engine/src/api/memory-repository.ts';
import type { ServiceDependencies } from '../../engine/src/api/service.ts';
import { applyReportedReplacements } from '../../engine/src/core/diff/change-set.ts';
import { analyzeTemplates } from '../../engine/src/core/pipeline.ts';
import type { ReportedChange, ResourceChange } from '../../engine/src/types/index.ts';
import { BASELINE_TEMPLATE_PATH, loadTemplate, readRepositoryFile } from '../helpers.ts';

const change = (overrides: Partial<ResourceChange>): ResourceChange => ({
  resourceId: 'Queue',
  resourceType: 'AWS::SQS::Queue',
  action: 'UPDATE',
  replacement: 'UNKNOWN',
  changedProperties: ['QueueName'],
  replacementCauses: [],
  ...overrides,
});
const reported = (replacement: ReportedChange['replacement'], recreationCauses: string[] = []): ReportedChange => ({
  resourceId: 'Queue',
  replacement,
  recreationCauses,
});

describe('applyReportedReplacements', () => {
  it('takes a replacement the documented table does not know from the change set', () => {
    const [result] = applyReportedReplacements({ changes: [change({})] }, [reported('True', ['QueueName'])]).changes;
    expect(result).toMatchObject({ action: 'REPLACE', replacement: 'REQUIRED', replacementCauses: ['QueueName'], replacementSource: 'CHANGE_SET' });
  });

  it('overrides the table when the change set says no replacement happens', () => {
    const [result] = applyReportedReplacements(
      { changes: [change({ action: 'REPLACE', replacement: 'REQUIRED', replacementCauses: ['QueueName'] })] },
      [reported('False')],
    ).changes;
    expect(result).toMatchObject({ action: 'UPDATE', replacement: 'NOT_REQUIRED', replacementCauses: [] });
  });

  it('keeps the engine decision when CloudFormation can only say conditional', () => {
    const original = change({});
    expect(applyReportedReplacements({ changes: [original] }, [reported('Conditional')]).changes[0]).toBe(original);
  });

  it('falls back to the changed properties when the change set names no cause', () => {
    const [result] = applyReportedReplacements({ changes: [change({})] }, [reported('True')]).changes;
    expect(result?.replacementCauses).toEqual(['QueueName']);
  });
});

describe('RDS-REP-001 with a change set', () => {
  it('cites the change set instead of the documentation table', () => {
    const result = analyzeTemplates(
      loadTemplate(BASELINE_TEMPLATE_PATH),
      loadTemplate('scenarios/05-rds-replacement/after.yaml'),
      [{ resourceId: 'Database', replacement: 'True', recreationCauses: ['DBInstanceIdentifier'] }],
    );
    const evidence = result.findings.find((f) => f.ruleId === 'RDS-REP-001')?.evidence ?? [];
    expect(evidence.some((e) => e.source === 'CHANGE_SET' && e.fact.includes('Replacement: True'))).toBe(true);
    expect(evidence.some((e) => e.fact.includes('documented as "Update requires: Replacement"'))).toBe(false);
  });
});

describe('analysis from a change set', () => {
  it('accepts a change set name with its stack, and nothing else', () => {
    expect(readCreateRequest({ stackName: 'adi-demo', changeSetName: 'scenario-01' })).toEqual({
      stackName: 'adi-demo',
      changeSetName: 'scenario-01',
    });
    expect(() => readCreateRequest({ changeSetName: 'scenario-01' })).toThrow(/needs the stackName/);
    expect(() => readCreateRequest({ stackName: 'adi-demo', changeSetName: 'x', proposedTemplate: 'y' })).toThrow(
      /send changeSetName without templates/,
    );
  });

  it('reads the proposed template from the change set and records its name', async () => {
    const deps = {
      repository: new MemoryAnalysisRepository(),
      fetchDeployedTemplate: () => Promise.resolve(readRepositoryFile(BASELINE_TEMPLATE_PATH)),
      fetchChangeSet: () =>
        Promise.resolve({ template: readRepositoryFile('scenarios/01-rds-security-group/after.yaml'), changes: [] }),
      requestExplanation: () => Promise.resolve(),
      now: () => new Date('2026-09-19T10:00:00Z'),
      newId: () => 'analysis-1',
    } as unknown as ServiceDependencies;
    const record = await createAnalysis(deps, { stackName: 'adi-demo', changeSetName: 'scenario-01' });
    expect(record.changeSetName).toBe('scenario-01');
    expect(record.findings.map((f) => f.ruleId)).toEqual(['NET-SG-001']);
  });
});
