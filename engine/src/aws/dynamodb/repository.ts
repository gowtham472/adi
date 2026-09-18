import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { overallStatus } from '../../core/verification/assess.ts';
import type {
  AnalysisRecord,
  AnalysisSummary,
  Explanation,
  Severity,
  VerificationRecord,
} from '../../types/index.ts';

export interface AnalysisRepository {
  save(record: AnalysisRecord): Promise<void>;
  get(analysisId: string): Promise<AnalysisRecord | undefined>;
  list(limit: number): Promise<AnalysisSummary[]>;
  recordExplanation(analysisId: string, explanation: Explanation): Promise<void>;
  recordExplanationFailure(analysisId: string, reason: string): Promise<void>;
  recordVerification(analysisId: string, verification: VerificationRecord): Promise<void>;
}

/** DynamoDB rejects items over 400 KB. The margin leaves room for later attributes. */
export const MAX_RECORD_BYTES = 350 * 1024;

export class RecordTooLarge extends Error {
  override readonly name = 'RecordTooLarge';
}

const SEVERITY_ORDER: readonly Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function summarize(record: AnalysisRecord): AnalysisSummary {
  const highestSeverity = SEVERITY_ORDER.find((severity) => record.findings.some((f) => f.severity === severity));
  const verificationStatus = overallStatus(record.verification?.findings ?? []);
  return {
    analysisId: record.analysisId,
    createdAt: record.createdAt,
    ...(record.stackName === undefined ? {} : { stackName: record.stackName }),
    changeCount: record.changeSet.changes.length,
    findingCount: record.findings.length,
    ...(highestSeverity === undefined ? {} : { highestSeverity }),
    ...(verificationStatus === undefined ? {} : { verificationStatus }),
  };
}

/**
 * One item per analysis. The summary fields are stored alongside the full record so the
 * list view can project them without reading the graph and change details.
 */
export class DynamoAnalysisRepository implements AnalysisRepository {
  private readonly documents: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(client: DynamoDBClient, tableName: string) {
    this.tableName = tableName;
    this.documents = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async save(record: AnalysisRecord): Promise<void> {
    const item = { ...record, summary: summarize(record) };
    if (Buffer.byteLength(JSON.stringify(item)) > MAX_RECORD_BYTES) {
      throw new RecordTooLarge('The analysis is too large to store; split the template or reduce the change');
    }
    await this.documents.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  async get(analysisId: string): Promise<AnalysisRecord | undefined> {
    const response = await this.documents.send(new GetCommand({ TableName: this.tableName, Key: { analysisId } }));
    if (response.Item === undefined) {
      return undefined;
    }
    const record: Record<string, unknown> = { ...response.Item };
    delete record['summary'];
    return record as unknown as AnalysisRecord;
  }

  /**
   * A scan is acceptable at demonstration scale, where the table holds tens of items.
   * Sorting happens after the scan, so `limit` bounds the response rather than the read.
   */
  async list(limit: number): Promise<AnalysisSummary[]> {
    const response = await this.documents.send(
      new ScanCommand({ TableName: this.tableName, ProjectionExpression: 'summary' }),
    );
    return (response.Items ?? [])
      .map((item) => item['summary'] as AnalysisSummary)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async recordExplanation(analysisId: string, explanation: Explanation): Promise<void> {
    await this.documents.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { analysisId },
        UpdateExpression: 'SET explanation = :explanation, explanationStatus = :status REMOVE explanationError',
        ExpressionAttributeValues: { ':explanation': explanation, ':status': 'READY' },
      }),
    );
  }

  async recordExplanationFailure(analysisId: string, reason: string): Promise<void> {
    await this.documents.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { analysisId },
        UpdateExpression: 'SET explanationError = :reason, explanationStatus = :status',
        ExpressionAttributeValues: { ':reason': reason, ':status': 'FAILED' },
      }),
    );
  }

  async recordVerification(analysisId: string, verification: VerificationRecord): Promise<void> {
    const status = overallStatus(verification.findings);
    await this.documents.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { analysisId },
        UpdateExpression:
          status === undefined
            ? 'SET verification = :verification'
            : 'SET verification = :verification, summary.verificationStatus = :status',
        ExpressionAttributeValues:
          status === undefined ? { ':verification': verification } : { ':verification': verification, ':status': status },
      }),
    );
  }
}
