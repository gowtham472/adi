import { describe, expect, it } from 'vitest';
import type { AnalysisRepository } from '../../engine/src/aws/dynamodb/repository.ts';
import { summarize } from '../../engine/src/aws/dynamodb/repository.ts';
import { HttpError } from '../../engine/src/api/http.ts';
import {
  createAnalysis,
  explainAnalysis,
  readCreateRequest,
  verifyAnalysis,
  type ServiceDependencies,
} from '../../engine/src/api/service.ts';
import type { AnalysisRecord, Explanation, VerificationRecord } from '../../engine/src/types/index.ts';
import { BASELINE_TEMPLATE_PATH, readRepositoryFile } from '../helpers.ts';

const baselineBody = readRepositoryFile(BASELINE_TEMPLATE_PATH);
const scenarioBody = readRepositoryFile('scenarios/01-rds-security-group/after.yaml');

class MemoryRepository implements AnalysisRepository {
  readonly records = new Map<string, AnalysisRecord>();
  save(record: AnalysisRecord) {
    this.records.set(record.analysisId, record);
    return Promise.resolve();
  }
  get(id: string) {
    return Promise.resolve(this.records.get(id));
  }
  list() {
    return Promise.resolve([...this.records.values()].map(summarize));
  }
  private update(id: string, patch: Partial<AnalysisRecord>) {
    const record = this.records.get(id);
    if (record !== undefined) {
      this.records.set(id, { ...record, ...patch });
    }
    return Promise.resolve();
  }
  recordExplanation(id: string, explanation: Explanation) {
    return this.update(id, { explanation, explanationStatus: 'READY' });
  }
  recordExplanationFailure(id: string, reason: string) {
    return this.update(id, { explanationError: reason, explanationStatus: 'FAILED' });
  }
  recordVerification(id: string, verification: VerificationRecord) {
    return this.update(id, { verification });
  }
}

function dependencies(overrides: Partial<ServiceDependencies> = {}): ServiceDependencies & { repository: MemoryRepository } {
  return {
    repository: new MemoryRepository(),
    fetchDeployedTemplate: () => Promise.resolve(baselineBody),
    fetchPhysicalIds: () => Promise.resolve(new Map()),
    fetchStackEvents: () => Promise.resolve([]),
    observeSignals: (signals) => Promise.resolve(signals.map((signal) => ({ signal, movement: 'NO_DATA' as const }))),
    requestExplanation: () => Promise.resolve(),
    explain: () => Promise.reject(new Error('not configured')),
    now: () => new Date('2026-09-19T10:00:00Z'),
    newId: () => 'analysis-1',
    ...overrides,
  } as ServiceDependencies & { repository: MemoryRepository };
}

describe('readCreateRequest', () => {
  it('requires either a stack name or a current template', () => {
    expect(() => readCreateRequest({ proposedTemplate: 'x' })).toThrow(HttpError);
  });

  it('rejects stack names CloudFormation would not accept', () => {
    expect(() => readCreateRequest({ proposedTemplate: 'x', stackName: '1-bad name' })).toThrow(/valid CloudFormation/);
  });
});

describe('createAnalysis', () => {
  it('compares against the deployed template and requests an explanation', async () => {
    const requested: string[] = [];
    const deps = dependencies({ requestExplanation: (id) => { requested.push(id); return Promise.resolve(); } });
    const record = await createAnalysis(deps, { proposedTemplate: scenarioBody, stackName: 'adi-demo' });
    expect(record.findings.map((f) => f.ruleId)).toEqual(['NET-SG-001']);
    expect(record.explanationStatus).toBe('PENDING');
    expect(requested).toEqual(['analysis-1']);
  });

  it('needs no explanation when nothing is found', async () => {
    const record = await createAnalysis(dependencies(), { proposedTemplate: baselineBody, currentTemplate: baselineBody });
    expect(record.explanationStatus).toBe('NOT_REQUIRED');
  });

  it('reports which template failed to parse', async () => {
    await expect(
      createAnalysis(dependencies(), { proposedTemplate: 'Resources: [', currentTemplate: baselineBody }),
    ).rejects.toThrow(/The proposed template is invalid/);
  });

  it('records a failure instead of losing the analysis when the explanation cannot be requested', async () => {
    const deps = dependencies({ requestExplanation: () => Promise.reject(new Error('throttled')) });
    const record = await createAnalysis(deps, { proposedTemplate: scenarioBody, currentTemplate: baselineBody });
    expect(record.explanationStatus).toBe('FAILED');
    expect(deps.repository.records.get('analysis-1')?.explanationError).toContain('throttled');
  });
});

describe('explainAnalysis', () => {
  it('stores a failure reason and leaves the findings untouched when the model call fails', async () => {
    const deps = dependencies();
    const created = await createAnalysis(deps, { proposedTemplate: scenarioBody, currentTemplate: baselineBody });
    await explainAnalysis(deps, created.analysisId);
    const stored = deps.repository.records.get(created.analysisId);
    expect(stored?.explanationStatus).toBe('FAILED');
    expect(stored?.explanationError).toBe('not configured');
    expect(stored?.findings).toEqual(created.findings);
  });
});

describe('verifyAnalysis', () => {
  it('asks for a deployment when the stack has not been updated since the analysis', async () => {
    const deps = dependencies();
    await createAnalysis(deps, { proposedTemplate: scenarioBody, stackName: 'adi-demo' });
    await expect(verifyAnalysis(deps, 'analysis-1')).rejects.toThrow(/Deploy the proposed template/);
  });

  it('measures the first update after the analysis and stores the result', async () => {
    const deps = dependencies({
      fetchStackEvents: () =>
        Promise.resolve([
          { timestamp: new Date('2026-09-19T10:05:00Z'), logicalResourceId: 'adi-demo', resourceType: 'AWS::CloudFormation::Stack', status: 'UPDATE_IN_PROGRESS' },
          { timestamp: new Date('2026-09-19T10:07:00Z'), logicalResourceId: 'adi-demo', resourceType: 'AWS::CloudFormation::Stack', status: 'UPDATE_COMPLETE' },
        ]),
    });
    await createAnalysis(deps, { proposedTemplate: scenarioBody, stackName: 'adi-demo' });
    const verification = await verifyAnalysis(deps, 'analysis-1');
    expect(verification.deployment.completedAt).toBe('2026-09-19T10:07:00.000Z');
    expect(verification.findings[0]?.status).toBe('UNCONFIRMED');
    expect(deps.repository.records.get('analysis-1')?.verification).toEqual(verification);
  });
});
