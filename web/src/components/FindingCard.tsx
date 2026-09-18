import type { EvidenceSource, Finding } from '@adi/engine/types';
import { SeverityBadge } from './Badges.tsx';

const SOURCE_LABEL: Readonly<Record<EvidenceSource, string>> = {
  DIFF: 'Diff',
  GRAPH: 'Graph',
  TEMPLATE: 'Template',
  AWS_DOCUMENTATION: 'AWS docs',
};

interface FindingCardProps {
  readonly finding: Finding;
  readonly explanation: string | undefined;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

export function FindingCard({ finding, explanation, selected, onSelect }: FindingCardProps) {
  return (
    <article className={`finding-card ${selected ? 'selected' : ''}`}>
      <button type="button" className="finding-header" onClick={onSelect} aria-expanded={selected}>
        <div className="finding-meta">
          <SeverityBadge severity={finding.severity} />
          <span className="rule-id">{finding.ruleId}</span>
          <span className="category">{finding.category.toLowerCase()}</span>
        </div>
        <h3>{finding.title}</h3>
        <ol className="causal-path" aria-label="Causal path">
          {finding.causalPath.map((id, index) => (
            <li key={`${id}-${String(index)}`}>
              <code>{id}</code>
            </li>
          ))}
        </ol>
      </button>

      {selected && (
        <div className="finding-body">
          {explanation !== undefined && (
            <section className="explanation">
              <h4>Explanation</h4>
              <p>{explanation}</p>
            </section>
          )}

          <section>
            <h4>Evidence</h4>
            <ul className="evidence-list">
              {finding.evidence.map((evidence, index) => (
                <li key={index}>
                  <span className={`source source-${evidence.source.toLowerCase()}`}>{SOURCE_LABEL[evidence.source]}</span>
                  <span className="fact">
                    {evidence.fact}
                    {evidence.reference !== undefined && (
                      <>
                        {' '}
                        <a href={evidence.reference} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4>Expected signals after deployment</h4>
            <ul className="signal-list">
              {finding.verificationSignals.map((signal, index) => (
                <li key={index}>
                  {signal.kind === 'METRIC' ? (
                    <>
                      <span className={`direction direction-${signal.expectedDirection.toLowerCase()}`}>
                        {signal.expectedDirection === 'INCREASE' ? 'Rises' : 'Falls'}
                      </span>
                      <code>{signal.metricName}</code>
                      <span className="muted">{signal.description}</span>
                    </>
                  ) : (
                    <>
                      <span className="direction">Appears</span>
                      <code>{signal.pattern}</code>
                      <span className="muted">{signal.description}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="recommendation">
            <h4>Recommendation</h4>
            <p>{finding.recommendation}</p>
          </section>
        </div>
      )}
    </article>
  );
}
