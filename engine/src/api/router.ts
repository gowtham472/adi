import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { HttpError, parseJsonBody, pathParameter, respond } from './http.ts';
import {
  createAnalysis,
  getAnalysis,
  listAnalyses,
  readCreateRequest,
  verifyAnalysis,
  type ServiceDependencies,
} from './service.ts';

/** The subset of an HTTP API event the router reads. */
export type RoutedEvent = Pick<APIGatewayProxyEventV2, 'routeKey' | 'body' | 'isBase64Encoded' | 'pathParameters'>;

/**
 * Maps an HTTP API route key to a service operation. Shared by the Lambda handler and the
 * local development server, so both serve exactly the same contract.
 */
export function routeRequest(deps: ServiceDependencies, event: RoutedEvent): Promise<APIGatewayProxyStructuredResultV2> {
  const request = event as APIGatewayProxyEventV2;
  return respond(async () => {
    switch (event.routeKey) {
      case 'POST /analyses':
        return { status: 201, body: await createAnalysis(deps, readCreateRequest(parseJsonBody(request))) };
      case 'GET /analyses':
        return { status: 200, body: await listAnalyses(deps) };
      case 'GET /analyses/{analysisId}':
        return { status: 200, body: await getAnalysis(deps, pathParameter(request, 'analysisId')) };
      case 'POST /analyses/{analysisId}/verification':
        return { status: 200, body: await verifyAnalysis(deps, pathParameter(request, 'analysisId')) };
      default:
        throw new HttpError(404, `No route for ${event.routeKey}`);
    }
  });
}
