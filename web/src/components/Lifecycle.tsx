import { CheckIcon, CircleNotchIcon, MinusIcon } from '@phosphor-icons/react';
import type { AnalysisRecord } from '@adi/engine/types';
import { overallVerification } from '../lib/verification.ts';

type StepState = 'DONE' | 'ACTIVE' | 'WAITING' | 'SKIPPED';

interface Step {
  readonly title: string;
  readonly state: StepState;
  readonly detail: string;
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
      ? { title: 'Verified', state: 'DONE', detail: status.charAt(0) + status.slice(1).toLowerCase() }
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
  return (
    <ol className="lifecycle" aria-label="Analysis lifecycle">
      {steps(record, explanationTimedOut).map((step, index) => (
        <li key={step.title} className={`lifecycle-step step-${step.state.toLowerCase()}`}>
          <span className="lifecycle-marker" aria-hidden="true">
            {step.state === 'DONE' && <CheckIcon weight="bold" />}
            {step.state === 'ACTIVE' && <CircleNotchIcon weight="bold" className="spin" />}
            {step.state === 'SKIPPED' && <MinusIcon weight="bold" />}
            {step.state === 'WAITING' && String(index + 1)}
          </span>
          <span className="lifecycle-text">
            <strong>{step.title}</strong>
            <span>{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
