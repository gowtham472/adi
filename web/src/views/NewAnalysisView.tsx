import {
  ArrowRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CircleNotchIcon,
  CloudCheckIcon,
  FileCodeIcon,
  GitDiffIcon,
  ListChecksIcon,
  TerminalIcon,
} from '@phosphor-icons/react';
import { useRef, useState, type SyntheticEvent } from 'react';
import type { AnalysisRecord } from '@adi/engine/types';
import { api, ApiError, type CreateAnalysisInput } from '../api/client.ts';
import { SeverityBadge } from '../components/Badges.tsx';
import { CodeEditor } from '../components/CodeEditor.tsx';
import { BASELINE_TEMPLATE, EXAMPLES } from '../lib/examples.ts';
import { ResourceGlyph } from '../lib/icons.tsx';

type CurrentSource = 'TEMPLATE' | 'STACK' | 'CHANGE_SET';

/** Types of the resources the scenarios change in the demonstration stack, for card icons. */
const CHANGED_TYPES: Readonly<Record<string, string>> = {
  DatabaseSecurityGroup: 'AWS::EC2::SecurityGroup',
  TaskExecutionRole: 'AWS::IAM::Role',
  TargetGroup: 'AWS::ElasticLoadBalancingV2::TargetGroup',
  TaskDefinition: 'AWS::ECS::TaskDefinition',
  Database: 'AWS::RDS::DBInstance',
  Listener: 'AWS::ElasticLoadBalancingV2::Listener',
};

const STEPS: readonly { readonly title: string; readonly detail: string }[] = [
  { title: 'Diff', detail: 'Compare the proposed template with the current state, resource by resource.' },
  { title: 'Graph', detail: 'Build dependencies from Ref, GetAtt, Sub and DependsOn.' },
  { title: 'Impact', detail: 'Walk every resource the change can reach.' },
  { title: 'Rules', detail: 'Six deterministic rules turn reach into findings with evidence.' },
  { title: 'Explain', detail: 'Claude on Amazon Bedrock explains findings it did not produce.' },
  { title: 'Verify', detail: 'After you deploy, compare CloudWatch signals before and after.' },
];

interface NewAnalysisViewProps {
  readonly exampleId: string | undefined;
  readonly onCreated: (record: AnalysisRecord) => void;
}

