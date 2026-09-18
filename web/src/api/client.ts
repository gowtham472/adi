import type { AnalysisRecord, AnalysisSummary, VerificationRecord } from '@adi/engine/types';

const BASE_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '/api';

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'The ADI API could not be reached');
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `The request failed with status ${String(response.status)}`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export interface CreateAnalysisInput {
  readonly proposedTemplate: string;
  readonly currentTemplate?: string;
  readonly stackName?: string;
}

export const api = {
  createAnalysis: (input: CreateAnalysisInput) => request<AnalysisRecord>('POST', '/analyses', input),
  listAnalyses: () => request<AnalysisSummary[]>('GET', '/analyses'),
  getAnalysis: (analysisId: string) => request<AnalysisRecord>('GET', `/analyses/${encodeURIComponent(analysisId)}`),
  verifyAnalysis: (analysisId: string) =>
    request<VerificationRecord>('POST', `/analyses/${encodeURIComponent(analysisId)}/verification`),
};
