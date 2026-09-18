import {
  CaretRightIcon,
  CircleNotchIcon,
  CloudCheckIcon,
  FileCodeIcon,
  GitDiffIcon,
  InfoIcon,
  PulseIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { AnalysisRecord, BlastRadius, VerificationRecord } from '@adi/engine/types';
import { api, ApiError } from '../api/client.ts';
import { SeverityBadge } from '../components/Badges.tsx';
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

type Tab = 'CHANGES' | 'VERIFICATION';

function explanationTimedOut(record: AnalysisRecord): boolean {
  return record.explanationStatus === 'PENDING' && Date.now() - Date.parse(record.createdAt) > EXPLANATION_DEADLINE_MS;
}

export function AnalysisView({ analysisId, initial }: { analysisId: string; initial: AnalysisRecord | undefined }) {
  const [record, setRecord] = useState<AnalysisRecord | undefined>(initial?.analysisId === analysisId ? initial : undefined);
  const [error, setError] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [tab, setTab] = useState<Tab>('CHANGES');

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
    return (
      <p className="loading">
        <CircleNotchIcon weight="bold" className="spin" aria-hidden="true" />
        Loading analysis
      </p>
    );
  }

  const selected = record.findings.find((f) => f.id === selectedId) ?? record.findings[0];
  const radius = RADIUS_ORDER.find((r) => record.impacts.some((i) => i.blastRadius === r));
  const affectedCount = new Set(record.impacts.flatMap((i) => i.affected.map((a) => a.resourceId))).size;
  const explanationFor = (findingId: string) =>
    record.explanation?.findings.find((f) => f.findingId === findingId)?.explanation;

  const onVerified = (verification: VerificationRecord) => {
    setRecord({ ...record, verification });
  };

  return (
    <div className="page-with-rail analysis-page">
      <div className="page-column">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <a href="#/analyses">Analyses</a>
          <CaretRightIcon weight="bold" aria-hidden="true" />
          <span>{relativeTime(record.createdAt)}</span>
        </nav>

        <header className="analysis-header">
          <span className="context-chip">
            {record.stackName === undefined ? (
              <>
                <FileCodeIcon weight="bold" aria-hidden="true" />
                Template comparison
              </>
            ) : (
              <>
                <CloudCheckIcon weight="bold" aria-hidden="true" />
                Stack <code>{record.stackName}</code>
              </>
            )}
          </span>
          <h1>{selected?.title ?? 'No findings for this change'}</h1>
          {selected !== undefined && (
            <p className="analysis-subtitle">
              <SeverityBadge severity={selected.severity} />
              <code>{selected.ruleId}</code>
              <span>
                {selected.changedResource} reaches {plural(selected.affectedResources.length, 'resource')}
              </span>
            </p>
          )}
        </header>

        <dl className="stat-strip">
          <div>
            <dt>Changes</dt>
            <dd>{record.changeSet.changes.length}</dd>
          </div>
          <div>
            <dt>Affected</dt>
            <dd>{affectedCount}</dd>
          </div>
          <div>
            <dt>Findings</dt>
            <dd>{record.findings.length}</dd>
          </div>
          <div>
            <dt>Blast radius</dt>
            <dd>{radius === undefined ? 'None' : RADIUS_LABEL[radius]}</dd>
          </div>
        </dl>

        <ImpactGraph record={record} selected={selected} />

        <section className="detail-tabs">
          <nav className="tabs" aria-label="Analysis details">
            <button type="button" className={tab === 'CHANGES' ? 'active' : ''} onClick={() => { setTab('CHANGES'); }}>
              <GitDiffIcon weight="bold" aria-hidden="true" />
              Changes
              <span className="count">{record.changeSet.changes.length}</span>
            </button>
            <button type="button" className={tab === 'VERIFICATION' ? 'active' : ''} onClick={() => { setTab('VERIFICATION'); }}>
              <PulseIcon weight="bold" aria-hidden="true" />
              Verification
            </button>
          </nav>
          <div className="tab-body">
            {tab === 'CHANGES' ? (
              <ChangeList changeSet={record.changeSet} impacts={record.impacts} />
            ) : (
              <VerificationPanel record={record} onVerified={onVerified} />
            )}
          </div>
        </section>
      </div>

      <aside className="rail findings-rail" aria-label="Findings">
        <header className="rail-header">
          <h2 className="rail-title">Findings</h2>
          <span className="count">{record.findings.length}</span>
        </header>
        <ExplanationBanner record={record} />
        {record.findings.length === 0 ? (
          <div className="empty-state">
            <CloudCheckIcon weight="bold" className="tone-matched" aria-hidden="true" />
            <h3>No rule matched this change</h3>
            <p>
              {plural(record.changeSet.changes.length, 'change')} analyzed and none matched a rule. The Changes tab lists
              what differs.
            </p>
          </div>
        ) : (
          record.findings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              explanation={explanationFor(finding.id)}
              explanationModel={record.explanation?.model}
              selected={finding.id === selected?.id}
              onSelect={() => { setSelectedId(finding.id); }}
            />
          ))
        )}
      </aside>
    </div>
  );
}

function ExplanationBanner({ record }: { record: AnalysisRecord }) {
  if (record.explanationStatus === 'NOT_REQUIRED') {
    return null;
  }
  if (record.explanationStatus === 'READY' && record.explanation !== undefined) {
    return (
      <section className="explanation-banner">
        <header>
          <SparkleIcon weight="fill" aria-hidden="true" />
          Summary
          <code>{record.explanation.model}</code>
        </header>
        <p>{record.explanation.summary}</p>
        <p className="attribution">Written on Amazon Bedrock from the evidence below. Rules set every severity.</p>
      </section>
    );
  }
  if (record.explanationStatus === 'PENDING' && !explanationTimedOut(record)) {
    return (
      <section className="explanation-banner muted-banner">
        <SparkleIcon weight="fill" className="breathe" aria-hidden="true" />
        <p>Writing an explanation with Amazon Bedrock. The findings are already complete.</p>
      </section>
    );
  }
  return (
    <section className="explanation-banner muted-banner">
      <InfoIcon weight="bold" aria-hidden="true" />
      <p>
        Explanation unavailable: {record.explanationError ?? 'the explanation did not complete in time'}. The findings come
        from deterministic rules and are unaffected.
      </p>
    </section>
  );
}
