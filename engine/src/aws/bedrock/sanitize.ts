/**
 * Patterns for values that must not reach a model. Evidence is built from template
 * properties, which can carry credentials a developer pasted in by mistake, so every
 * string is scrubbed before it leaves the account.
 */
const SECRET_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED ACCESS KEY ID]'],
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, '$1[REDACTED CREDENTIALS]@'],
  [/\b(password|passwd|secret|token|api[_-]?key)(\s*[=:]\s*)[^\s,;"']+/gi, '$1$2[REDACTED]'],
  [/\b[A-Za-z0-9/+]{40}\b/g, '[REDACTED SECRET]'],
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

/** Applies `redactSecrets` to every string inside a JSON compatible value. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSecrets(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => redactDeep(item)) as T;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item)])) as T;
  }
  return value;
}
