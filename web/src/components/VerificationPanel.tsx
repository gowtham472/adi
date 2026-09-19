import { CheckCircleIcon, CircleNotchIcon, ClockIcon, FlagIcon, PlayIcon, PulseIcon, RocketIcon, TrendDownIcon, TrendUpIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import type { AnalysisRecord, SignalObservation, VerificationRecord } from '@adi/engine/types';
import { api, ApiError } from '../api/client.ts';
import { absoluteTime, formatNumber } from '../lib/format.ts';
import { STATUS_ICONS } from '../lib/icons.tsx';
import { StatusBadge } from './Badges.tsx';

const MOVEMENT_LABEL = {
  INCREASED: 'Rose',
  DECREASED: 'Fell',
  UNCHANGED: 'Flat',
  NO_DATA: 'No data',
} as const;

function signalName(observation: SignalObservation): string {
  return observation.signal.kind === 'METRIC' ? observation.signal.metricName : `Log: ${observation.signal.pattern}`;
}

/** Before and after drawn on the same scale, so the change reads at a glance. */
function ComparisonBars({ observation }: { observation: SignalObservation }) {
  const { baseline, observed } = observation;
  if (baseline === undefined && observed === undefined) {
    return null;
  }
  const max = Math.max(baseline ?? 0, observed ?? 0, 1e-9);
  const width = (value: number | undefined) => `${String(Math.max(2, ((value ?? 0) / max) * 100))}%`;
  return (
    <div className="comparison">
      <div className="comparison-row">
        <span>Before</span>
        <span className="bar-track">
          <span className="bar before" style={{ width: width(baseline) }} />
        </span>
        <code>{formatNumber(baseline)}</code>
      </div>
      <div className="comparison-row">
        <span>After</span>
        <span className="bar-track">
          <span className={`bar after movement-${observation.movement.toLowerCase()}`} style={{ width: width(observed) }} />
        </span>
        <code>{formatNumber(observed)}</code>
      </div>
    </div>
  );
}

interface VerificationPanelProps {
  readonly record: AnalysisRecord;
  readonly onVerified: (verification: VerificationRecord) => void;
}

export function VerificationPanel({ record, onVerified }: VerificationPanelProps) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const verification = record.verification;

  if (record.stackName === undefined) {
    return (
      <div className="empty-state">
        <span className="icon-tile large">
          <PulseIcon weight="bold" aria-hidden="true" />
        </span>
        <h3>Verification needs a deployed stack</h3>
        <p>
          ADI compares CloudWatch signals before and after a stack update. This analysis compared two templates, so there is
          no deployment to measure. Analyze against a deployed stack to verify.
        </p>
      </div>
    );
  }
  if (record.findings.length === 0) {
    return <p className="empty">There are no findings to verify.</p>;
  }

  const verify = async () => {
    setRunning(true);
    setError(undefined);
    try {
      onVerified(await api.verifyAnalysis(record.analysisId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Verification failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="verification">
      <section className="verify-card">
        {verification === undefined ? (
          <img className="verify-illustration" src={`${import.meta.env.BASE_URL}illustrations/code-deployed.svg`} alt="" />
        ) : (
          <span className="icon-tile large">
            <PulseIcon weight="bold" aria-hidden="true" />
          </span>
        )}
        <div>
          <h3>Did the prediction hold?</h3>
          <p>
            {verification?.trigger === 'AUTOMATIC' ? (
              <>
                Verified automatically. EventBridge saw the update of <code>{record.stackName}</code> complete, and a Step
                Functions workflow ran verification six minutes later, once CloudWatch had data from after the change.
              </>
            ) : (
              <>
                Deploy the proposed template to <code>{record.stackName}</code>. About six minutes after the stack update
                completes, ADI verifies by itself: it finds the update in CloudFormation's events and compares each
                predicted signal in the fifteen minutes before it with the period after it. You can also verify now.
              </>
            )}
          </p>
        </div>
        <button type="button" className="primary" onClick={() => void verify()} disabled={running}>
          {running ? <CircleNotchIcon weight="bold" className="spin" aria-hidden="true" /> : <PlayIcon weight="fill" aria-hidden="true" />}
          {running ? 'Collecting signals' : verification === undefined ? 'Verify deployment' : 'Verify again'}
        </button>
      </section>
      {error !== undefined && <p className="error-banner">{error}</p>}

      {verification !== undefined && (
        <>
          <ol className="deployment-timeline">
            <li>
              <RocketIcon weight="bold" aria-hidden="true" />
              <span>Update started</span>
              <strong>{absoluteTime(verification.deployment.startedAt)}</strong>
            </li>
            <li>
              <CheckCircleIcon weight="bold" aria-hidden="true" />
              <span>{verification.deployment.status}</span>
              <strong>{absoluteTime(verification.deployment.completedAt)}</strong>
            </li>
            <li>
              <ClockIcon weight="bold" aria-hidden="true" />
              <span>Observed until</span>
              <strong>{absoluteTime(verification.observedWindow.end)}</strong>
            </li>
          </ol>

          {verification.findings.map((result) => {
            const finding = record.findings.find((f) => f.id === result.findingId);
            const StatusIcon = STATUS_ICONS[result.status];
            return (
              <section key={result.findingId} className={`verification-result tone-border-${result.status.toLowerCase()}`}>
                <header>
                  <span className={`severity-tile tone-${result.status.toLowerCase()}`}>
                    <StatusIcon weight="fill" aria-hidden="true" />
                  </span>
                  <div>
                    <StatusBadge status={result.status} />
                    <h3>{finding?.title ?? result.findingId}</h3>
                  </div>
                </header>
                <ul className="observation-list">
                  {result.observations.map((observation, index) => (
                    <li key={index}>
                      <div className="observation-head">
                        <span className="observation-name">
                          {observation.signal.kind === 'METRIC' && observation.signal.expectedDirection === 'INCREASE' ? (
                            <TrendUpIcon weight="bold" aria-hidden="true" />
                          ) : observation.signal.kind === 'METRIC' ? (
                            <TrendDownIcon weight="bold" aria-hidden="true" />
                          ) : (
                            <FlagIcon weight="bold" aria-hidden="true" />
                          )}
                          <code>{signalName(observation)}</code>
                        </span>
                        <span className={`movement-chip movement-${observation.movement.toLowerCase()}`}>
                          {MOVEMENT_LABEL[observation.movement]}
                        </span>
                      </div>
                      <p className="muted">{observation.note ?? observation.signal.description}</p>
                      <ComparisonBars observation={observation} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
