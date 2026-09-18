import { parseTemplate, TemplateParseError } from '../aws/cloudformation/parse.ts';
import { analyzeTemplates } from '../core/pipeline.ts';
import { highestSeverity, type TemplateReview } from '../report/markdown.ts';
import type { CfnTemplate, Severity } from '../types/index.ts';

/** A file a pull request adds or modifies, with its content on each side of the change. */
export interface ChangedFile {
  readonly path: string;
  /** Content at the base of the pull request, or undefined when the file is new. */
  readonly before: string | undefined;
  readonly after: string;
}

const CLOUDFORMATION_MARKERS: readonly RegExp[] = [/AWSTemplateFormatVersion/, /["']?Type["']?\s*:\s*["']?AWS::/];

const EMPTY_TEMPLATE: CfnTemplate = { Resources: {} };

/**
 * Whether a YAML or JSON file is meant to be a CloudFormation template. Detection is by
 * content, not by parsing, so a template with a syntax error is still reviewed and its
 * error reported instead of the file being skipped as unrelated.
 */
export function looksLikeCloudFormation(body: string): boolean {
  return CLOUDFORMATION_MARKERS.some((marker) => marker.test(body));
}

function parseOrEmpty(body: string | undefined): CfnTemplate {
  if (body === undefined) {
    return EMPTY_TEMPLATE;
  }
  try {
    return parseTemplate(body);
  } catch (error) {
    if (error instanceof TemplateParseError) {
      return EMPTY_TEMPLATE;
    }
    throw error;
  }
}

/**
 * Analyzes every CloudFormation template among the changed files against its version at
 * the base of the pull request. A new template, or one that did not parse before, is
 * compared with an empty template, so every resource in it is a creation.
 */
export function reviewChangedFiles(files: readonly ChangedFile[]): TemplateReview[] {
  return files
    .filter((file) => looksLikeCloudFormation(file.after))
    .map((file): TemplateReview => {
      try {
        return { path: file.path, result: analyzeTemplates(parseOrEmpty(file.before), parseTemplate(file.after)) };
      } catch (error) {
        if (error instanceof TemplateParseError) {
          return { path: file.path, error: error.message };
        }
        throw error;
      }
    });
}

export type FailureThreshold = Severity | 'NONE';

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

/**
 * Whether the review should fail the check: a finding at or above the threshold, or a
 * template that could not be parsed, since CloudFormation would reject it too.
 */
export function failsThreshold(reviews: readonly TemplateReview[], threshold: FailureThreshold): boolean {
  if (threshold === 'NONE') {
    return false;
  }
  return reviews.some((review) => {
    if ('error' in review) {
      return true;
    }
    const worst = highestSeverity(review.result.findings);
    return worst !== undefined && SEVERITY_RANK[worst] >= SEVERITY_RANK[threshold];
  });
}
