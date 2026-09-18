import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { createDependencies } from '../dependencies.ts';
import { HttpError, parseJsonBody, pathParameter, respond } from '../http.ts';
import {
  createAnalysis,
  getAnalysis,
  listAnalyses,
  readCreateRequest,
  verifyAnalysis,
  type ServiceDependencies,
} from '../service.ts';

let dependencies: ServiceDependencies | undefined;

/** Routes HTTP API requests by route key. Each route maps to one service operation. */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return respond(async () => {
    dependencies ??= createDependencies();
    const deps = dependencies;
    switch (event.routeKey) {
      case 'POST /analyses':
        return { status: 201, body: await createAnalysis(deps, readCreateRequest(parseJsonBody(event))) };
      case 'GET /analyses':
        return { status: 200, body: await listAnalyses(deps) };
      case 'GET /analyses/{analysisId}':
        return { status: 200, body: await getAnalysis(deps, pathParameter(event, 'analysisId')) };
      case 'POST /analyses/{analysisId}/verification':
        return { status: 200, body: await verifyAnalysis(deps, pathParameter(event, 'analysisId')) };
      default:
        throw new HttpError(404, `No route for ${event.routeKey}`);
    }
  });
}
