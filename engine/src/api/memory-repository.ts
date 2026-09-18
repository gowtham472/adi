import type { AnalysisRepository } from '../aws/dynamodb/repository.ts';
import { summarize } from '../aws/dynamodb/repository.ts';
import type { AnalysisRecord, AnalysisSummary, Explanation, VerificationRecord } from '../types/index.ts';

/** An in memory repository for the local development server and for tests. */
export class MemoryAnalysisRepository implements AnalysisRepository {
  readonly records = new Map<string, AnalysisRecord>();

  save(record: AnalysisRecord): Promise<void> {
    this.records.set(record.analysisId, record);
    return Promise.resolve();
  }

  get(analysisId: string): Promise<AnalysisRecord | undefined> {
    return Promise.resolve(this.records.get(analysisId));
  }

  list(limit: number): Promise<AnalysisSummary[]> {
    return Promise.resolve(
      [...this.records.values()]
        .map(summarize)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }

  recordExplanation(analysisId: string, explanation: Explanation): Promise<void> {
    return this.update(analysisId, { explanation, explanationStatus: 'READY' });
  }

  recordExplanationFailure(analysisId: string, reason: string): Promise<void> {
    return this.update(analysisId, { explanationError: reason, explanationStatus: 'FAILED' });
  }

  recordVerification(analysisId: string, verification: VerificationRecord): Promise<void> {
    return this.update(analysisId, { verification });
  }

  private update(analysisId: string, patch: Partial<AnalysisRecord>): Promise<void> {
    const record = this.records.get(analysisId);
    if (record !== undefined) {
      this.records.set(analysisId, { ...record, ...patch });
    }
    return Promise.resolve();
  }
}
