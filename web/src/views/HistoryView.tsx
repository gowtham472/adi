import {
  CaretRightIcon,
  CloudCheckIcon,
  FileCodeIcon,
  GitDiffIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { AnalysisSummary, Severity } from '@adi/engine/types';
import { api, ApiError } from '../api/client.ts';
import { SeverityBadge, StatusBadge } from '../components/Badges.tsx';
import { absoluteTime, relativeTime } from '../lib/format.ts';
import { SEVERITY_ICONS } from '../lib/icons.tsx';

type SeverityFilter = 'ALL' | Severity | 'NONE';

const FILTERS: readonly { readonly id: SeverityFilter; readonly label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'CRITICAL', label: 'Critical' },
  { id: 'HIGH', label: 'High' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'LOW', label: 'Low' },
  { id: 'NONE', label: 'No findings' },
];

function matchesFilter(analysis: AnalysisSummary, filter: SeverityFilter): boolean {
  if (filter === 'ALL') {
    return true;
  }
  return filter === 'NONE' ? analysis.highestSeverity === undefined : analysis.highestSeverity === filter;
}

function matchesQuery(analysis: AnalysisSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return true;
  }
  const haystack = [analysis.stackName ?? 'template comparison', analysis.analysisId, analysis.highestSeverity ?? '']
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function HistoryView() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [filter, setFilter] = useState<SeverityFilter>('ALL');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.listAnalyses().then(setAnalyses, (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Analyses could not be loaded');
    });
  }, []);

  const visible = (analyses ?? []).filter((a) => matchesFilter(a, filter) && matchesQuery(a, query));

  return (
    <div className="page-single">
      <section className="hero hero-compact">
        <h1 className="display">
          <span className="keyword">history</span>.sort(newest)
        </h1>
        <p className="lead">Every change analyzed, with its highest severity and whether verification confirmed it.</p>
        <div className="hero-actions">
          <a className="button button-solid" href="#/analyze">
            <PlusIcon weight="bold" aria-hidden="true" />
            New analysis
          </a>
        </div>
      </section>

      {error !== undefined && <p className="error-banner">{error}</p>}

      {analyses === undefined && error === undefined && (
        <div className="history-list" aria-busy="true" aria-label="Loading analyses">
          {[0, 1, 2, 3].map((row) => (
            <span key={row} className="skeleton skeleton-row" />
          ))}
        </div>
      )}

      {analyses?.length === 0 && (
        <div className="empty-state">
          <GitDiffIcon weight="bold" aria-hidden="true" />
          <h3>No analyses yet</h3>
          <p>
            <a href="#/analyze">Analyze a change</a> to see it here.
          </p>
        </div>
      )}

      {analyses !== undefined && analyses.length > 0 && (
        <>
          <div className="filter-bar">
            <div className="filter-chips" role="group" aria-label="Filter by highest severity">
              {FILTERS.map(({ id, label }) => {
                const count = analyses.filter((a) => matchesFilter(a, id)).length;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`chip ${filter === id ? 'active' : ''}`}
                    onClick={() => { setFilter(id); }}
                    aria-pressed={filter === id}
                    disabled={count === 0 && id !== 'ALL'}
                  >
                    {label}
                    <span className="chip-count">{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="search">
              <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); }}
                placeholder="Search by stack or ID"
                aria-label="Search analyses"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="empty">No analyses match these filters.</p>
          ) : (
            <ul className="history-list stagger">
              {visible.map((analysis) => {
                const SeverityIcon =
                  analysis.highestSeverity === undefined ? CloudCheckIcon : SEVERITY_ICONS[analysis.highestSeverity];
                const tone = analysis.highestSeverity?.toLowerCase() ?? 'matched';
                return (
                  <li key={analysis.analysisId}>
                    <a className="history-row" href={`#/analyses/${analysis.analysisId}`}>
                      <span className={`severity-tile tone-${tone}`}>
                        <SeverityIcon weight="fill" aria-hidden="true" />
                      </span>
                      <span className="history-main">
                        <strong title={absoluteTime(analysis.createdAt)}>{relativeTime(analysis.createdAt)}</strong>
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
                      <span className="history-metric" title="Changes">
                        <GitDiffIcon weight="bold" aria-hidden="true" />
                        {analysis.changeCount}
                      </span>
                      <span className="history-metric" title="Findings">
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
        </>
      )}
    </div>
  );
}
