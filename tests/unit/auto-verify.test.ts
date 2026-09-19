import { describe, expect, it } from 'vitest';
import { stackNameFromEvent } from '../../engine/src/api/events.ts';
import { MemoryAnalysisRepository } from '../../engine/src/api/memory-repository.ts';
import { createAnalysis, verifyPendingAnalyses, type ServiceDependencies } from '../../engine/src/api/service.ts';
import type { StackEvent } from '../../engine/src/core/verification/deployment.ts';
import { BASELINE_TEMPLATE_PATH, readRepositoryFile } from '../helpers.ts';

const baselineBody = readRepositoryFile(BASELINE_TEMPLATE_PATH);
const scenarioBody = readRepositoryFile('scenarios/01-rds-security-group/after.yaml');

/** The shape CloudFormation sends to EventBridge, from the CloudFormation user guide. */
const stackEvent = (stackId: string) => ({
  version: '0',
  'detail-type': 'CloudFormation Stack Status Change',
  source: 'aws.cloudformation',
  detail: { 'stack-id': stackId, 'status-details': { status: 'UPDATE_COMPLETE', 'status-reason': '' } },
});

describe('stackNameFromEvent', () => {
  it('reads the stack name from the stack ID', () => {
    const event = stackEvent('arn:aws:cloudformation:ap-south-1:111122223333:stack/adi-demo/0f1e2d3c-aaaa-bbbb-cccc-1234567890ab');
    expect(stackNameFromEvent(event)).toBe('adi-demo');
  });

  it('returns nothing for input that is not a stack event', () => {
    expect(stackNameFromEvent({})).toBeUndefined();
    expect(stackNameFromEvent({ detail: { 'stack-id': 42 } })).toBeUndefined();
    expect(stackNameFromEvent(null)).toBeUndefined();
  });
});

describe('verifyPendingAnalyses', () => {
  const update = (start: string, end: string): StackEvent[] => [
    { timestamp: new Date(start), logicalResourceId: 'adi-demo', resourceType: 'AWS::CloudFormation::Stack', status: 'UPDATE_IN_PROGRESS' },
    { timestamp: new Date(end), logicalResourceId: 'adi-demo', resourceType: 'AWS::CloudFormation::Stack', status: 'UPDATE_COMPLETE' },
  ];

  function dependencies(events: StackEvent[]) {
    let id = 0;
    let now = new Date('2026-09-19T10:00:00Z');
    const deps = {
      repository: new MemoryAnalysisRepository(),
      fetchDeployedTemplate: () => Promise.resolve(baselineBody),
      fetchChangeSet: () => Promise.reject(new Error('not configured')),
      fetchPhysicalIds: () => Promise.resolve(new Map()),
      fetchStackEvents: () => Promise.resolve(events),
      observeSignals: (signals) =>
        Promise.resolve(signals.map((signal) => ({ signal, movement: 'NO_DATA' as const }))),
      requestExplanation: () => Promise.resolve(),
      explain: () => Promise.reject(new Error('not configured')),
      now: () => now,
      newId: () => `analysis-${String(++id)}`,
    } as ServiceDependencies & { repository: MemoryAnalysisRepository };
    return { deps, setNow: (iso: string) => { now = new Date(iso); } };
  }

  it('verifies pending analyses of the updated stack and marks them automatic', async () => {
    const { deps, setNow } = dependencies(update('2026-09-19T10:05:00Z', '2026-09-19T10:06:00Z'));
    await createAnalysis(deps, { stackName: 'adi-demo', proposedTemplate: scenarioBody });
    await createAnalysis(deps, { currentTemplate: baselineBody, proposedTemplate: scenarioBody });
    setNow('2026-09-19T10:12:00Z');

    const results = await verifyPendingAnalyses(deps, 'adi-demo');

    expect(results).toEqual([{ analysisId: 'analysis-1', outcome: 'UNCONFIRMED' }]);
    expect(deps.repository.records.get('analysis-1')?.verification?.trigger).toBe('AUTOMATIC');
    expect(deps.repository.records.get('analysis-2')?.verification).toBeUndefined();
  });

  it('leaves analyses of other stacks and already verified analyses alone', async () => {
    const { deps, setNow } = dependencies(update('2026-09-19T10:05:00Z', '2026-09-19T10:06:00Z'));
    await createAnalysis(deps, { stackName: 'adi-demo', proposedTemplate: scenarioBody });
    await createAnalysis(deps, { stackName: 'another-stack', proposedTemplate: scenarioBody });
    setNow('2026-09-19T10:12:00Z');
    await verifyPendingAnalyses(deps, 'adi-demo');

    expect(await verifyPendingAnalyses(deps, 'adi-demo')).toEqual([]);
    expect(deps.repository.records.get('analysis-2')?.verification).toBeUndefined();
  });

  it('skips an analysis whose deployment has not started, with the reason', async () => {
    const { deps } = dependencies([]);
    await createAnalysis(deps, { stackName: 'adi-demo', proposedTemplate: scenarioBody });

    const [result] = await verifyPendingAnalyses(deps, 'adi-demo');

    expect(result?.outcome).toMatch(/^SKIPPED: No update of adi-demo has started/);
    expect(deps.repository.records.get('analysis-1')?.verification).toBeUndefined();
  });
});
