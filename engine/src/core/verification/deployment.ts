import type { TimeWindow } from '../../types/index.ts';

export interface StackEvent {
  readonly timestamp: Date;
  readonly logicalResourceId: string;
  readonly resourceType: string;
  readonly status: string;
}

export interface Deployment {
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly status: string;
}

const STACK_TYPE = 'AWS::CloudFormation::Stack';

/** Stack level statuses that end an update, whether it succeeded or rolled back. */
const TERMINAL_UPDATE_STATUSES = new Set([
  'UPDATE_COMPLETE',
  'UPDATE_FAILED',
  'UPDATE_ROLLBACK_COMPLETE',
  'UPDATE_ROLLBACK_FAILED',
]);

export type DeploymentLookup =
  | { readonly kind: 'FOUND'; readonly deployment: Deployment }
  | { readonly kind: 'NOT_STARTED' }
  | { readonly kind: 'IN_PROGRESS'; readonly startedAt: Date };

/**
 * Finds the first stack update that started after `after`, using the stack level events
 * CloudFormation records for the stack itself.
 */
export function findDeployment(events: readonly StackEvent[], stackName: string, after: Date): DeploymentLookup {
  const stackEvents = events
    .filter((e) => e.resourceType === STACK_TYPE && e.logicalResourceId === stackName)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const start = stackEvents.find(
    (e) => e.status === 'UPDATE_IN_PROGRESS' && e.timestamp.getTime() > after.getTime(),
  );
  if (start === undefined) {
    return { kind: 'NOT_STARTED' };
  }
  const end = stackEvents.find(
    (e) => TERMINAL_UPDATE_STATUSES.has(e.status) && e.timestamp.getTime() >= start.timestamp.getTime(),
  );
  if (end === undefined) {
    return { kind: 'IN_PROGRESS', startedAt: start.timestamp };
  }
  return {
    kind: 'FOUND',
    deployment: { startedAt: start.timestamp, completedAt: end.timestamp, status: end.status },
  };
}

const WINDOW_MS = 15 * 60 * 1000;

/**
 * The baseline is the fifteen minutes before the update started. The observation window
 * starts when the update completed and runs for fifteen minutes or until now, whichever
 * is earlier, so verifying soon after a deployment compares against a shorter window.
 */
export function verificationWindows(deployment: Deployment, now: Date): { baseline: TimeWindow; observed: TimeWindow } {
  const observedEnd = Math.min(deployment.completedAt.getTime() + WINDOW_MS, now.getTime());
  return {
    baseline: {
      start: new Date(deployment.startedAt.getTime() - WINDOW_MS).toISOString(),
      end: deployment.startedAt.toISOString(),
    },
    observed: {
      start: deployment.completedAt.toISOString(),
      end: new Date(Math.max(observedEnd, deployment.completedAt.getTime())).toISOString(),
    },
  };
}
