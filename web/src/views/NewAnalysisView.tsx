import { useState, type SyntheticEvent } from 'react';
import { api, ApiError, type CreateAnalysisInput } from '../api/client.ts';
import { BASELINE_TEMPLATE, EXAMPLES } from '../lib/examples.ts';
import type { AnalysisRecord } from '@adi/engine/types';

type CurrentSource = 'TEMPLATE' | 'STACK';

interface NewAnalysisViewProps {
  readonly onCreated: (record: AnalysisRecord) => void;
}

export function NewAnalysisView({ onCreated }: NewAnalysisViewProps) {
  const [source, setSource] = useState<CurrentSource>('TEMPLATE');
  const [stackName, setStackName] = useState('adi-demo');
  const [currentTemplate, setCurrentTemplate] = useState('');
  const [proposedTemplate, setProposedTemplate] = useState('');
  const [exampleId, setExampleId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const example = EXAMPLES.find((e) => e.id === exampleId);

  const loadExample = (id: string) => {
    const chosen = EXAMPLES.find((e) => e.id === id);
    if (chosen === undefined) {
      return;
    }
    setExampleId(id);
    setProposedTemplate(chosen.proposedTemplate);
    setCurrentTemplate(BASELINE_TEMPLATE);
    setError(undefined);
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const input: CreateAnalysisInput =
      source === 'STACK' ? { stackName: stackName.trim(), proposedTemplate } : { currentTemplate, proposedTemplate };
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
    proposedTemplate.trim() !== '' && (source === 'STACK' ? stackName.trim() !== '' : currentTemplate.trim() !== '');

  return (
    <form className="new-analysis" onSubmit={(event) => void submit(event)}>
      <section className="intro">
        <h1>What will this change affect?</h1>
        <p>
          Compare a proposed CloudFormation template with the current state of a stack. ADI builds the dependency graph,
          traces every resource the change can reach, and reports findings backed by evidence from the template, the
          graph and the AWS documentation.
        </p>
      </section>

      <section className="examples" aria-label="Example changes">
        <h2>Start from an example change to the demonstration stack</h2>
        <div className="example-list">
          {EXAMPLES.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`example ${e.id === exampleId ? 'active' : ''}`}
              onClick={() => { loadExample(e.id); }}
            >
              {e.label}
            </button>
          ))}
        </div>
        {example !== undefined && <p className="example-description">{example.description}</p>}
      </section>

      <div className="template-grid">
        <section className="template-panel">
          <header>
            <h2>Current state</h2>
            <div className="segmented" role="group" aria-label="Current state source">
              <button type="button" className={source === 'TEMPLATE' ? 'active' : ''} onClick={() => { setSource('TEMPLATE'); }}>
                Template
              </button>
              <button type="button" className={source === 'STACK' ? 'active' : ''} onClick={() => { setSource('STACK'); }}>
                Deployed stack
              </button>
            </div>
          </header>
          {source === 'STACK' ? (
            <div className="stack-input">
              <label htmlFor="stack-name">Stack name</label>
              <input id="stack-name" value={stackName} onChange={(e) => { setStackName(e.target.value); }} spellCheck={false} />
              <p className="hint">
                ADI reads the template the stack was last deployed with. Analyses against a stack can be verified after you
                deploy the change.
              </p>
            </div>
          ) : (
            <textarea
              aria-label="Current template"
              value={currentTemplate}
              onChange={(e) => { setCurrentTemplate(e.target.value); }}
              placeholder="Paste the current CloudFormation template (YAML or JSON)"
              spellCheck={false}
              wrap="off"
            />
          )}
        </section>

        <section className="template-panel">
          <header>
            <h2>Proposed template</h2>
          </header>
          <textarea
            aria-label="Proposed template"
            value={proposedTemplate}
            onChange={(e) => { setProposedTemplate(e.target.value); }}
            placeholder="Paste the template you intend to deploy"
            spellCheck={false}
            wrap="off"
          />
        </section>
      </div>

      {error !== undefined && <p className="error-banner">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={!ready || submitting}>
          {submitting ? 'Analyzing' : 'Analyze change'}
        </button>
      </div>
    </form>
  );
}
