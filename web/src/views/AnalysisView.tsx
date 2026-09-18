import { useEffect, useState } from 'react';
import type { AnalysisRecord, BlastRadius, VerificationRecord } from '@adi/engine/types';
import { api, ApiError } from '../api/client.ts';
import { ChangeList } from '../components/ChangeList.tsx';
import { FindingCard } from '../components/FindingCard.tsx';
import { ImpactGraph } from '../components/ImpactGraph.tsx';
import { VerificationPanel } from '../components/VerificationPanel.tsx';
import { plural, relativeTime } from '../lib/format.ts';

const POLL_INTERVAL_MS = 3000;
/** The explanation function times out after five minutes; past this the record will not change. */
const EXPLANATION_DEADLINE_MS = 6 * 60 * 1000;
const RADIUS_ORDER: readonly BlastRadius[] = ['APPLICATION', 'SERVICE', 'LOCAL'];
const RADIUS_LABEL: Readonly<Record<BlastRadius, string>> = {
  APPLICATION: 'Application',
  SERVICE: 'Service',
  LOCAL: 'Local',
};

type Tab = 'FINDINGS' | 'CHANGES' | 'VERIFICATION';

function explanationTimedOut(record: AnalysisRecord): boolean {
  return record.explanationStatus === 'PENDING' && Date.now() - Date.parse(record.createdAt) > EXPLANATION_DEADLINE_MS;
}

export function AnalysisView({ analysisId, initial }: { analysisId: string; initial: AnalysisRecord | undefined }) {
  const [record, setRecord] = useState<AnalysisRecord | undefined>(initial?.analysisId === analysisId ? initial : undefined);
  const [error, setError] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [tab, setTab] = useState<Tab>('FINDINGS');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await api.getAnalysis(analysisId);
        if (cancelled) {
          return;
        }
        setRecord(next);
        if (next.explanationStatus === 'PENDING' && !explanationTimedOut(next)) {
          timer = setTimeout(() => void load(), POLL_INTERVAL_MS);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : 'The analysis could not be loaded');
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [analysisId]);

  if (error !== undefined) {
    return <p className="error-banner">{error}</p>;
  }
  if (record === undefined) {
    return <p className="loading">Loading analysis</p>;
  }

  const selected = record.findings.find((f) => f.id === selectedId) ?? record.findings[0];
  const radius = RADIUS_ORDER.find((r) => record.impacts.some((i) => i.blastRadius === r));
  const explanationFor = (findingId: string) =>
    record.explanation?.findings.find((f) => f.findingId === findingId)?.explanation;

  const onVerified = (verification: VerificationRecord) => {
    setRecord({ ...record, verification });
  };

  return (
    <div className="analysis">
      <header className="analysis-header">
        <div>
          <p className="eyebrow">{record.stackName === undefined ? 'Template comparison' : `Stack ${record.stackName}`}</p>
          <h1>{selected?.title ?? 'No findings for this change'}</h1>
        </div>
        <dl className="stats">
          <div>
            <dt>Changes</dt>
            <dd>{record.changeSet.changes.length}</dd>
          </div>
          <div>
            <dt>Findings</dt>
            <dd>{record.findings.length}</dd>
          </div>
          <div>
            <dt>Blast radius</dt>
            <dd>{radius === undefined ? 'None' : RADIUS_LABEL[radius]}</dd>
          </div>
          <div>
            <dt>Analyzed</dt>
            <dd>{relativeTime(record.createdAt)}</dd>
          </div>
        </dl>
      </header>

      <div className="analysis-body">
        <ImpactGraph record={record} selected={selected} />

        <aside className="side-panel">
          <nav className="tabs" aria-label="Analysis sections">
            <button type="button" className={tab === 'FINDINGS' ? 'active' : ''} onClick={() => { setTab('FINDINGS'); }}>
              Findings <span className="count">{record.findings.length}</span>
            </button>
            <button type="button" className={tab === 'CHANGES' ? 'active' : ''} onClick={() => { setTab('CHANGES'); }}>
              Changes <span className="count">{record.changeSet.changes.length}</span>
            </button>
            <button type="button" className={tab === 'VERIFICATION' ? 'active' : ''} onClick={() => { setTab('VERIFICATION'); }}>
              Verification
            </button>
          </nav>

          {tab === 'FINDINGS' && (
            <div className="tab-content">
              <ExplanationBanner record={record} />
              {record.findings.length === 0 ? (
                <p className="empty">
                  {plural(record.changeSet.changes.length, 'change')} analyzed. None matched a rule, so ADI has nothing to
                  report. The Changes tab lists what differs.
                </p>
              ) : (
                record.findings.map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    explanation={explanationFor(finding.id)}
                    selected={finding.id === selected?.id}
                    onSelect={() => { setSelectedId(finding.id); }}
                  />
                ))
              )}
            </div>
          )}
          {tab === 'CHANGES' && (
            <div className="tab-content">
              <ChangeList changeSet={record.changeSet} impacts={record.impacts} />
            </div>
          )}
          {tab === 'VERIFICATION' && (
            <div className="tab-content">
              <VerificationPanel record={record} onVerified={onVerified} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ExplanationBanner({ record }: { record: AnalysisRecord }) {
  if (record.explanationStatus === 'NOT_REQUIRED') {
    return null;
  }
  if (record.explanationStatus === 'READY' && record.explanation !== undefined) {
    return (
      <section className="explanation-banner ready">
        <p>{record.explanation.summary}</p>
        <p className="attribution">
          Explained by <code>{record.explanation.model}</code> on Amazon Bedrock from the evidence below. Findings and
          severities come from deterministic rules.
        </p>
      </section>
    );
  }
  if (record.explanationStatus === 'PENDING' && !explanationTimedOut(record)) {
    return (
      <section className="explanation-banner pending">
        <span className="spinner" aria-hidden="true" />
        <p>Generating an explanation with Amazon Bedrock. The findings below are already complete.</p>
      </section>
    );
  }
  return (
    <section className="explanation-banner failed">
      <p>
        Explanation unavailable: {record.explanationError ?? 'the explanation did not complete in time'}. The findings are
        produced by deterministic rules and are unaffected.
      </p>
    </section>
  );
}
