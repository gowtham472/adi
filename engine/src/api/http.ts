import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/** An error with an HTTP status and a message that is safe to return to the client. */
export class HttpError extends Error {
  override readonly name = 'HttpError';
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(status: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function parseJsonBody(event: APIGatewayProxyEventV2): unknown {
  if (event.body === undefined || event.body === '') {
    throw new HttpError(400, 'Request body is required');
  }
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

export function pathParameter(event: APIGatewayProxyEventV2, name: string): string {
  const value = event.pathParameters?.[name];
  if (value === undefined || value === '') {
    throw new HttpError(400, `Path parameter ${name} is required`);
  }
  return value;
}

/**
 * Runs a request handler and converts failures into responses. Expected failures carry
 * their own status and message; anything else is logged and returned as a generic 500 so
 * internal details do not reach the client.
 */
export async function respond(
  work: () => Promise<{ status: number; body: unknown }>,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const { status, body } = await work();
    return json(status, body);
  } catch (error) {
    if (error instanceof HttpError) {
      return json(error.status, { message: error.message });
    }
    console.error('Unhandled request failure', error);
    return json(500, { message: 'The request could not be completed' });
  }
}
