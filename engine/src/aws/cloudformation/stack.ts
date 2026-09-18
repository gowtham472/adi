import {
  GetTemplateCommand,
  paginateDescribeStackEvents,
  paginateListStackResources,
  type CloudFormationClient,
} from '@aws-sdk/client-cloudformation';
import type { StackEvent } from '../../core/verification/deployment.ts';

/**
 * Returns the template the stack was last deployed with. `Original` returns the template
 * as submitted, which is what a proposed template should be compared against.
 */
export async function fetchDeployedTemplate(client: CloudFormationClient, stackName: string): Promise<string> {
  const response = await client.send(new GetTemplateCommand({ StackName: stackName, TemplateStage: 'Original' }));
  if (response.TemplateBody === undefined) {
    throw new Error(`Stack ${stackName} returned no template body`);
  }
  return response.TemplateBody;
}

/** Maps each logical ID in the stack to the physical identifier CloudFormation assigned it. */
export async function fetchPhysicalIds(client: CloudFormationClient, stackName: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for await (const page of paginateListStackResources({ client }, { StackName: stackName })) {
    for (const resource of page.StackResourceSummaries ?? []) {
      if (resource.LogicalResourceId !== undefined && resource.PhysicalResourceId !== undefined) {
        ids.set(resource.LogicalResourceId, resource.PhysicalResourceId);
      }
    }
  }
  return ids;
}

/**
 * Reads stack events newer than `since`. CloudFormation returns events newest first, so
 * paging stops at the first page that reaches back past `since`.
 */
export async function fetchStackEvents(client: CloudFormationClient, stackName: string, since: Date): Promise<StackEvent[]> {
  const events: StackEvent[] = [];
  for await (const page of paginateDescribeStackEvents({ client }, { StackName: stackName })) {
    let reachedSince = false;
    for (const event of page.StackEvents ?? []) {
      if (event.Timestamp === undefined) {
        continue;
      }
      if (event.Timestamp.getTime() < since.getTime()) {
        reachedSince = true;
        continue;
      }
      events.push({
        timestamp: event.Timestamp,
        logicalResourceId: event.LogicalResourceId ?? '',
        resourceType: event.ResourceType ?? '',
        status: event.ResourceStatus ?? '',
      });
    }
    if (reachedSince) {
      break;
    }
  }
  return events;
}
