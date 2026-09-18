import {
  BookOpenIcon,
  CaretDownIcon,
  ClockCounterClockwiseIcon,
  FlaskIcon,
  HouseSimpleIcon,
  ListChecksIcon,
  ListIcon,
  PlusIcon,
  SidebarSimpleIcon,
  TreeStructureIcon,
  XIcon,
  type Icon,
} from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { AnalysisRecord } from '@adi/engine/types';
import { EXAMPLES } from './lib/examples.ts';
import { SEVERITY_ICONS } from './lib/icons.tsx';
import { RULES } from './lib/rules.ts';
import { readPreference, writePreference } from './lib/preferences.ts';
import { AnalysisView } from './views/AnalysisView.tsx';
import { HistoryView } from './views/HistoryView.tsx';
import { NewAnalysisView } from './views/NewAnalysisView.tsx';
import { RulesView } from './views/RulesView.tsx';

type Route =
  | { readonly view: 'NEW'; readonly exampleId?: string }
  | { readonly view: 'HISTORY' }
  | { readonly view: 'RULES' }
  | { readonly view: 'ANALYSIS'; readonly analysisId: string };

type NavPreference = 'EXPANDED' | 'COLLAPSED';

/** Hash routes keep the dashboard a static site that any host can serve without rewrites. */
function parseRoute(hash: string): Route {
  const analysis = /^#\/analyses\/([^/]+)$/.exec(hash);
  if (analysis?.[1] !== undefined) {
    return { view: 'ANALYSIS', analysisId: decodeURIComponent(analysis[1]) };
  }
  const example = /^#\/new\/([^/]+)$/.exec(hash);
  if (example?.[1] !== undefined) {
    return { view: 'NEW', exampleId: decodeURIComponent(example[1]) };
  }
  if (hash === '#/analyses') {
    return { view: 'HISTORY' };
  }
  return hash === '#/rules' ? { view: 'RULES' } : { view: 'NEW' };
}

