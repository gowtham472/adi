/** How a reference between two resources is expressed in the template. */
export type ReferenceKind = 'Ref' | 'GetAtt' | 'Sub' | 'DependsOn';

/**
 * The semantic meaning of an edge, derived from the type of the resource being referenced.
 * `REFERENCES` is used when no more specific relationship is known.
 */
export type Relationship =
  | 'PROTECTED_BY'
  | 'ALLOWS'
  | 'ASSUMES'
  | 'ROUTES_TO'
  | 'RUNS'
  | 'CONNECTS_TO'
  | 'HOSTED_IN'
  | 'ORDERED_AFTER'
  | 'REFERENCES';

export interface ResourceNode {
  /** CloudFormation logical ID. Unique within a template. */
  readonly id: string;
  /** Full resource type, for example `AWS::RDS::DBInstance`. */
  readonly type: string;
  /** Service segment of the type, for example `RDS`. */
  readonly service: string;
}

/**
 * A dependency edge. `source` depends on `target`: if `target` changes, `source` can be
 * affected. Traversal for impact therefore walks edges in reverse, from target to source.
 */
export interface DependencyEdge {
  readonly source: string;
  readonly target: string;
  readonly kind: ReferenceKind;
  readonly relationship: Relationship;
  /** Dotted property path in `source` where the reference appears, or `DependsOn`. */
  readonly propertyPath: string;
  /** Attribute name for `GetAtt` and attribute style `Sub` references. */
  readonly attribute?: string;
}

export interface DependencyGraph {
  readonly nodes: readonly ResourceNode[];
  readonly edges: readonly DependencyEdge[];
}
