import { ArrowRightIcon, CaretLeftIcon, CaretRightIcon, CloudCheckIcon, FileCodeIcon, ListChecksIcon } from '@phosphor-icons/react';
import { useRef } from 'react';
import { SeverityBadge } from '../components/Badges.tsx';
import { EXAMPLES } from '../lib/examples.ts';
import { ResourceGlyph } from '../lib/icons.tsx';

/** Types of the resources the scenarios change in the demonstration stack, for card icons. */
const CHANGED_TYPES: Readonly<Record<string, string>> = {
  DatabaseSecurityGroup: 'AWS::EC2::SecurityGroup',
  TaskExecutionRole: 'AWS::IAM::Role',
  TargetGroup: 'AWS::ElasticLoadBalancingV2::TargetGroup',
  TaskDefinition: 'AWS::ECS::TaskDefinition',
  Database: 'AWS::RDS::DBInstance',
  Listener: 'AWS::ElasticLoadBalancingV2::Listener',
};

const STARTS = [
  {
    href: '#/analyze',
    icon: FileCodeIcon,
    title: 'Compare templates',
    detail: 'Paste the current and the proposed template. Works without an AWS account.',
  },
  {
    href: '#/analyze/stack',
    icon: CloudCheckIcon,
    title: 'Compare with a stack',
    detail: 'Compare a proposed template with what a stack runs now, then verify after you deploy.',
  },
  {
    href: '#/analyze/change-set',
    icon: ListChecksIcon,
    title: 'Read a change set',
    detail: "Analyze a change set before you execute it, with CloudFormation's own replacement decisions.",
  },
] as const;

const STEPS: readonly { readonly title: string; readonly detail: string }[] = [
  { title: 'Diff', detail: 'Compare the proposed template with the current state, resource by resource.' },
  { title: 'Graph', detail: 'Build dependencies from Ref, GetAtt, Sub and DependsOn.' },
  { title: 'Impact', detail: 'Walk every resource the change can reach.' },
  { title: 'Rules', detail: 'Six deterministic rules turn reach into findings with evidence.' },
  { title: 'Explain', detail: 'Claude on Amazon Bedrock explains findings it did not produce.' },
  { title: 'Verify', detail: 'After you deploy, compare CloudWatch signals before and after.' },
];

export function HomeView() {
  const railRef = useRef<HTMLDivElement>(null);
  const scrollExamples = (direction: 1 | -1) => {
    railRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });
  };

  return (
    <div className="page-home">
      <section className="hero hero-split">
        <div className="hero-text">
          <h1 className="display">
            <span className="keyword">if</span> change: trace_impact()
          </h1>
          <p className="lead">
            What will this change affect? ADI builds the dependency graph of your CloudFormation stack, traces every
            resource a change can reach, and backs each finding with evidence. After you deploy, it checks whether the
            predicted signals actually moved.
          </p>
          <div className="hero-actions">
            <a className="button button-solid" href="#/analyze">
              <ArrowRightIcon weight="bold" aria-hidden="true" />
              Analyze a change
            </a>
            <a className="button button-outline" href="#/rules">
              Read the rules
            </a>
          </div>
        </div>
        <img className="hero-illustration" src={`${import.meta.env.BASE_URL}illustrations/server-cluster.svg`} alt="" />
      </section>

      <section className="section" aria-labelledby="start-heading">
        <h2 id="start-heading" className="section-title">
          Start from
        </h2>
        <div className="start-grid stagger">
          {STARTS.map(({ href, icon: StartIcon, title, detail }) => (
            <a key={href} className="start-card" href={href}>
              <span className="icon-tile">
                <StartIcon weight="bold" aria-hidden="true" />
              </span>
              <span className="start-title">{title}</span>
              <span className="start-detail">{detail}</span>
              <ArrowRightIcon weight="bold" className="start-arrow" aria-hidden="true" />
            </a>
          ))}
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
              <a key={example.id} className="example-card" href={`#/new/${example.id}`}>
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
              </a>
            );
          })}
        </div>
      </section>

      <section className="section" aria-labelledby="how-heading">
        <h2 id="how-heading" className="section-title">
          How ADI reads a change
        </h2>
        <ol className="step-grid stagger">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
              <strong>{step.title}</strong>
              <span className="muted">{step.detail}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
