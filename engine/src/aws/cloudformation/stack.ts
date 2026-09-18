import {
  DescribeChangeSetCommand,
  GetTemplateCommand,
  paginateDescribeStackEvents,
  paginateListStackResources,
  type CloudFormationClient,
} from '@aws-sdk/client-cloudformation';
import type { StackEvent } from '../../core/verification/deployment.ts';
import type { ReportedChange } from '../../types/index.ts';

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

export interface StackChangeSet {
  /** The template the change set would deploy, as submitted. */
  readonly template: string;
  readonly changes: readonly ReportedChange[];
}

/**
 * Reads a change set that has already been created on the stack: the template it would
 * deploy and CloudFormation's replacement decision for each modified resource. Reading a
 * change set does not execute it.
 */
export async function fetchChangeSet(client: CloudFormationClient, stackName: string, changeSetName: string): Promise<StackChangeSet> {
  const changes: ReportedChange[] = [];
  let nextToken: string | undefined;
  do {
    const page = await client.send(
      new DescribeChangeSetCommand({ StackName: stackName, ChangeSetName: changeSetName, NextToken: nextToken }),
    );
    if (page.Status !== 'CREATE_COMPLETE') {
      throw new Error(`Change set ${changeSetName} is ${page.Status ?? 'in an unknown state'}: ${page.StatusReason ?? 'no reason given'}`);
    }
    for (const { ResourceChange: change } of page.Changes ?? []) {
      if (change?.Action !== 'Modify' || change.LogicalResourceId === undefined || change.Replacement === undefined) {
        continue;
      }
      changes.push({
        resourceId: change.LogicalResourceId,
        replacement: change.Replacement,
        recreationCauses: (change.Details ?? [])
          .filter((d) => d.Target?.Attribute === 'Properties' && d.Target.RequiresRecreation === 'Always')
          .flatMap((d) => (d.Target?.Name === undefined ? [] : [d.Target.Name])),
      });
    }
    nextToken = page.NextToken;
  } while (nextToken !== undefined);

  const response = await client.send(
    new GetTemplateCommand({ StackName: stackName, ChangeSetName: changeSetName, TemplateStage: 'Original' }),
  );
  if (response.TemplateBody === undefined) {
    throw new Error(`Change set ${changeSetName} returned no template body`);
  }
  return { template: response.TemplateBody, changes: [...new Map(changes.map((c) => [c.resourceId, c])).values()] };
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
