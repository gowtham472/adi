import { useState } from 'react';
import type { AnalysisRecord, SignalObservation, VerificationRecord } from '@adi/engine/types';
import { api, ApiError } from '../api/client.ts';
import { absoluteTime, formatNumber } from '../lib/format.ts';
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

function expected(observation: SignalObservation): string {
  return observation.signal.kind === 'METRIC'
    ? observation.signal.expectedDirection === 'INCREASE' ? 'Rise' : 'Fall'
    : 'Appear';
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
      <p className="empty">
        Verification compares CloudWatch signals before and after a stack update, so it needs an analysis made against a
        deployed stack. This analysis compared two templates.
      </p>
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
      <div className="verification-intro">
        <p>
          Deploy the proposed template to <code>{record.stackName}</code>, then verify. ADI finds the first stack update after
          this analysis in CloudFormation's events and compares each predicted signal in the fifteen minutes before it with
          the period after it.
        </p>
        <button type="button" className="primary" onClick={() => void verify()} disabled={running}>
          {running ? 'Collecting signals' : verification === undefined ? 'Verify deployment' : 'Verify again'}
        </button>
      </div>
      {error !== undefined && <p className="error-banner">{error}</p>}

      {verification !== undefined && (
        <>
          <dl className="deployment-facts">
            <div>
              <dt>Stack update</dt>
              <dd>{verification.deployment.status}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{absoluteTime(verification.deployment.startedAt)}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{absoluteTime(verification.deployment.completedAt)}</dd>
            </div>
            <div>
              <dt>Observed until</dt>
              <dd>{absoluteTime(verification.observedWindow.end)}</dd>
            </div>
          </dl>

          {verification.findings.map((result) => {
            const finding = record.findings.find((f) => f.id === result.findingId);
            return (
              <section key={result.findingId} className="verification-result">
                <header>
                  <StatusBadge status={result.status} />
                  <h3>{finding?.title ?? result.findingId}</h3>
                </header>
                <table className="observation-table">
                  <thead>
                    <tr>
                      <th>Signal</th>
                      <th>Predicted</th>
                      <th>Before</th>
                      <th>After</th>
                      <th>Observed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.observations.map((observation, index) => (
                      <tr key={index}>
                        <td>
                          <code>{signalName(observation)}</code>
                          <div className="muted">{observation.signal.description}</div>
                        </td>
                        <td>{expected(observation)}</td>
                        <td>{formatNumber(observation.baseline)}</td>
                        <td>{formatNumber(observation.observed)}</td>
                        <td>
                          <span className={`movement movement-${observation.movement.toLowerCase()}`}>
                            {MOVEMENT_LABEL[observation.movement]}
                          </span>
                          {observation.note !== undefined && <div className="muted">{observation.note}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
