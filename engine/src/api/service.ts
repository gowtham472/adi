import { parseTemplate, TemplateParseError } from '../aws/cloudformation/parse.ts';
import type { AnalysisRepository } from '../aws/dynamodb/repository.ts';
import { RecordTooLarge } from '../aws/dynamodb/repository.ts';
import { analyzeTemplates } from '../core/pipeline.ts';
import { assessFinding } from '../core/verification/assess.ts';
import { findDeployment, verificationWindows, type StackEvent } from '../core/verification/deployment.ts';
import type {
  AnalysisRecord,
  AnalysisSummary,
  CfnTemplate,
  Explanation,
  Finding,
  SignalObservation,
  TimeWindow,
  VerificationRecord,
  VerificationSignal,
} from '../types/index.ts';
import { HttpError } from './http.ts';

/** Everything the service needs from the outside world, injected so it can be tested. */
export interface ServiceDependencies {
  readonly repository: AnalysisRepository;
  fetchDeployedTemplate(stackName: string): Promise<string>;
  fetchPhysicalIds(stackName: string): Promise<ReadonlyMap<string, string>>;
  fetchStackEvents(stackName: string, since: Date): Promise<StackEvent[]>;
  observeSignals(
    signals: readonly VerificationSignal[],
    physicalIds: ReadonlyMap<string, string>,
    windows: { baseline: TimeWindow; observed: TimeWindow },
  ): Promise<SignalObservation[]>;
  requestExplanation(analysisId: string): Promise<void>;
  explain(findings: readonly Finding[], resourceIds: readonly string[]): Promise<Explanation>;
  now(): Date;
  newId(): string;
}

/** CloudFormation stack names: a letter followed by letters, digits or hyphens. */
const STACK_NAME = /^[A-Za-z][A-Za-z0-9-]{0,127}$/;

export interface CreateAnalysisRequest {
  readonly proposedTemplate: string;
  readonly currentTemplate?: string;
  readonly stackName?: string;
}

export function readCreateRequest(body: unknown): CreateAnalysisRequest {
  if (typeof body !== 'object' || body === null) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  const { proposedTemplate, currentTemplate, stackName } = body as Record<string, unknown>;
  if (typeof proposedTemplate !== 'string' || proposedTemplate.trim() === '') {
    throw new HttpError(400, 'proposedTemplate is required');
  }
  if (currentTemplate !== undefined && typeof currentTemplate !== 'string') {
    throw new HttpError(400, 'currentTemplate must be a string');
  }
  if (stackName !== undefined && (typeof stackName !== 'string' || !STACK_NAME.test(stackName))) {
    throw new HttpError(400, 'stackName must be a valid CloudFormation stack name');
  }
  if (currentTemplate === undefined && stackName === undefined) {
    throw new HttpError(400, 'Provide stackName to compare against the deployed stack, or currentTemplate');
  }
  return {
    proposedTemplate,
    ...(currentTemplate === undefined ? {} : { currentTemplate }),
    ...(stackName === undefined ? {} : { stackName }),
  };
}

function parseOrReject(body: string, label: string): CfnTemplate {
  try {
    return parseTemplate(body);
  } catch (error) {
    if (error instanceof TemplateParseError) {
      throw new HttpError(400, `The ${label} template is invalid: ${error.message}`);
    }
    throw error;
  }
}

