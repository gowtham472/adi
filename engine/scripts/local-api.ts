/**
 * Serves the ADI API on localhost for dashboard development, using the same router and
 * service code as the Lambda function with an in memory repository.
 *
 * Everything that needs AWS fails with an explicit reason instead of being simulated:
 * reading a deployed stack, collecting CloudWatch signals and calling Bedrock. Analyses
 * therefore need a current template, and explanations are recorded as unavailable.
 *
 * Run with: node engine/scripts/local-api.ts
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { MemoryAnalysisRepository } from '../src/api/memory-repository.ts';
import { routeRequest } from '../src/api/router.ts';
import { explainAnalysis, type ServiceDependencies } from '../src/api/service.ts';

const PORT = Number(process.env['PORT'] ?? 8787);
const unavailable = (what: string) => Promise.reject(new Error(`${what} requires AWS and is not available on the local server`));

const deps: ServiceDependencies = {
  repository: new MemoryAnalysisRepository(),
  fetchDeployedTemplate: () => unavailable('Reading a deployed stack'),
  fetchChangeSet: () => unavailable('Reading a change set'),
  fetchPhysicalIds: () => unavailable('Resolving stack resources'),
  fetchStackEvents: () => unavailable('Reading stack events'),
  observeSignals: () => unavailable('Collecting CloudWatch signals'),
  requestExplanation: (analysisId) => {
    setTimeout(() => void explainAnalysis(deps, analysisId), 500);
    return Promise.resolve();
  },
  explain: () => unavailable('Explaining findings with Amazon Bedrock'),
  now: () => new Date(),
  newId: () => randomUUID(),
};

const ROUTES: readonly { method: string; pattern: RegExp; routeKey: string }[] = [
  { method: 'POST', pattern: /^\/analyses$/, routeKey: 'POST /analyses' },
  { method: 'GET', pattern: /^\/analyses$/, routeKey: 'GET /analyses' },
  { method: 'GET', pattern: /^\/analyses\/(?<analysisId>[^/]+)$/, routeKey: 'GET /analyses/{analysisId}' },
  {
    method: 'POST',
    pattern: /^\/analyses\/(?<analysisId>[^/]+)\/verification$/,
    routeKey: 'POST /analyses/{analysisId}/verification',
  },
];

createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const route = ROUTES.find((r) => r.method === request.method && r.pattern.test(path));
    const match = route?.pattern.exec(path);
    const body = Buffer.concat(chunks).toString('utf8');
    void routeRequest(deps, {
      routeKey: route?.routeKey ?? `${request.method ?? 'GET'} ${path}`,
      isBase64Encoded: false,
      ...(body === '' ? {} : { body }),
      ...(match?.groups === undefined ? {} : { pathParameters: { ...match.groups } }),
    }).then((result) => {
      response.writeHead(result.statusCode ?? 200, { 'content-type': 'application/json' });
      response.end(typeof result.body === 'string' ? result.body : '');
    });
  });
}).listen(PORT, () => {
  console.log(`ADI local API listening on http://localhost:${String(PORT)}`);
});
