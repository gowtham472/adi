import type { ReferenceKind } from '../../types/index.ts';

export interface TemplateReference {
  readonly target: string;
  readonly kind: Exclude<ReferenceKind, 'DependsOn'>;
  readonly propertyPath: string;
  readonly attribute?: string;
}

const SUB_TOKEN = /\$\{([^}]+)\}/g;

/**
 * Returns the logical ID a property value points at when the value is exactly a `Ref` or
 * `Fn::GetAtt`, for example the `SourceSecurityGroupId` of an ingress rule.
 */
export function referencedResource(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['Ref'] === 'string') {
    return record['Ref'];
  }
  const getAtt = record['Fn::GetAtt'];
  if (Array.isArray(getAtt) && typeof getAtt[0] === 'string') {
    return getAtt[0];
  }
  return undefined;
}

function joinPath(base: string, segment: string): string {
  return base === '' ? segment : `${base}.${segment}`;
}

/**
 * Extracts `${Name}` and `${Name.Attribute}` tokens from an `Fn::Sub` string. Tokens that
 * begin with `!` are escaped literals, and names bound in the variable map shadow resources.
 */
function subReferences(
  text: string,
  path: string,
  resourceIds: ReadonlySet<string>,
  boundNames: ReadonlySet<string>,
): TemplateReference[] {
  const references: TemplateReference[] = [];
  for (const match of text.matchAll(SUB_TOKEN)) {
    const token = match[1]?.trim();
    if (token === undefined || token.startsWith('!')) {
      continue;
    }
    const dot = token.indexOf('.');
    const name = dot === -1 ? token : token.slice(0, dot);
    if (boundNames.has(name) || !resourceIds.has(name)) {
      continue;
    }
    references.push(
      dot === -1
        ? { target: name, kind: 'Sub', propertyPath: path }
        : { target: name, kind: 'Sub', propertyPath: path, attribute: token.slice(dot + 1) },
    );
  }
  return references;
}

function getAttReference(
  value: unknown,
  path: string,
  resourceIds: ReadonlySet<string>,
): TemplateReference | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const [target, attribute] = value as unknown[];
  if (typeof target !== 'string' || !resourceIds.has(target)) {
    return undefined;
  }
  return typeof attribute === 'string'
    ? { target, kind: 'GetAtt', propertyPath: path, attribute }
    : { target, kind: 'GetAtt', propertyPath: path };
}

/**
 * Walks a resource's properties and returns every reference to another resource in the
 * same template. References to parameters and pseudo parameters (`AWS::Region`) are
 * ignored because they are not graph nodes.
 *
 * Once the walk enters an intrinsic function the path stops growing, so a reference nested
 * in `Fn::Join` is reported at the property that holds the join. That is the location a
 * reader of the template would look for it.
 */
export function extractReferences(
  value: unknown,
  resourceIds: ReadonlySet<string>,
  path = '',
  insideFunction = false,
): TemplateReference[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      extractReferences(
        item,
        resourceIds,
        insideFunction ? path : `${path}[${String(index)}]`,
        insideFunction,
      ),
    );
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const entries = Object.entries(value);
  if (entries.length === 1) {
    const [key, argument] = entries[0] as [string, unknown];

    if (key === 'Ref') {
      return typeof argument === 'string' && resourceIds.has(argument)
        ? [{ target: argument, kind: 'Ref', propertyPath: path }]
        : [];
    }

    if (key === 'Fn::GetAtt') {
      const reference = getAttReference(argument, path, resourceIds);
      return reference === undefined ? [] : [reference];
    }

    if (key === 'Fn::Sub') {
      if (typeof argument === 'string') {
        return subReferences(argument, path, resourceIds, new Set());
      }
      if (Array.isArray(argument)) {
        const [text, variables] = argument as unknown[];
        const bound =
          typeof variables === 'object' && variables !== null
            ? new Set(Object.keys(variables))
            : new Set<string>();
        const fromText =
          typeof text === 'string' ? subReferences(text, path, resourceIds, bound) : [];
        return [...fromText, ...extractReferences(variables, resourceIds, path, true)];
      }
      return [];
    }
  }

  return entries.flatMap(([key, child]) => {
    const isFunction = key.startsWith('Fn::');
    const childPath = insideFunction || isFunction ? path : joinPath(path, key);
    return extractReferences(child, resourceIds, childPath, insideFunction || isFunction);
  });
}
