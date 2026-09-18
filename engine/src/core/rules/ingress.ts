import { formatValue } from '../evidence/facts.ts';
import { referencedResource } from '../graph/references.ts';
import { asArray, asNumber, asRecord } from './values.ts';

/** One inbound security group rule, normalized so rules can be compared across templates. */
export interface IngressPermission {
  readonly protocol: string;
  readonly fromPort: number | undefined;
  readonly toPort: number | undefined;
  /** Logical ID when the source is a security group in the template. */
  readonly sourceGroup: string | undefined;
  /** Stable identity of the source, used to compare rules across templates. */
  readonly sourceKey: string;
  readonly propertyPath: string;
}

/** CloudFormation accepts the protocol as a name or a number, for example `tcp` or `6`. */
function protocolOf(value: unknown): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : formatValue(value);
  return text.toLowerCase();
}

export function toPermission(value: unknown, propertyPath: string): IngressPermission | undefined {
  const rule = asRecord(value);
  if (rule === undefined) {
    return undefined;
  }
  const sourceGroup = referencedResource(rule['SourceSecurityGroupId']);
  const sourceKey =
    sourceGroup !== undefined
      ? `group:${sourceGroup}`
      : typeof rule['CidrIp'] === 'string'
        ? `cidr:${rule['CidrIp']}`
        : typeof rule['CidrIpv6'] === 'string'
          ? `cidr:${rule['CidrIpv6']}`
          : `other:${JSON.stringify(rule['SourcePrefixListId'] ?? rule['SourceSecurityGroupId'] ?? null)}`;
  return {
    protocol: protocolOf(rule['IpProtocol']),
    fromPort: asNumber(rule['FromPort']),
    toPort: asNumber(rule['ToPort']),
    sourceGroup,
    sourceKey,
    propertyPath,
  };
}

export function isAllProtocols(protocol: string): boolean {
  return protocol === '-1' || protocol === 'all';
}

/** True when `rule` admits `protocol`/`port` regardless of source. */
export function admitsPort(rule: IngressPermission, protocol: string, port: number): boolean {
  if (isAllProtocols(rule.protocol)) {
    return true;
  }
  return (
    rule.protocol === protocol &&
    (rule.fromPort ?? Number.NEGATIVE_INFINITY) <= port &&
    (rule.toPort ?? Number.POSITIVE_INFINITY) >= port
  );
}

/** True when `wider` permits every connection that `narrower` permits. */
export function covers(wider: IngressPermission, narrower: IngressPermission): boolean {
  if (wider.sourceKey !== narrower.sourceKey) {
    return false;
  }
  if (isAllProtocols(wider.protocol)) {
    return true;
  }
  if (wider.protocol !== narrower.protocol) {
    return false;
  }
  const from = narrower.fromPort ?? Number.NEGATIVE_INFINITY;
  const to = narrower.toPort ?? Number.POSITIVE_INFINITY;
  return (
    (wider.fromPort ?? Number.NEGATIVE_INFINITY) <= from &&
    (wider.toPort ?? Number.POSITIVE_INFINITY) >= to
  );
}

export function describePermission(permission: IngressPermission): string {
  const ports = isAllProtocols(permission.protocol)
    ? 'all traffic'
    : permission.fromPort === permission.toPort
      ? `${permission.protocol}/${formatValue(permission.fromPort)}`
      : `${permission.protocol}/${formatValue(permission.fromPort)}-${formatValue(permission.toPort)}`;
  const source = permission.sourceGroup ?? permission.sourceKey.replace(/^(cidr|other):/, '');
  return `${ports} from ${source}`;
}

/** The inline `SecurityGroupIngress` rules of a security group's properties. */
export function inlineRules(
  properties: Readonly<Record<string, unknown>> | undefined,
): IngressPermission[] {
  return asArray(properties?.['SecurityGroupIngress'])
    .map((rule, index) => toPermission(rule, `SecurityGroupIngress[${String(index)}]`))
    .filter((rule): rule is IngressPermission => rule !== undefined);
}
