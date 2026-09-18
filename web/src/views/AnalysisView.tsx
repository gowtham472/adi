import {
  CaretRightIcon,
  CheckIcon,
  ClipboardTextIcon,
  DownloadSimpleIcon,
  CloudCheckIcon,
  FileCodeIcon,
  GitDiffIcon,
  InfoIcon,
  PulseIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { analysisReport } from '@adi/engine/report';
import type { AnalysisRecord, BlastRadius, VerificationRecord } from '@adi/engine/types';
import { api, ApiError } from '../api/client.ts';
import { SeverityBadge } from '../components/Badges.tsx';
import { ChangeList } from '../components/ChangeList.tsx';
import { AnalysisSkeleton } from '../components/AnalysisSkeleton.tsx';
import { CountUp } from '../components/CountUp.tsx';
import { FindingCard } from '../components/FindingCard.tsx';
import { ImpactGraph } from '../components/ImpactGraph.tsx';
import { Lifecycle } from '../components/Lifecycle.tsx';
import { NodeInspector } from '../components/NodeInspector.tsx';
import { ReportDialog } from '../components/ReportDialog.tsx';
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
  const [inspectedId, setInspectedId] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInspectedId(undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

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
    return <AnalysisSkeleton />;
  }

  const selected = record.findings.find((f) => f.id === selectedId) ?? record.findings[0];
  const radius = RADIUS_ORDER.find((r) => record.impacts.some((i) => i.blastRadius === r));
  const affectedCount = new Set(record.impacts.flatMap((i) => i.affected.map((a) => a.resourceId))).size;
  const explanationFor = (findingId: string) =>
    record.explanation?.findings.find((f) => f.findingId === findingId)?.explanation;

  const onVerified = (verification: VerificationRecord) => {
    setRecord({ ...record, verification });
  };

  const copyReport = () => {
    navigator.clipboard.writeText(analysisReport(record)).then(
      () => {
        setCopied(true);
        setTimeout(() => { setCopied(false); }, 2400);
      },
      () => { setReportOpen(true); },
    );
  };

  const downloadReport = () => {
    const url = URL.createObjectURL(new Blob([analysisReport(record)], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `adi-analysis-${record.analysisId.slice(0, 8)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectFinding = (findingId: string) => {
    setSelectedId(findingId);
    document.getElementById(`finding-${findingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="page-with-rail analysis-page">
      <div className="page-column">
        <div className="page-toolbar">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <a href="#/analyses">Analyses</a>
            <CaretRightIcon weight="bold" aria-hidden="true" />
            <span>{relativeTime(record.createdAt)}</span>
          </nav>
          <div className="toolbar-actions">
            <button type="button" className="button button-outline button-small" onClick={copyReport}>
              {copied ? <CheckIcon weight="bold" aria-hidden="true" /> : <ClipboardTextIcon weight="bold" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy report'}
            </button>
            <button type="button" className="button button-outline button-small" onClick={downloadReport}>
              <DownloadSimpleIcon weight="bold" aria-hidden="true" />
              Markdown
            </button>
          </div>
        </div>

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
                {record.changeSetName !== undefined && (
                  <>
                    , change set <code>{record.changeSetName}</code>
                  </>
                )}
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

        <dl className="stat-strip stagger">
          <div>
            <dt>Changes</dt>
            <dd>
              <CountUp value={record.changeSet.changes.length} />
            </dd>
          </div>
          <div>
            <dt>Affected</dt>
            <dd>
              <CountUp value={affectedCount} />
            </dd>
          </div>
          <div>
            <dt>Findings</dt>
            <dd>
              <CountUp value={record.findings.length} />
            </dd>
          </div>
          <div>
            <dt>Blast radius</dt>
            <dd>{radius === undefined ? 'None' : RADIUS_LABEL[radius]}</dd>
          </div>
        </dl>

        {reportOpen && (
          <ReportDialog
            report={analysisReport(record)}
            onDownload={downloadReport}
            onClose={() => { setReportOpen(false); }}
          />
        )}

        <Lifecycle record={record} explanationTimedOut={explanationTimedOut(record)} />

        <ImpactGraph
          record={record}
          selected={selected}
          inspectedId={inspectedId}
          onInspect={setInspectedId}
          inspector={
            inspectedId === undefined ? undefined : (
              <NodeInspector
                record={record}
                resourceId={inspectedId}
                onInspect={setInspectedId}
                onSelectFinding={selectFinding}
                onClose={() => { setInspectedId(undefined); }}
              />
            )
          }
        />

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
          <div className="tab-body" key={tab}>
            {tab === 'CHANGES' ? (
              <ChangeList changeSet={record.changeSet} impacts={record.impacts} />
            ) : (
              <VerificationPanel record={record} onVerified={onVerified} />
            )}
          </div>
        </section>
      </div>

      <aside className="rail findings-rail stagger" aria-label="Findings">
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
              onInspect={setInspectedId}
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
