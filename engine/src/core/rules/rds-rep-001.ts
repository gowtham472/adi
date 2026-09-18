import type { Evidence, VerificationSignal } from '../../types/index.ts';
import { documentationEvidence, edgeEvidence, formatValue } from '../evidence/facts.ts';
import { unique } from '../graph/query.ts';
import { findingId, type Rule } from './rule.ts';
import {
  consumerFailureSignals,
  databaseConnections,
  dedupeSignals,
  RESOURCE_TYPES,
} from './signals.ts';

const RULE_ID = 'RDS-REP-001';

const DB_INSTANCE_URL =
  'https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbinstance.html';
const UPDATE_BEHAVIOR_URL =
  'https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html';
const UPDATE_REPLACE_POLICY_URL =
  'https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-updatereplacepolicy.html';

export const rdsRep001: Rule = {
  id: RULE_ID,
  evaluate(context) {
    const { change } = context;
    if (change.resourceType !== RESOURCE_TYPES.database || change.replacement !== 'REQUIRED') {
      return undefined;
    }
    const database = change.resourceId;

    const evidence: Evidence[] = change.replacementCauses.map((property) => ({
      source: 'DIFF',
      fact: `${property} changes from ${formatValue(change.before?.[property])} to ${formatValue(change.after?.[property])}`,
      resourceId: database,
      propertyPath: property,
    }));
    evidence.push(
      change.replacementSource === 'CHANGE_SET'
        ? {
            source: 'CHANGE_SET',
            fact: `The CloudFormation change set reports Replacement: True for ${database}, caused by ${change.replacementCauses.join(', ')}`,
            resourceId: database,
          }
        : documentationEvidence(
            `${change.replacementCauses.join(', ')} ${change.replacementCauses.length === 1 ? 'is' : 'are'} documented as "Update requires: Replacement" for AWS::RDS::DBInstance`,
            DB_INSTANCE_URL,
          ),
      documentationEvidence(
        'Replacement creates a new DB instance with a new physical ID, points dependent resources at it, and then removes the old instance.',
        UPDATE_BEHAVIOR_URL,
      ),
    );

    const policy = context.proposedTemplate.Resources[database]?.UpdateReplacePolicy;
    const deletesData = policy === undefined || policy === 'Delete';
    if (deletesData) {
      evidence.push(
        {
          source: 'TEMPLATE',
          fact:
            policy === undefined
              ? `${database} does not set UpdateReplacePolicy`
              : `${database} sets UpdateReplacePolicy to Delete`,
          resourceId: database,
          propertyPath: 'UpdateReplacePolicy',
        },
        documentationEvidence(
          'Without an UpdateReplacePolicy, or with Delete, CloudFormation deletes the replaced resource and all its content. Snapshot is supported for AWS::RDS::DBInstance.',
          UPDATE_REPLACE_POLICY_URL,
        ),
      );
    }

    const identifier = change.after?.['DBInstanceIdentifier'];
    if (identifier !== undefined) {
      evidence.push(
        {
          source: 'TEMPLATE',
          fact: `${database} sets an explicit DBInstanceIdentifier (${formatValue(identifier)})`,
          resourceId: database,
          propertyPath: 'DBInstanceIdentifier',
        },
        documentationEvidence(
          'If DBInstanceIdentifier is specified, updates that require replacement of the DB instance cannot be performed, so the stack update fails.',
          DB_INSTANCE_URL,
        ),
      );
    }

    const signals: VerificationSignal[] = [databaseConnections(database)];
    const consumers = context.graph.dependentEdges(database, 'CONNECTS_TO');
    for (const edge of consumers) {
      evidence.push(edgeEvidence(edge));
    }
    const affected = context.impact?.affected ?? [];
    for (const service of affected.filter((a) => context.graph.typeOf(a.resourceId) === RESOURCE_TYPES.service)) {
      signals.push(...consumerFailureSignals(context.graph, service.resourceId));
    }

    const deepest = [...affected].sort((a, b) => b.depth - a.depth)[0];
    return {
      id: findingId(RULE_ID, database),
      ruleId: RULE_ID,
      title: deletesData
        ? `${database} will be replaced and the current instance deleted with its data`
        : `${database} will be replaced by a new DB instance`,
      severity: 'CRITICAL',
      category: 'AVAILABILITY',
      changedResource: database,
      affectedResources: unique(affected.map((a) => a.resourceId)),
      causalPath: deepest === undefined ? [database] : [...deepest.path],
      evidence,
      verificationSignals: dedupeSignals(signals),
      recommendation:
        'Do not deploy as is. Set UpdateReplacePolicy to Snapshot, take a manual snapshot, and plan a restore into the new instance, or avoid changing a replacement property.',
    };
  },
};
