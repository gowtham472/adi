import { createDependencies } from '../dependencies.ts';
import { stackNameFromEvent } from '../events.ts';
import { verifyPendingAnalyses, type AutomaticVerification, type ServiceDependencies } from '../service.ts';

let dependencies: ServiceDependencies | undefined;

/**
 * Invoked by the verification state machine, which EventBridge starts when an update of
 * the analyzed stack completes and which waits for CloudWatch to collect data first. The
 * input is the original CloudFormation Stack Status Change event.
 */
export async function handler(event: unknown): Promise<AutomaticVerification[]> {
  const stackName = stackNameFromEvent(event);
  if (stackName === undefined) {
    console.error('Automatic verification invoked without a stack event', event);
    return [];
  }
  dependencies ??= createDependencies();
  // The results become the state machine execution's output, visible in the console.
  return verifyPendingAnalyses(dependencies, stackName);
}
