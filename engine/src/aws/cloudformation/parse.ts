import { parse as parseYaml, type Tags } from 'yaml';
import type { CfnResource, CfnTemplate } from '../../types/index.ts';

export class TemplateParseError extends Error {
  override readonly name = 'TemplateParseError';
}

const FUNCTION_TAGS: readonly (readonly [tag: string, key: string])[] = [
  ['!Ref', 'Ref'],
  ['!Condition', 'Condition'],
  ['!Base64', 'Fn::Base64'],
  ['!Cidr', 'Fn::Cidr'],
  ['!FindInMap', 'Fn::FindInMap'],
  ['!GetAtt', 'Fn::GetAtt'],
  ['!GetAZs', 'Fn::GetAZs'],
  ['!ImportValue', 'Fn::ImportValue'],
  ['!Join', 'Fn::Join'],
  ['!Select', 'Fn::Select'],
  ['!Split', 'Fn::Split'],
  ['!Sub', 'Fn::Sub'],
  ['!Transform', 'Fn::Transform'],
  ['!And', 'Fn::And'],
  ['!Equals', 'Fn::Equals'],
  ['!If', 'Fn::If'],
  ['!Not', 'Fn::Not'],
  ['!Or', 'Fn::Or'],
  ['!ToJsonString', 'Fn::ToJsonString'],
  ['!Length', 'Fn::Length'],
];

/**
 * `!GetAtt Resource.Attribute` is the only short form whose scalar value is not passed
 * through unchanged. The long form is a two element list, and attribute names may
 * themselves contain dots (`Endpoint.Address`), so only the first dot separates the parts.
 */
function expandScalar(key: string, value: string): Record<string, unknown> {
  if (key === 'Fn::GetAtt') {
    const dot = value.indexOf('.');
    if (dot <= 0) {
      throw new TemplateParseError(`Invalid !GetAtt value "${value}"`);
    }
    return { [key]: [value.slice(0, dot), value.slice(dot + 1)] };
  }
  return { [key]: value };
}

const expandCollection =
  (key: string) =>
  (node: { toJSON(): unknown }): Record<string, unknown> => ({ [key]: node.toJSON() });

const CLOUDFORMATION_TAGS: Tags = FUNCTION_TAGS.flatMap(([tag, key]) => [
  { tag, resolve: (value: string) => expandScalar(key, value) },
  { tag, collection: 'seq' as const, resolve: expandCollection(key) },
  { tag, collection: 'map' as const, resolve: expandCollection(key) },
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toResource(logicalId: string, value: unknown): CfnResource {
  if (!isRecord(value) || typeof value['Type'] !== 'string') {
    throw new TemplateParseError(`Resource "${logicalId}" must be an object with a string Type`);
  }
  const properties = value['Properties'];
  if (properties !== undefined && !isRecord(properties)) {
    throw new TemplateParseError(`Resource "${logicalId}" has non-object Properties`);
  }
  const dependsOn = value['DependsOn'];
  const validDependsOn =
    dependsOn === undefined ||
    typeof dependsOn === 'string' ||
    (Array.isArray(dependsOn) && dependsOn.every((item) => typeof item === 'string'));
  if (!validDependsOn) {
    throw new TemplateParseError(`Resource "${logicalId}" has an invalid DependsOn`);
  }
  return value as unknown as CfnResource;
}

/**
 * Parses a CloudFormation template written in YAML or JSON. JSON is valid YAML 1.2, so a
 * single parser handles both.
 */
export function parseTemplate(body: string): CfnTemplate {
  let document: unknown;
  try {
    document = parseYaml(body, { customTags: CLOUDFORMATION_TAGS, uniqueKeys: true });
  } catch (error) {
    if (error instanceof TemplateParseError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new TemplateParseError(`Template is not valid YAML or JSON: ${reason}`);
  }

  if (!isRecord(document)) {
    throw new TemplateParseError('Template root must be an object');
  }
  const resources = document['Resources'];
  if (!isRecord(resources) || Object.keys(resources).length === 0) {
    throw new TemplateParseError('Template must declare at least one resource');
  }

  const parsedResources: Record<string, CfnResource> = {};
  for (const [logicalId, value] of Object.entries(resources)) {
    parsedResources[logicalId] = toResource(logicalId, value);
  }

  return { ...(document as Omit<CfnTemplate, 'Resources'>), Resources: parsedResources };
}
