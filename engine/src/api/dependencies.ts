import { randomUUID } from 'node:crypto';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { explainFindings } from '../aws/bedrock/explain.ts';
import { fetchDeployedTemplate, fetchPhysicalIds, fetchStackEvents } from '../aws/cloudformation/stack.ts';
import { observeSignals } from '../aws/cloudwatch/collect.ts';
import { DynamoAnalysisRepository } from '../aws/dynamodb/repository.ts';
import type { ServiceDependencies } from './service.ts';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Builds the production dependencies from the Lambda environment. Clients are created once
 * per execution environment and reused across invocations.
 */
export function createDependencies(): ServiceDependencies {
  const cloudFormation = new CloudFormationClient({});
  const cloudWatch = new CloudWatchClient({});
  const cloudWatchLogs = new CloudWatchLogsClient({});
  const lambda = new LambdaClient({});
  const repository = new DynamoAnalysisRepository(new DynamoDBClient({}), requiredEnv('TABLE_NAME'));
  let bedrock: AnthropicBedrockMantle | undefined;

  return {
    repository,
    fetchDeployedTemplate: (stackName) => fetchDeployedTemplate(cloudFormation, stackName),
    fetchPhysicalIds: (stackName) => fetchPhysicalIds(cloudFormation, stackName),
    fetchStackEvents: (stackName, since) => fetchStackEvents(cloudFormation, stackName, since),
    observeSignals: (signals, physicalIds, windows) => observeSignals({ metrics: cloudWatch, logs: cloudWatchLogs }, signals, physicalIds, windows),
    requestExplanation: async (analysisId) => {
      await lambda.send(
        new InvokeCommand({
          FunctionName: requiredEnv('EXPLAIN_FUNCTION_NAME'),
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ analysisId })),
        }),
      );
    },
    explain: (findings, resourceIds) => {
      bedrock ??= new AnthropicBedrockMantle({ awsRegion: requiredEnv('BEDROCK_REGION') });
      return explainFindings(bedrock, requiredEnv('BEDROCK_MODEL_ID'), findings, resourceIds);
    },
    now: () => new Date(),
    newId: () => randomUUID(),
  };
}
