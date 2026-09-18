import { CaretRightIcon, CircleNotchIcon, CloudCheckIcon, FileCodeIcon, GitDiffIcon, PlusIcon, WarningOctagonIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { AnalysisSummary } from '@adi/engine/types';
import { api, ApiError } from '../api/client.ts';
import { SeverityBadge, StatusBadge } from '../components/Badges.tsx';
import { relativeTime } from '../lib/format.ts';
import { SEVERITY_ICONS } from '../lib/icons.tsx';

export function HistoryView() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    api.listAnalyses().then(setAnalyses, (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Analyses could not be loaded');
    });
  }, []);

  return (
    <div className="page-single">
      <section className="hero hero-compact">
        <h1 className="display">
          <span className="keyword">history</span>.sort(newest)
        </h1>
        <p className="lead">Every change analyzed, with its highest severity and whether verification confirmed it.</p>
        <div className="hero-actions">
          <a className="button button-solid" href="#/">
            <PlusIcon weight="bold" aria-hidden="true" />
            New analysis
          </a>
        </div>
      </section>

      {error !== undefined && <p className="error-banner">{error}</p>}
      {analyses === undefined && error === undefined && (
        <p className="loading">
          <CircleNotchIcon weight="bold" className="spin" aria-hidden="true" />
          Loading analyses
        </p>
      )}
      {analyses?.length === 0 && (
        <div className="empty-state">
          <span className="icon-tile large">
            <GitDiffIcon weight="bold" aria-hidden="true" />
          </span>
          <h3>No analyses yet</h3>
          <p>
            <a href="#/">Analyze a change</a> to see it here.
          </p>
        </div>
      )}

      {analyses !== undefined && analyses.length > 0 && (
        <ul className="history-list">
          {analyses.map((analysis) => {
            const SeverityIcon = analysis.highestSeverity === undefined ? CloudCheckIcon : SEVERITY_ICONS[analysis.highestSeverity];
            const tone = analysis.highestSeverity?.toLowerCase() ?? 'matched';
            return (
              <li key={analysis.analysisId}>
                <a className="history-row" href={`#/analyses/${analysis.analysisId}`}>
                  <span className={`severity-tile tone-${tone}`}>
                    <SeverityIcon weight="fill" aria-hidden="true" />
                  </span>
                  <span className="history-main">
                    <strong>{relativeTime(analysis.createdAt)}</strong>
                    <span className="muted">
                      {analysis.stackName === undefined ? (
                        <>
                          <FileCodeIcon weight="bold" aria-hidden="true" /> Template comparison
                        </>
                      ) : (
                        <>
                          <CloudCheckIcon weight="bold" aria-hidden="true" /> Stack {analysis.stackName}
                        </>
                      )}
                    </span>
                  </span>
                  <span className="history-metric">
                    <GitDiffIcon weight="bold" aria-hidden="true" />
                    {analysis.changeCount}
                  </span>
                  <span className="history-metric">
                    <WarningOctagonIcon weight="bold" aria-hidden="true" />
                    {analysis.findingCount}
                  </span>
                  <span className="history-badges">
                    {analysis.highestSeverity !== undefined && <SeverityBadge severity={analysis.highestSeverity} />}
                    {analysis.verificationStatus === undefined ? (
                      <span className="badge tone-neutral">Not verified</span>
                    ) : (
                      <StatusBadge status={analysis.verificationStatus} />
                    )}
                  </span>
                  <CaretRightIcon weight="bold" className="caret" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
