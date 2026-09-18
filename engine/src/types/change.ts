export type ChangeAction = 'CREATE' | 'UPDATE' | 'REPLACE' | 'DELETE';

/**
 * Whether the change forces CloudFormation to replace the physical resource.
 * `UNKNOWN` means the resource type is not in the documented replacement table, so the
 * engine does not guess.
 */
export type ReplacementRequirement = 'REQUIRED' | 'NOT_REQUIRED' | 'UNKNOWN';

export interface ResourceChange {
  readonly resourceId: string;
  readonly resourceType: string;
  readonly action: ChangeAction;
  readonly replacement: ReplacementRequirement;
  /** Top level property names whose values differ. Empty for CREATE and DELETE. */
  readonly changedProperties: readonly string[];
  /** Properties that caused `replacement` to be `REQUIRED`. */
  readonly replacementCauses: readonly string[];
  /**
   * Set when a CloudFormation change set decided `replacement`, instead of the documented
   * replacement table.
   */
  readonly replacementSource?: 'CHANGE_SET';
  readonly before?: Readonly<Record<string, unknown>>;
  readonly after?: Readonly<Record<string, unknown>>;
}

export interface ChangeSet {
  readonly changes: readonly ResourceChange[];
}

/**
 * CloudFormation's own account of one resource change, read from a change set. Only the
 * replacement decision is used: it comes from the service that will perform the update,
 * so it outranks the documented table.
 */
export interface ReportedChange {
  readonly resourceId: string;
  readonly replacement: 'True' | 'False' | 'Conditional';
  /** Properties the change set marks as always requiring recreation. */
  readonly recreationCauses: readonly string[];
}
