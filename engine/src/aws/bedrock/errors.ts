/**
 * Turns a failed model call into a sentence for the dashboard. The SDK's own message
 * embeds the raw response body, which is noise to a reader; the raw error still reaches
 * the function's log through the error's `cause`.
 */
export function describeModelError(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
  if (status === 403) {
    return 'Claude is not enabled for this AWS account on Amazon Bedrock yet';
  }
  if (status === 429) {
    return 'Amazon Bedrock is throttling requests from this account. Analyze again in a minute';
  }
  if (typeof status === 'number' && status >= 500) {
    return `Amazon Bedrock could not complete the request (status ${String(status)})`;
  }
  const message = (apiErrorMessage(error) ?? (error instanceof Error ? error.message : String(error))).replace(/\.$/, '');
  return typeof status === 'number' ? `Amazon Bedrock rejected the request: ${message}` : message;
}

/** The API's own error message, from the parsed body the SDK attaches as `error.error`. */
function apiErrorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('error' in error)) {
    return undefined;
  }
  const body = error.error;
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return undefined;
  }
  const inner = body.error;
  return typeof inner === 'object' && inner !== null && 'message' in inner && typeof inner.message === 'string'
    ? inner.message
    : undefined;
}
