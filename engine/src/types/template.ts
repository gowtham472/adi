/**
 * A CloudFormation template after YAML or JSON parsing, with short form intrinsic tags
 * (`!Ref`, `!GetAtt`, `!Sub` and so on) expanded to their long form object equivalents.
 */
export interface CfnTemplate {
  readonly AWSTemplateFormatVersion?: string;
  readonly Description?: string;
  readonly Parameters?: Readonly<Record<string, CfnParameter>>;
  readonly Resources: Readonly<Record<string, CfnResource>>;
  readonly Outputs?: Readonly<Record<string, unknown>>;
}

export interface CfnParameter {
  readonly Type: string;
  readonly Default?: unknown;
  readonly NoEcho?: boolean | string;
}

export interface CfnResource {
  readonly Type: string;
  readonly Properties?: Readonly<Record<string, unknown>>;
  readonly DependsOn?: string | readonly string[];
  readonly Condition?: string;
  readonly DeletionPolicy?: string;
  readonly UpdateReplacePolicy?: string;
}
