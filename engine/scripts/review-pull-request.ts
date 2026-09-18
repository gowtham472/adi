/**
 * Reviews the CloudFormation templates a pull request adds or modifies, and posts the
 * findings as a pull request comment. A later push updates the same comment.
 *
 * In GitHub Actions (.github/workflows/adi-review.yml) it reads the pull request from the
 * event, writes the report to the job summary, and comments when the token allows it.
 * Anywhere else it prints the report:
 *
 *   node engine/scripts/review-pull-request.ts --base main
 *
 * Environment:
 *   ADI_FAIL_ON        CRITICAL (default), HIGH, MEDIUM, LOW or NONE. The check fails on a
 *                      finding at or above this severity, or on a template that does not parse.
 *   ADI_API_URL        Optional. Stores each analysis in ADI so the comment links to it.
 *   ADI_DASHBOARD_URL  Required with ADI_API_URL, to build those links.
 *   GITHUB_TOKEN       Set by the workflow. Without it, nothing is posted.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pullRequestReport, PULL_REQUEST_MARKER, type TemplateReview } from '../src/report/markdown.ts';
import { failsThreshold, reviewChangedFiles, type ChangedFile, type FailureThreshold } from '../src/review/templates.ts';

const TEMPLATE_EXTENSIONS = /\.(ya?ml|json|template)$/i;
const THRESHOLDS: readonly FailureThreshold[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function baseRef(): string {
  const index = process.argv.indexOf('--base');
  const fromArgument = index === -1 ? undefined : process.argv[index + 1];
  const fromActions = process.env['GITHUB_BASE_REF'];
  const ref = fromArgument ?? (fromActions === undefined || fromActions === '' ? undefined : `origin/${fromActions}`);
  if (ref === undefined) {
    throw new Error('Pass --base <ref>, or run inside a pull_request workflow');
  }
  return ref;
}

function changedFiles(base: string): ChangedFile[] {
  const mergeBase = git('merge-base', base, 'HEAD').trim();
  const paths = git('diff', '--name-only', '--no-renames', '--diff-filter=AM', '-z', mergeBase, 'HEAD')
    .split('\0')
    .filter((path) => TEMPLATE_EXTENSIONS.test(path));
  return paths.map((path) => {
    let before: string | undefined;
    try {
      before = git('show', `${mergeBase}:${path}`);
    } catch {
      before = undefined;
    }
    return { path, before, after: readFileSync(path, 'utf8') };
  });
}

/** Stores each analysis in ADI, when configured, so the comment can link to its graph. */
async function attachLinks(reviews: TemplateReview[], files: readonly ChangedFile[]): Promise<TemplateReview[]> {
  const api = process.env['ADI_API_URL'];
  const dashboard = process.env['ADI_DASHBOARD_URL'];
  if (api === undefined || api === '' || dashboard === undefined || dashboard === '') {
    return reviews;
  }
  return Promise.all(
    reviews.map(async (review) => {
      const file = files.find((f) => f.path === review.path);
      if ('error' in review || file?.before === undefined) {
        return review;
      }
      try {
        const response = await fetch(`${api.replace(/\/$/, '')}/analyses`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ currentTemplate: file.before, proposedTemplate: file.after }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          throw new Error(`status ${String(response.status)}`);
        }
        const { analysisId } = (await response.json()) as { analysisId: string };
        return { ...review, link: `${dashboard.replace(/\/$/, '')}/#/analyses/${analysisId}` };
      } catch (error) {
        console.warn(`Could not store the analysis of ${review.path} in ADI: ${String(error)}`);
        return review;
      }
    }),
  );
}

async function github(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env['GITHUB_TOKEN'] ?? ''}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${init.method ?? 'GET'} ${path} returned ${String(response.status)}`);
  }
  return response;
}

/** Creates ADI's comment on the pull request, or updates it when an earlier run left one. */
async function upsertComment(body: string): Promise<void> {
  const repository = process.env['GITHUB_REPOSITORY'];
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (process.env['GITHUB_TOKEN'] === undefined || repository === undefined || eventPath === undefined) {
    return;
  }
  const event = JSON.parse(readFileSync(eventPath, 'utf8')) as { pull_request?: { number: number } };
  const number = event.pull_request?.number;
  if (number === undefined) {
    return;
  }
  try {
    const comments = (await (
      await github(`/repos/${repository}/issues/${String(number)}/comments?per_page=100`)
    ).json()) as { id: number; body?: string }[];
    const existing = comments.find((c) => c.body?.startsWith(PULL_REQUEST_MARKER) === true);
    if (existing === undefined) {
      await github(`/repos/${repository}/issues/${String(number)}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    } else {
      await github(`/repos/${repository}/issues/comments/${String(existing.id)}`, { method: 'PATCH', body: JSON.stringify({ body }) });
    }
  } catch (error) {
    // Pull requests from forks get a read only token. The job summary still has the report.
    console.warn(`Could not comment on the pull request: ${String(error)}`);
  }
}

async function main(): Promise<number> {
  const threshold = (process.env['ADI_FAIL_ON'] ?? 'CRITICAL').toUpperCase() as FailureThreshold;
  if (!THRESHOLDS.includes(threshold)) {
    throw new Error(`ADI_FAIL_ON must be one of ${THRESHOLDS.join(', ')}`);
  }

  const files = changedFiles(baseRef());
  const reviews = reviewChangedFiles(files);
  if (reviews.length === 0) {
    console.log('No CloudFormation templates were added or modified.');
    return 0;
  }

  const report = pullRequestReport(await attachLinks(reviews, files));
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary === undefined) {
    console.log(report);
  } else {
    appendFileSync(summary, report);
  }
  await upsertComment(report);

  if (failsThreshold(reviews, threshold)) {
    console.error(`Failing the check: a finding at or above ${threshold}, or a template that does not parse.`);
    return 1;
  }
  return 0;
}

process.exitCode = await main();
