/**
 * How far a change propagates.
 * - `LOCAL`: nothing depends on the changed resource.
 * - `SERVICE`: every affected resource belongs to the same AWS service as the change.
 * - `APPLICATION`: the change crosses at least one service boundary.
 */
export type BlastRadius = 'LOCAL' | 'SERVICE' | 'APPLICATION';

export interface AffectedResource {
  readonly resourceId: string;
  /** Number of dependency hops from the changed resource. 1 means direct. */
  readonly depth: number;
  /** Resource IDs from the changed resource to this one, inclusive of both ends. */
  readonly path: readonly string[];
}

export interface ChangeImpact {
  readonly resourceId: string;
  readonly affected: readonly AffectedResource[];
  readonly blastRadius: BlastRadius;
}
