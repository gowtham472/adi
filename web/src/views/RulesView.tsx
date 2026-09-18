import { ArrowRightIcon, LightbulbIcon } from '@phosphor-icons/react';
import { RULES } from '../lib/rules.ts';
import { ResourceGlyph } from '../lib/icons.tsx';

export function RulesView() {
  return (
    <div className="page-single">
      <section className="hero hero-compact">
        <h1 className="display">
          <span className="keyword">rules</span>.length === 6
        </h1>
        <p className="lead">
          Every finding comes from one of these deterministic rules. Each one has a scenario in the repository and a test
          that asserts its exact severity, causal path and signals.
        </p>
      </section>

      <ul className="rule-list">
        {RULES.map((rule) => (
          <li key={rule.id} className="rule-card">
            <div className="rule-head">
              <span className="rule-icon">
                <ResourceGlyph type={rule.resourceType} weight="bold" aria-hidden="true" />
              </span>
              <div>
                <code className="rule-id">{rule.id}</code>
                <h2>{rule.name}</h2>
              </div>
              <a className="button button-outline button-small" href={`#/new/${rule.exampleId}`}>
                Try it
                <ArrowRightIcon weight="bold" aria-hidden="true" />
              </a>
            </div>
            <dl className="rule-facts">
              <div>
                <dt>Fires when</dt>
                <dd>{rule.trigger}</dd>
              </div>
              <div>
                <dt>Severity</dt>
                <dd>{rule.severity}</dd>
              </div>
              <div>
                <dt>Verified by</dt>
                <dd>{rule.signals}</dd>
              </div>
            </dl>
            <p className="rule-insight">
              <LightbulbIcon weight="fill" aria-hidden="true" />
              {rule.insight}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
