import { useEffect, useState } from 'react';
import type { AnalysisSummary } from '@adi/engine/types';
import { api, ApiError } from '../api/client.ts';
import { SeverityBadge, StatusBadge } from '../components/Badges.tsx';
import { relativeTime } from '../lib/format.ts';

export function HistoryView() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    api.listAnalyses().then(setAnalyses, (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Analyses could not be loaded');
    });
  }, []);

  if (error !== undefined) {
    return <p className="error-banner">{error}</p>;
  }
  if (analyses === undefined) {
    return <p className="loading">Loading analyses</p>;
  }
  if (analyses.length === 0) {
    return (
      <p className="empty">
        No analyses yet. <a href="#/">Analyze a change</a> to get started.
      </p>
    );
  }

  return (
    <div className="history">
      <h1>Analyses</h1>
      <table className="history-table">
        <thead>
          <tr>
            <th>Analyzed</th>
            <th>Compared against</th>
            <th>Changes</th>
            <th>Findings</th>
            <th>Highest severity</th>
            <th>Verification</th>
          </tr>
        </thead>
        <tbody>
          {analyses.map((analysis) => (
            <tr key={analysis.analysisId}>
              <td>
                <a href={`#/analyses/${analysis.analysisId}`}>{relativeTime(analysis.createdAt)}</a>
              </td>
              <td>{analysis.stackName ?? 'Template'}</td>
              <td>{analysis.changeCount}</td>
              <td>{analysis.findingCount}</td>
              <td>{analysis.highestSeverity === undefined ? 'None' : <SeverityBadge severity={analysis.highestSeverity} />}</td>
              <td>{analysis.verificationStatus === undefined ? 'Not verified' : <StatusBadge status={analysis.verificationStatus} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
