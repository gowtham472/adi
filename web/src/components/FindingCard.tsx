import {
  ArrowUpRightIcon,
  CaretDownIcon,
  CaretRightIcon,
  LightbulbIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
  TrendDownIcon,
  TrendUpIcon,
} from '@phosphor-icons/react';
import type { Finding } from '@adi/engine/types';
import { EVIDENCE_ICONS, EVIDENCE_LABELS, SEVERITY_ICONS } from '../lib/icons.tsx';

interface FindingCardProps {
  readonly finding: Finding;
  readonly explanation: string | undefined;
  readonly explanationModel: string | undefined;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onInspect: (resourceId: string) => void;
}

export function FindingCard({ finding, explanation, explanationModel, selected, onSelect, onInspect }: FindingCardProps) {
  const tone = finding.severity.toLowerCase();
  const SeverityIcon = SEVERITY_ICONS[finding.severity];

  return (
    <article id={`finding-${finding.id}`} className={`finding-card tone-border-${tone} ${selected ? 'selected' : ''}`}>
      <button type="button" className="finding-header" onClick={onSelect} aria-expanded={selected}>
        <span className={`severity-tile tone-${tone}`}>
          <SeverityIcon weight="fill" aria-hidden="true" />
        </span>
        <span className="finding-heading">
          <span className="finding-meta">
            <span className={`severity-label tone-${tone}`}>{finding.severity}</span>
            <code>{finding.ruleId}</code>
            <span className="category">{finding.category.toLowerCase()}</span>
          </span>
          <span className="finding-title">{finding.title}</span>
        </span>
        {selected ? (
          <CaretDownIcon weight="bold" className="caret" aria-hidden="true" />
        ) : (
          <CaretRightIcon weight="bold" className="caret" aria-hidden="true" />
        )}
      </button>
      <ol className="causal-path" aria-label="Causal path, select a resource to inspect it">
        {finding.causalPath.map((id, index) => (
          <li key={`${id}-${String(index)}`}>
            {index > 0 && <CaretRightIcon weight="bold" aria-hidden="true" />}
            <button type="button" onClick={() => { onInspect(id); }} title={`Inspect ${id}`}>
              {id}
            </button>
          </li>
        ))}
      </ol>

      {selected && (
        <div className="finding-body">
          {explanation !== undefined && (
            <section className="callout callout-ai">
              <header>
                <SparkleIcon weight="fill" aria-hidden="true" />
                Explanation
                {explanationModel !== undefined && <code>{explanationModel}</code>}
              </header>
              <p>{explanation}</p>
            </section>
          )}

          <section>
            <h4>
              <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
              Evidence
            </h4>
            <ol className="evidence-timeline">
              {finding.evidence.map((evidence, index) => {
                const SourceIcon = EVIDENCE_ICONS[evidence.source];
                return (
                  <li key={index} className={`source-${evidence.source.toLowerCase()}`}>
                    <span className="evidence-node">
                      <SourceIcon weight="bold" aria-hidden="true" />
                    </span>
                    <div className="evidence-content">
                      <span className="evidence-source">{EVIDENCE_LABELS[evidence.source]}</span>
                      <p>
                        {evidence.fact}
                        {evidence.reference !== undefined && (
                          <a href={evidence.reference} target="_blank" rel="noreferrer" className="source-link">
                            Source
                            <ArrowUpRightIcon weight="bold" aria-hidden="true" />
                          </a>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section>
            <h4>
              <TrendUpIcon weight="bold" aria-hidden="true" />
              Expected after deployment
            </h4>
            <ul className="signal-list">
              {finding.verificationSignals.map((signal, index) =>
                signal.kind === 'METRIC' ? (
                  <li key={index}>
                    <span className={`trend-tile ${signal.expectedDirection === 'INCREASE' ? 'rise' : 'fall'}`}>
                      {signal.expectedDirection === 'INCREASE' ? (
                        <TrendUpIcon weight="bold" aria-hidden="true" />
                      ) : (
                        <TrendDownIcon weight="bold" aria-hidden="true" />
                      )}
                    </span>
                    <span>
                      <code>{signal.metricName}</code>
                      <span className="muted">{signal.description}</span>
                    </span>
                  </li>
                ) : (
                  <li key={index}>
                    <span className="trend-tile">
                      <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
                    </span>
                    <span>
                      <code>{signal.pattern}</code>
                      <span className="muted">{signal.description}</span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </section>

          <section className="callout callout-recommendation">
            <header>
              <LightbulbIcon weight="fill" aria-hidden="true" />
              Recommendation
            </header>
            <p>{finding.recommendation}</p>
          </section>
        </div>
      )}
    </article>
  );
}