function NavSection({ icon: SectionIcon, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="nav-section">
      <button type="button" className="nav-section-toggle" onClick={() => { setOpen(!open); }} aria-expanded={open}>
        <SectionIcon weight="bold" aria-hidden="true" />
        <span>{title}</span>
        <CaretDownIcon weight="bold" className={`chevron ${open ? '' : 'closed'}`} aria-hidden="true" />
      </button>
      {open && <div className="nav-section-items">{children}</div>}
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [lastCreated, setLastCreated] = useState<AnalysisRecord | undefined>();
  const [navPreference, setNavPreference] = useState<NavPreference | undefined>(() => {
    const stored = readPreference('nav');
    return stored === 'EXPANDED' || stored === 'COLLAPSED' ? stored : undefined;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      setDrawerOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);

  // Without an explicit choice, the navigation gives its width to the graph on analysis pages.
  const collapsed = (navPreference ?? (route.view === 'ANALYSIS' ? 'COLLAPSED' : 'EXPANDED')) === 'COLLAPSED';

  const toggleCollapsed = () => {
    const next: NavPreference = collapsed ? 'EXPANDED' : 'COLLAPSED';
    setNavPreference(next);
    writePreference('nav', next);
  };

  const onCreated = (record: AnalysisRecord) => {
    setLastCreated(record);
    window.location.hash = `#/analyses/${record.analysisId}`;
  };

  const activeExample = route.view === 'NEW' ? route.exampleId : undefined;
  const isActive = (view: Route['view']) => route.view === view && activeExample === undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-start">
          <button
            type="button"
            className="icon-button nav-toggle-desktop"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <SidebarSimpleIcon weight="bold" />
          </button>
          <button
            type="button"
            className="icon-button nav-toggle-mobile"
            onClick={() => { setDrawerOpen(!drawerOpen); }}
            aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <XIcon weight="bold" /> : <ListIcon weight="bold" />}
          </button>
          <a className="brand" href="#/">
            <span className="brand-mark" aria-hidden="true">
              <TreeStructureIcon weight="bold" />
            </span>
            <span className="brand-name">adi</span>
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-product">Deployment Intelligence</span>
          </a>
        </div>
        <div className="topbar-actions">
          <a className="icon-button" href="#/analyses" title="Analyses" aria-label="Analyses">
            <ClockCounterClockwiseIcon weight="bold" />
          </a>
          <a className="icon-button" href="#/rules" title="Rules" aria-label="Rules">
            <BookOpenIcon weight="bold" />
          </a>
          <a className="button button-solid" href="#/">
            <PlusIcon weight="bold" aria-hidden="true" />
            <span className="hide-narrow">New analysis</span>
          </a>
        </div>
      </header>

      <div className={`frame ${collapsed ? 'nav-collapsed' : ''}`}>
        {drawerOpen && <button type="button" className="scrim" aria-label="Close navigation" onClick={() => { setDrawerOpen(false); }} />}

        <nav className={`sidenav ${drawerOpen ? 'drawer-open' : ''}`} aria-label="Main">
          <div className="sidenav-full">
            <p className="sidenav-title">Change Analysis</p>
            <a href="#/" className={`nav-link nav-primary ${isActive('NEW') ? 'active' : ''}`}>
              <HouseSimpleIcon weight="bold" aria-hidden="true" />
              Analyze a change
            </a>

            <NavSection icon={ClockCounterClockwiseIcon} title="Workspace">
              <a href="#/analyses" className={`nav-link ${route.view === 'HISTORY' ? 'active' : ''}`}>
                Analyses
              </a>
              <a href="#/rules" className={`nav-link ${route.view === 'RULES' ? 'active' : ''}`}>
                Rules
                <span className="nav-count">{RULES.length}</span>
              </a>
            </NavSection>

            <NavSection icon={FlaskIcon} title="Examples">
              {EXAMPLES.map((example) => {
                const SeverityIcon = example.severity === undefined ? undefined : SEVERITY_ICONS[example.severity];
                return (
                  <a
                    key={example.id}
                    href={`#/new/${example.id}`}
                    className={`nav-link ${activeExample === example.id ? 'active' : ''}`}
                  >
                    <span className="nav-link-text">{example.label}</span>
                    {SeverityIcon !== undefined && example.severity !== undefined && (
                      <SeverityIcon weight="fill" className={`tone-${example.severity.toLowerCase()}`} aria-hidden="true" />
                    )}
                  </a>
                );
              })}
            </NavSection>

            <NavSection icon={ListChecksIcon} title="Principles">
              <p className="nav-note">Rules decide every finding. Claude on Amazon Bedrock explains them.</p>
              <p className="nav-note">Every fact names its source: the diff, the graph, the template or AWS documentation.</p>
            </NavSection>
          </div>

          <div className="sidenav-rail">
            <a href="#/" className={`rail-link ${isActive('NEW') ? 'active' : ''}`} title="Analyze a change" aria-label="Analyze a change">
              <HouseSimpleIcon weight="bold" />
            </a>
            <a href="#/analyses" className={`rail-link ${route.view === 'HISTORY' ? 'active' : ''}`} title="Analyses" aria-label="Analyses">
              <ClockCounterClockwiseIcon weight="bold" />
            </a>
            <a href="#/rules" className={`rail-link ${route.view === 'RULES' ? 'active' : ''}`} title="Rules" aria-label="Rules">
              <BookOpenIcon weight="bold" />
            </a>
            <span className="rail-divider" aria-hidden="true" />
            {EXAMPLES.map((example, index) => (
              <a
                key={example.id}
                href={`#/new/${example.id}`}
                className={`rail-link rail-example ${example.severity === undefined ? '' : `tone-${example.severity.toLowerCase()}`} ${activeExample === example.id ? 'active' : ''}`}
                title={`Example: ${example.label}`}
                aria-label={`Example: ${example.label}`}
              >
                {String(index + 1).padStart(2, '0')}
              </a>
            ))}
          </div>
        </nav>

        <main className="main">
          {route.view === 'NEW' && (
            <NewAnalysisView key={route.exampleId ?? 'blank'} exampleId={route.exampleId} onCreated={onCreated} />
          )}
          {route.view === 'HISTORY' && <HistoryView />}
          {route.view === 'RULES' && <RulesView />}
          {route.view === 'ANALYSIS' && (
            <AnalysisView key={route.analysisId} analysisId={route.analysisId} initial={lastCreated} />
          )}
        </main>
      </div>
    </div>
  );
}
