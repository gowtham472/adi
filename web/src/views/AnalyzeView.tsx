import { ArrowRightIcon, CircleNotchIcon, CloudCheckIcon, FileCodeIcon, FlaskIcon, GitDiffIcon, ListChecksIcon } from '@phosphor-icons/react';
import { useState, type SyntheticEvent } from 'react';
import type { AnalysisRecord } from '@adi/engine/types';
import { api, ApiError, type CreateAnalysisInput } from '../api/client.ts';
import { CodeEditor } from '../components/CodeEditor.tsx';
import { BASELINE_TEMPLATE, EXAMPLES } from '../lib/examples.ts';

export type AnalyzeMode = 'TEMPLATE' | 'STACK' | 'CHANGE_SET';

const MODES: readonly { readonly id: AnalyzeMode; readonly label: string; readonly icon: typeof FileCodeIcon }[] = [
  { id: 'TEMPLATE', label: 'Compare templates', icon: FileCodeIcon },
  { id: 'STACK', label: 'Compare with a stack', icon: CloudCheckIcon },
  { id: 'CHANGE_SET', label: 'Read a change set', icon: ListChecksIcon },
];

interface AnalyzeViewProps {
  readonly exampleId: string | undefined;
  readonly mode: AnalyzeMode;
  readonly onCreated: (record: AnalysisRecord) => void;
}

/**
 * The analysis workspace. Everything needed to start an analysis, from choosing the input
 * to the Analyze button, fits on one screen, so nothing has to be scrolled into view.
 */
export function AnalyzeView({ exampleId, mode, onCreated }: AnalyzeViewProps) {
  const initialExample = EXAMPLES.find((e) => e.id === exampleId);
  const [source, setSource] = useState<AnalyzeMode>(mode);
  const [stackName, setStackName] = useState('adi-demo');
  const [changeSetName, setChangeSetName] = useState('');
  const [currentTemplate, setCurrentTemplate] = useState(initialExample === undefined ? '' : BASELINE_TEMPLATE);
  const [proposedTemplate, setProposedTemplate] = useState(initialExample?.proposedTemplate ?? '');
  const [selectedId, setSelectedId] = useState<string | undefined>(initialExample?.id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

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
    <form className="analyze-page" onSubmit={(event) => void submit(event)}>
      <header className="analyze-header">
        <div className="analyze-title">
          <h1>
            <span className="keyword">analyze</span>(change)
          </h1>
          <p className="muted">Choose what the proposed change is compared against, then analyze it.</p>
        </div>
        <div className="analyze-controls">
          <div className="segmented" role="group" aria-label="What to compare against">
            {MODES.map(({ id, label, icon: ModeIcon }) => (
              <button key={id} type="button" className={source === id ? 'active' : ''} onClick={() => { setSource(id); }}>
                <ModeIcon weight="bold" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {source !== 'CHANGE_SET' && (
            <label className="example-picker">
              <FlaskIcon weight="bold" aria-hidden="true" />
              <span className="visually-hidden">Load an example</span>
              <select
                value={selectedId ?? ''}
                onChange={(e) => { loadExample(e.target.value); }}
              >
                <option value="" disabled>
                  Load an example
                </option>
                {EXAMPLES.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.ruleId}: {example.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </header>

      {selected !== undefined && source !== 'CHANGE_SET' && (
        <p className="notice">
          Loaded <strong>{selected.label}</strong>: {selected.description}
        </p>
      )}

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
              ADI reads the template the change set would deploy and uses CloudFormation's own replacement decision for
              each modified resource. Reading a change set does not execute it. Create one with{' '}
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
    </form>
  );
}