export async function createAnalysis(deps: ServiceDependencies, request: CreateAnalysisRequest): Promise<AnalysisRecord> {
  let currentBody = request.currentTemplate;
  if (currentBody === undefined && request.stackName !== undefined) {
    try {
      currentBody = await deps.fetchDeployedTemplate(request.stackName);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new HttpError(400, `Could not read the deployed template of ${request.stackName}: ${reason}`);
    }
  }
  const current = parseOrReject(currentBody as string, 'current');
  const proposed = parseOrReject(request.proposedTemplate, 'proposed');
  const result = analyzeTemplates(current, proposed);

  const record: AnalysisRecord = {
    ...result,
    analysisId: deps.newId(),
    createdAt: deps.now().toISOString(),
    ...(request.stackName === undefined ? {} : { stackName: request.stackName }),
    explanationStatus: result.findings.length > 0 ? 'PENDING' : 'NOT_REQUIRED',
  };

  try {
    await deps.repository.save(record);
  } catch (error) {
    if (error instanceof RecordTooLarge) {
      throw new HttpError(413, error.message);
    }
    throw error;
  }

  if (record.explanationStatus !== 'PENDING') {
    return record;
  }
  try {
    await deps.requestExplanation(record.analysisId);
    return record;
  } catch (error) {
    const reason = `The explanation could not be requested: ${error instanceof Error ? error.message : String(error)}`;
    await deps.repository.recordExplanationFailure(record.analysisId, reason);
    return { ...record, explanationStatus: 'FAILED', explanationError: reason };
  }
}

export async function getAnalysis(deps: ServiceDependencies, analysisId: string): Promise<AnalysisRecord> {
  const record = await deps.repository.get(analysisId);
  if (record === undefined) {
    throw new HttpError(404, `Analysis ${analysisId} was not found`);
  }
  return record;
}

export async function listAnalyses(deps: ServiceDependencies): Promise<AnalysisSummary[]> {
  return deps.repository.list(50);
}

/**
 * Generates and stores the explanation for an analysis. Runs asynchronously after the
 * analysis is created, because model latency can exceed the API Gateway timeout. A failure
 * is recorded on the analysis rather than thrown, so it is visible in the dashboard.
 */
export async function explainAnalysis(deps: ServiceDependencies, analysisId: string): Promise<void> {
  const record = await deps.repository.get(analysisId);
  if (record?.explanationStatus !== 'PENDING') {
    return;
  }
  try {
    const explanation = await deps.explain(
      record.findings,
      record.graph.nodes.map((node) => node.id),
    );
    await deps.repository.recordExplanation(analysisId, explanation);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('Explanation failed', { analysisId, reason });
    await deps.repository.recordExplanationFailure(analysisId, reason);
  }
}

export async function verifyAnalysis(deps: ServiceDependencies, analysisId: string): Promise<VerificationRecord> {
  const record = await getAnalysis(deps, analysisId);
  if (record.stackName === undefined) {
    throw new HttpError(400, 'Verification needs an analysis made against a deployed stack');
  }
  if (record.findings.length === 0) {
    throw new HttpError(409, 'The analysis has no findings to verify');
  }

  const createdAt = new Date(record.createdAt);
  const events = await deps.fetchStackEvents(record.stackName, createdAt);
  const lookup = findDeployment(events, record.stackName, createdAt);
  if (lookup.kind === 'NOT_STARTED') {
    throw new HttpError(409, `No update of ${record.stackName} has started since this analysis. Deploy the proposed template, then verify.`);
  }
  if (lookup.kind === 'IN_PROGRESS') {
    throw new HttpError(409, `The update of ${record.stackName} that started at ${lookup.startedAt.toISOString()} is still in progress`);
  }

  const { deployment } = lookup;
  const windows = verificationWindows(deployment, deps.now());
  const physicalIds = await deps.fetchPhysicalIds(record.stackName);
  const findings = await Promise.all(
    record.findings.map(async (finding) =>
      assessFinding(finding.id, await deps.observeSignals(finding.verificationSignals, physicalIds, windows)),
    ),
  );

  const verification: VerificationRecord = {
    verifiedAt: deps.now().toISOString(),
    deployment: {
      startedAt: deployment.startedAt.toISOString(),
      completedAt: deployment.completedAt.toISOString(),
      status: deployment.status,
    },
    baselineWindow: windows.baseline,
    observedWindow: windows.observed,
    findings,
  };
  await deps.repository.recordVerification(analysisId, verification);
  return verification;
}
