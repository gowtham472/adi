import { CheckIcon, CircleNotchIcon, MinusIcon } from '@phosphor-icons/react';
import type { AnalysisRecord } from '@adi/engine/types';
import { overallVerification } from '../lib/verification.ts';

type StepState = 'DONE' | 'ACTIVE' | 'WAITING' | 'SKIPPED';

interface Step {
  readonly title: string;
  readonly state: StepState;
  readonly detail: string;
  /** Colours the detail, for a verification outcome. */
  readonly tone?: string;
}

/**
 * How the connector into a step is drawn: filled when the step is done, dotted when it
 * does not apply, carrying a moving marker when it is the first step still to take, and
 * plain otherwise. Skipped steps before it do not hide where the flow goes next.
 */
type LinkState = 'DONE' | 'NEXT' | 'SKIPPED' | 'IDLE';

function linkInto(to: Step, isNext: boolean): LinkState {
  if (to.state === 'DONE') {
    return 'DONE';
  }
  if (to.state === 'SKIPPED') {
    return 'SKIPPED';
  }
  return isNext ? 'NEXT' : 'IDLE';
}

function steps(record: AnalysisRecord, explanationTimedOut: boolean): Step[] {
  const explained: Step =
    record.explanationStatus === 'READY'
      ? { title: 'Explained', state: 'DONE', detail: 'Claude on Amazon Bedrock' }
      : record.explanationStatus === 'NOT_REQUIRED'
        ? { title: 'Explained', state: 'SKIPPED', detail: 'Nothing to explain' }
        : record.explanationStatus === 'PENDING' && !explanationTimedOut
          ? { title: 'Explaining', state: 'ACTIVE', detail: 'Writing on Amazon Bedrock' }
          : { title: 'Explained', state: 'SKIPPED', detail: 'Unavailable' };

  const verification = record.verification;
  const status = overallVerification(record);

  const deployed: Step =
    verification !== undefined
      ? { title: 'Deployed', state: 'DONE', detail: verification.deployment.status }
      : record.stackName === undefined
        ? { title: 'Deployed', state: 'SKIPPED', detail: 'Template comparison' }
        : { title: 'Deploy', state: 'WAITING', detail: `Deploy to ${record.stackName}` };

  const verified: Step =
    status !== undefined
      ? { title: 'Verified', state: 'DONE', detail: status.charAt(0) + status.slice(1).toLowerCase(), tone: status.toLowerCase() }
      : record.stackName === undefined
        ? { title: 'Verified', state: 'SKIPPED', detail: 'Needs a deployed stack' }
        : { title: 'Verify', state: 'WAITING', detail: 'After the stack update' };

  return [
    { title: 'Analyzed', state: 'DONE', detail: `${String(record.findings.length)} finding${record.findings.length === 1 ? '' : 's'}` },
    explained,
    deployed,
    verified,
  ];
}

/** Where this analysis stands in the analyze, explain, deploy, verify loop. */
export function Lifecycle({ record, explanationTimedOut }: { record: AnalysisRecord; explanationTimedOut: boolean }) {
  const list = steps(record, explanationTimedOut);
  const nextIndex = list.findIndex((step) => step.state === 'WAITING' || step.state === 'ACTIVE');
  return (
    <ol className="lifecycle" aria-label="Analysis lifecycle">
      {list.map((step, index) => {
        const next = list[index + 1];
        const link = next === undefined ? undefined : linkInto(next, index + 1 === nextIndex);
        return (
          <li key={step.title} className={`lifecycle-step step-${step.state.toLowerCase()}`}>
            <div className="lifecycle-track">
              <span className="lifecycle-marker" aria-hidden="true">
                {step.state === 'DONE' && <CheckIcon weight="bold" />}
                {step.state === 'ACTIVE' && <CircleNotchIcon weight="bold" className="spin" />}
                {step.state === 'SKIPPED' && <MinusIcon weight="bold" />}
                {step.state === 'WAITING' && String(index + 1)}
              </span>
              {link !== undefined && (
                <span className={`lifecycle-link link-${link.toLowerCase()}`} aria-hidden="true">
                  {link === 'NEXT' && <span className="lifecycle-packet" />}
                </span>
              )}
            </div>
            <span className="lifecycle-title">
              <span className="lifecycle-index">{String(index + 1).padStart(2, '0')}</span>
              {step.title}
            </span>
            <span className={`lifecycle-detail ${step.tone === undefined ? '' : `tone-${step.tone}`}`}>{step.detail}</span>
          </li>
        );
      })}
    </ol>
  );
}
