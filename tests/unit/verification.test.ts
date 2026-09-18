import { describe, expect, it } from 'vitest';
import { assessFinding, classifyMovement, overallStatus } from '../../engine/src/core/verification/assess.ts';
import { findDeployment, verificationWindows, type StackEvent } from '../../engine/src/core/verification/deployment.ts';
import { within } from '../../engine/src/aws/cloudwatch/collect.ts';
import { countPerMinute } from '../../engine/src/aws/cloudwatch/logs.ts';
import { CONNECTION_ERROR_PATTERN, databaseConnections, logPattern, targetErrors } from '../../engine/src/core/rules/signals.ts';

const connections = databaseConnections('Database');
const errors = targetErrors('LoadBalancer', 'TargetGroup');

describe('classifyMovement', () => {
  it('reports a fall in connections as a decrease', () => {
    expect(classifyMovement(connections, { baseline: [4, 4, 5], observed: [1, 0, 0] }).movement).toBe('DECREASED');
  });

  it('treats small changes on a quiet metric as unchanged', () => {
    expect(classifyMovement(connections, { baseline: [0.2], observed: [0.4] }).movement).toBe('UNCHANGED');
  });

  it('treats noise within the relative threshold as unchanged', () => {
    expect(classifyMovement(errors, { baseline: [100, 104], observed: [110, 112] }).movement).toBe('UNCHANGED');
  });

  it('reports missing observations as no data with a reason', () => {
    const observation = classifyMovement(errors, { baseline: [0, 0], observed: [] });
    expect(observation.movement).toBe('NO_DATA');
    expect(observation.note).toBe('No datapoints after the deployment yet');
  });
});

describe('assessFinding', () => {
  const moved = (movement: 'INCREASED' | 'DECREASED' | 'UNCHANGED' | 'NO_DATA', signal = connections) => ({
    signal,
    movement,
  });

  it('matches only when every signal with data moved as predicted', () => {
    expect(assessFinding('f', [moved('DECREASED'), moved('INCREASED', errors)]).status).toBe('MATCHED');
  });

  it('is unconfirmed when a signal stayed flat', () => {
    expect(assessFinding('f', [moved('DECREASED'), moved('UNCHANGED', errors)]).status).toBe('UNCONFIRMED');
  });

  it('is unconfirmed, not matched, when there is no data at all', () => {
    expect(assessFinding('f', [moved('NO_DATA'), moved('NO_DATA', errors)]).status).toBe('UNCONFIRMED');
  });

  it('is contradicted when any signal moved the other way', () => {
    expect(assessFinding('f', [moved('INCREASED'), moved('INCREASED', errors)]).status).toBe('CONTRADICTED');
  });

  it('reports the worst status across findings', () => {
    expect(
      overallStatus([
        { findingId: 'a', status: 'MATCHED', observations: [] },
        { findingId: 'b', status: 'UNCONFIRMED', observations: [] },
      ]),
    ).toBe('UNCONFIRMED');
  });
});

describe('findDeployment', () => {
  const at = (iso: string, status: string, logicalResourceId = 'adi-demo'): StackEvent => ({
    timestamp: new Date(iso),
    logicalResourceId,
    resourceType: logicalResourceId === 'adi-demo' ? 'AWS::CloudFormation::Stack' : 'AWS::EC2::SecurityGroup',
    status,
  });
  const analyzedAt = new Date('2026-09-19T10:00:00Z');

  it('finds the first update after the analysis and its terminal status', () => {
    const lookup = findDeployment(
      [
        at('2026-09-19T09:00:00Z', 'UPDATE_IN_PROGRESS'),
        at('2026-09-19T09:05:00Z', 'UPDATE_COMPLETE'),
        at('2026-09-19T10:10:00Z', 'UPDATE_IN_PROGRESS'),
        at('2026-09-19T10:10:30Z', 'UPDATE_IN_PROGRESS', 'DatabaseSecurityGroup'),
        at('2026-09-19T10:12:00Z', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS'),
        at('2026-09-19T10:12:30Z', 'UPDATE_COMPLETE'),
      ],
      'adi-demo',
      analyzedAt,
    );
    expect(lookup).toEqual({
      kind: 'FOUND',
      deployment: {
        startedAt: new Date('2026-09-19T10:10:00Z'),
        completedAt: new Date('2026-09-19T10:12:30Z'),
        status: 'UPDATE_COMPLETE',
      },
    });
  });

  it('reports an update that has not finished', () => {
    const lookup = findDeployment([at('2026-09-19T10:10:00Z', 'UPDATE_IN_PROGRESS')], 'adi-demo', analyzedAt);
    expect(lookup.kind).toBe('IN_PROGRESS');
  });

  it('ignores updates that happened before the analysis', () => {
    const lookup = findDeployment(
      [at('2026-09-19T09:00:00Z', 'UPDATE_IN_PROGRESS'), at('2026-09-19T09:05:00Z', 'UPDATE_COMPLETE')],
      'adi-demo',
      analyzedAt,
    );
    expect(lookup.kind).toBe('NOT_STARTED');
  });

  it('builds a fifteen minute baseline and caps the observation window at now', () => {
    const windows = verificationWindows(
      { startedAt: new Date('2026-09-19T10:10:00Z'), completedAt: new Date('2026-09-19T10:12:00Z'), status: 'UPDATE_COMPLETE' },
      new Date('2026-09-19T10:20:00Z'),
    );
    expect(windows).toEqual({
      baseline: { start: '2026-09-19T09:55:00.000Z', end: '2026-09-19T10:10:00.000Z' },
      observed: { start: '2026-09-19T10:12:00.000Z', end: '2026-09-19T10:20:00.000Z' },
    });
  });
});

describe('log pattern signals', () => {
  const logs = logPattern('LogGroup', CONNECTION_ERROR_PATTERN, 'Containers log connection errors');
  const windows = {
    baseline: { start: '2026-09-19T10:00:00.000Z', end: '2026-09-19T10:03:00.000Z' },
    observed: { start: '2026-09-19T10:05:00.000Z', end: '2026-09-19T10:07:00.000Z' },
  };
  const at = (iso: string) => Date.parse(iso);

  it('counts matches per minute in each window, with empty minutes as zero', () => {
    const samples = countPerMinute(
      [at('2026-09-19T10:00:10Z'), at('2026-09-19T10:05:01Z'), at('2026-09-19T10:05:40Z'), at('2026-09-19T10:06:59Z'), at('2026-09-19T10:04:00Z')],
      windows,
    );
    expect(samples).toEqual({ baseline: [1, 0, 0], observed: [2, 1] });
  });

  it('matches when errors appear after the deployment', () => {
    const observation = classifyMovement(logs, { baseline: [0, 0, 0], observed: [9, 12] });
    expect(observation.movement).toBe('INCREASED');
    expect(assessFinding('f', [observation]).status).toBe('MATCHED');
  });

  it('leaves the prediction unconfirmed when no errors appear', () => {
    const observation = classifyMovement(logs, { baseline: [0, 0, 0], observed: [0, 0] });
    expect(observation.movement).toBe('UNCHANGED');
    expect(assessFinding('f', [observation]).status).toBe('UNCONFIRMED');
  });
});

describe('metric datapoint windows', () => {
  const baseline = { start: '2026-09-18T14:02:32.000Z', end: '2026-09-18T14:17:32.000Z' };

  it('leaves the minute a deployment starts in out of the baseline', () => {
    expect(within(new Date('2026-09-18T14:16:00Z'), baseline)).toBe(true);
    expect(within(new Date('2026-09-18T14:17:00Z'), baseline)).toBe(false);
  });
});
