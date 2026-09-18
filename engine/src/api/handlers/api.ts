import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { createDependencies } from '../dependencies.ts';
import { respond } from '../http.ts';
import { routeRequest } from '../router.ts';
import type { ServiceDependencies } from '../service.ts';

let dependencies: ServiceDependencies | undefined;

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    dependencies ??= createDependencies();
  } catch (error) {
    // Missing configuration is reported through the same path as any other failure, so the
    // client receives a generic 500 and the detail stays in the function log.
    return respond(() => Promise.reject(error instanceof Error ? error : new Error(String(error))));
  }
  return routeRequest(dependencies, event);
}
