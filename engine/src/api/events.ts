/**
 * The name of the stack a CloudFormation Stack Status Change event is about. The stack ID
 * is an ARN of the form arn:aws:cloudformation:<region>:<account>:stack/<name>/<id>.
 */
export function stackNameFromEvent(event: unknown): string | undefined {
  if (typeof event !== 'object' || event === null || !('detail' in event)) {
    return undefined;
  }
  const detail = event.detail;
  if (typeof detail !== 'object' || detail === null || !('stack-id' in detail) || typeof detail['stack-id'] !== 'string') {
    return undefined;
  }
  const match = /:stack\/([^/]+)/.exec(detail['stack-id']);
  return match?.[1];
}
