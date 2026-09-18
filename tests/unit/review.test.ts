import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PULL_REQUEST_MARKER, pullRequestReport } from '../../engine/src/report/markdown.ts';
import { failsThreshold, looksLikeCloudFormation, reviewChangedFiles } from '../../engine/src/review/templates.ts';
import { BASELINE_TEMPLATE_PATH } from '../helpers.ts';

const baseline = readFileSync(BASELINE_TEMPLATE_PATH, 'utf8');
const scenario = (id: string) => readFileSync(`scenarios/${id}/after.yaml`, 'utf8');

describe('reviewChangedFiles', () => {
  it('analyzes a modified template against its previous version', () => {
    const [review] = reviewChangedFiles([
      { path: 'infrastructure/demo/baseline.yaml', before: baseline, after: scenario('01-rds-security-group') },
    ]);
    expect(review && 'result' in review ? review.result.findings.map((f) => f.ruleId) : []).toEqual(['NET-SG-001']);
  });

  it('treats every resource in a new template as a creation', () => {
    const [review] = reviewChangedFiles([{ path: 'new.yaml', before: undefined, after: baseline }]);
    const actions = review && 'result' in review ? review.result.changeSet.changes.map((c) => c.action) : [];
    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(actions)).toEqual(new Set(['CREATE']));
  });

  it('skips YAML that is not CloudFormation', () => {
    expect(looksLikeCloudFormation('name: CI\non: push\n')).toBe(false);
    expect(reviewChangedFiles([{ path: '.github/workflows/ci.yml', before: undefined, after: 'name: CI\n' }])).toEqual([]);
  });

  it('reports a template that does not parse instead of skipping it', () => {
    const broken = 'Resources:\n  Bucket:\n    Type: AWS::S3::Bucket\n    Properties: [a, b]\n';
    const reviews = reviewChangedFiles([{ path: 'broken.yaml', before: undefined, after: broken }]);
    expect(reviews).toEqual([{ path: 'broken.yaml', error: 'Resource "Bucket" has non-object Properties' }]);
    expect(failsThreshold(reviews, 'CRITICAL')).toBe(true);
  });
});

describe('failsThreshold', () => {
  const high = reviewChangedFiles([{ path: 't.yaml', before: baseline, after: scenario('01-rds-security-group') }]);
  const critical = reviewChangedFiles([{ path: 't.yaml', before: baseline, after: scenario('05-rds-replacement') }]);

  it('fails at or above the threshold only', () => {
    expect(failsThreshold(high, 'CRITICAL')).toBe(false);
    expect(failsThreshold(high, 'HIGH')).toBe(true);
    expect(failsThreshold(critical, 'CRITICAL')).toBe(true);
  });

  it('never fails when the threshold is NONE', () => {
    expect(failsThreshold(critical, 'NONE')).toBe(false);
  });
});

describe('pullRequestReport', () => {
  it('starts with the marker and summarizes every template', () => {
    const reviews = [
      ...reviewChangedFiles([{ path: 'infrastructure/demo/baseline.yaml', before: baseline, after: scenario('01-rds-security-group') }]),
      { path: 'broken.yaml', error: 'Template must declare at least one resource' },
    ];
    const report = pullRequestReport(reviews);
    expect(report.startsWith(PULL_REQUEST_MARKER)).toBe(true);
    expect(report).toContain('1 finding, highest severity **HIGH**');
    expect(report).toContain('| `infrastructure/demo/baseline.yaml` | 1 | 1 | HIGH |');
    expect(report).toContain('| `broken.yaml` | Not analyzed | Not analyzed | Invalid template |');
    expect(report).toContain('#### HIGH: Service loses network access to Database');
  });

  it('links to the dashboard when the analysis was stored', () => {
    const [review] = reviewChangedFiles([{ path: 't.yaml', before: baseline, after: scenario('01-rds-security-group') }]);
    const report = pullRequestReport(review === undefined ? [] : [{ ...review, link: 'https://adi.example/#/analyses/a1' }]);
    expect(report).toContain('[Open the impact graph in ADI](https://adi.example/#/analyses/a1)');
  });
});
