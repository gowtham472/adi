import type { AnalysisRecord, VerificationStatus } from '@adi/engine/types';

/**
 * The worst status across findings, matching the engine's own rule: any contradiction
 * wins, and matched requires every finding to match.
 */
export function overallVerification(record: AnalysisRecord): VerificationStatus | undefined {
  const results = record.verification?.findings ?? [];
  if (results.length === 0) {
    return undefined;
  }
  if (results.some((r) => r.status === 'CONTRADICTED')) {
    return 'CONTRADICTED';
  }
  return results.every((r) => r.status === 'MATCHED') ? 'MATCHED' : 'UNCONFIRMED';
}