export function NewAnalysisView({ exampleId, onCreated }: NewAnalysisViewProps) {
  const initialExample = EXAMPLES.find((e) => e.id === exampleId);
  const [source, setSource] = useState<CurrentSource>('TEMPLATE');
  const [stackName, setStackName] = useState('adi-demo');
  const [changeSetName, setChangeSetName] = useState('');
  const [currentTemplate, setCurrentTemplate] = useState(initialExample === undefined ? '' : BASELINE_TEMPLATE);
  const [proposedTemplate, setProposedTemplate] = useState(initialExample?.proposedTemplate ?? '');
  const [selectedId, setSelectedId] = useState<string | undefined>(initialExample?.id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const railRef = useRef<HTMLDivElement>(null);
  const editorsRef = useRef<HTMLElement>(null);

  const loadExample = (id: string) => {
    const chosen = EXAMPLES.find((e) => e.id === id);
    if (chosen === undefined) {
      return;
    }
    setSelectedId(id);
    setProposedTemplate(chosen.proposedTemplate);
    setCurrentTemplate(BASELINE_TEMPLATE);
    setError(undefined);
  };

  const scrollExamples = (direction: 1 | -1) => {
    railRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const input: CreateAnalysisInput =
      source === 'CHANGE_SET'
        ? { stackName: stackName.trim(), changeSetName: changeSetName.trim() }
        : source === 'STACK'
          ? { stackName: stackName.trim(), proposedTemplate }
          : { currentTemplate, proposedTemplate };
    setSubmitting(true);
    setError(undefined);
    try {
      onCreated(await api.createAnalysis(input));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The analysis could not be created');
      setSubmitting(false);
    }
  };

  const ready =
    source === 'CHANGE_SET'
      ? stackName.trim() !== '' && changeSetName.trim() !== ''
      : proposedTemplate.trim() !== '' && (source === 'STACK' ? stackName.trim() !== '' : currentTemplate.trim() !== '');
  const selected = EXAMPLES.find((e) => e.id === selectedId);

  return (
    <div className="page-with-rail">
      <form className="page-column" onSubmit={(event) => void submit(event)}>
        <section className="hero">
          <h1 className="display">
            <span className="keyword">if</span> change: trace_impact()
          </h1>
          <p className="lead">
            What will this change affect? ADI builds the dependency graph of your CloudFormation stack, traces every
            resource a change can reach, and backs each finding with evidence. After you deploy, it checks whether the
            predicted signals actually moved.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="button button-solid"
              onClick={() => { editorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            >
              Paste templates
            </button>
            <a className="button button-outline" href="#/rules">
              Read the rules
            </a>
          </div>
        </section>

        <section className="section" aria-labelledby="examples-heading">
          <header className="section-header">
            <h2 id="examples-heading" className="section-title">
              Examples
            </h2>
            <div className="carousel-controls">
              <button type="button" className="icon-button" onClick={() => { scrollExamples(-1); }} aria-label="Previous examples">
                <CaretLeftIcon weight="bold" />
              </button>
              <button type="button" className="icon-button" onClick={() => { scrollExamples(1); }} aria-label="Next examples">
                <CaretRightIcon weight="bold" />
              </button>
            </div>
          </header>
          <div className="example-rail stagger" ref={railRef}>
            {EXAMPLES.map((example) => {
              const type = example.changedResource === undefined ? '' : (CHANGED_TYPES[example.changedResource] ?? '');
              return (
                <button
                  key={example.id}
                  type="button"
                  className={`example-card ${example.id === selectedId ? 'active' : ''}`}
                  onClick={() => { loadExample(example.id); }}
                  aria-pressed={example.id === selectedId}
                >
                  <span className="example-visual">
                    <span className="example-visual-top">
                      <code>{example.ruleId}</code>
                      {example.severity !== undefined && <SeverityBadge severity={example.severity} />}
                    </span>
                    <ResourceGlyph type={type} weight="light" className="example-glyph" aria-hidden="true" />
                    <code className="example-resource">{example.changedResource}</code>
                  </span>
                  <span className="example-title">{example.label}</span>
                  <span className="example-description">{example.description}</span>
                </button>
              );
            })}
          </div>
          {selected !== undefined && (
            <p className="notice">
              Loaded <strong>{selected.label}</strong>: the demonstration baseline as the current template and the modified
              template as the proposal.
            </p>
          )}
        </section>

        <section className="section" ref={editorsRef} aria-labelledby="templates-heading">
          <header className="section-header">
            <h2 id="templates-heading" className="section-title">
              Templates
            </h2>
            <div className="segmented" role="group" aria-label="Current state source">
              <button type="button" className={source === 'TEMPLATE' ? 'active' : ''} onClick={() => { setSource('TEMPLATE'); }}>
                <FileCodeIcon weight="bold" aria-hidden="true" />
                Compare templates
              </button>
              <button type="button" className={source === 'STACK' ? 'active' : ''} onClick={() => { setSource('STACK'); }}>
                <CloudCheckIcon weight="bold" aria-hidden="true" />
                Compare with a stack
              </button>
              <button type="button" className={source === 'CHANGE_SET' ? 'active' : ''} onClick={() => { setSource('CHANGE_SET'); }}>
                <ListChecksIcon weight="bold" aria-hidden="true" />
                Read a change set
              </button>
            </div>
          </header>

          {source === 'CHANGE_SET' ? (
            <div className="editor change-set-panel">
              <div className="editor-header">
                <ListChecksIcon weight="bold" aria-hidden="true" />
                <span className="editor-file">CloudFormation change set</span>
              </div>
              <div className="stack-input change-set-fields">
                <div>
                  <label htmlFor="change-set-stack">Stack name</label>
                  <input id="change-set-stack" value={stackName} onChange={(e) => { setStackName(e.target.value); }} spellCheck={false} />
                </div>
                <div>
                  <label htmlFor="change-set-name">Change set name or ARN</label>
                  <input
                    id="change-set-name"
                    value={changeSetName}
                    onChange={(e) => { setChangeSetName(e.target.value); }}
                    placeholder="scenario-01"
                    spellCheck={false}
                  />
                </div>
                <p className="hint">
                  ADI reads the template the change set would deploy and uses CloudFormation's own replacement decision
                  for each modified resource. Reading a change set does not execute it. Create one with{' '}
                  <code>aws cloudformation create-change-set</code>.
                </p>
              </div>
            </div>
          ) : (
            <div className="editor-grid">
              {source === 'STACK' ? (
                <div className="editor">
                  <div className="editor-header">
                    <CloudCheckIcon weight="bold" aria-hidden="true" />
                    <span className="editor-file">Deployed stack</span>
                  </div>
                  <div className="stack-input">
                    <label htmlFor="stack-name">CloudFormation stack name</label>
                    <input id="stack-name" value={stackName} onChange={(e) => { setStackName(e.target.value); }} spellCheck={false} />
                    <p className="hint">
                      ADI reads the template the stack was last deployed with. An analysis against a stack can be verified
                      with CloudWatch after you deploy the change.
                    </p>
                  </div>
                </div>
              ) : (
                <CodeEditor
                  label="Current template"
                  fileName="current.yaml"
                  icon={FileCodeIcon}
                  value={currentTemplate}
                  placeholder="Paste the current CloudFormation template, YAML or JSON"
                  onChange={setCurrentTemplate}
                />
              )}
              <CodeEditor
                label="Proposed template"
                fileName="proposed.yaml"
                icon={GitDiffIcon}
                value={proposedTemplate}
                placeholder="Paste the template you intend to deploy"
                onChange={setProposedTemplate}
              />
            </div>
          )}

          {error !== undefined && <p className="error-banner">{error}</p>}

          <div className="submit-row">
            <button type="submit" className="button button-solid button-large" disabled={!ready || submitting}>
              {submitting ? (
                <CircleNotchIcon weight="bold" className="spin" aria-hidden="true" />
              ) : (
                <ArrowRightIcon weight="bold" aria-hidden="true" />
              )}
              {submitting ? 'Analyzing' : 'Analyze change'}
            </button>
            <span className="muted">
              {source === 'CHANGE_SET'
                ? `Reads change set ${changeSetName.trim() === '' ? '' : `${changeSetName.trim()} `}on stack ${stackName}`
                : source === 'STACK'
                  ? `Compares against the deployed stack ${stackName}`
                  : 'Compares the two templates above'}
            </span>
          </div>
        </section>
      </form>

      <aside className="rail">
        <div className="rail-block">
          <span className="terminal-mark" aria-hidden="true">
            <TerminalIcon weight="bold" />
          </span>
          <h2 className="rail-title">How ADI reads a change</h2>
          <ol className="steps stagger">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{step.title}</strong>
                  <span className="muted">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rail-block">
          <h2 className="rail-title">Evidence first</h2>
          <p className="rail-text">
            Every finding cites the facts it rests on. When the evidence does not support a prediction after deployment,
            verification reports it as unconfirmed rather than matched.
          </p>
          <a className="button button-outline" href="#/rules">
            Browse the rules
          </a>
        </div>
      </aside>
    </div>
  );
}
