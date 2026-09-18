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
  readonly before?: Readonly<Record<string, unknown>>;
  readonly after?: Readonly<Record<string, unknown>>;
}

export interface ChangeSet {
  readonly changes: readonly ResourceChange[];
}
