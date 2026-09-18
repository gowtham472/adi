import { useEffect, useState } from 'react';
import type { AnalysisRecord } from '@adi/engine/types';
import { AnalysisView } from './views/AnalysisView.tsx';
import { HistoryView } from './views/HistoryView.tsx';
import { NewAnalysisView } from './views/NewAnalysisView.tsx';

type Route = { readonly view: 'NEW' } | { readonly view: 'HISTORY' } | { readonly view: 'ANALYSIS'; readonly analysisId: string };

/** Hash routes keep the dashboard a static site that any host can serve without rewrites. */
function parseRoute(hash: string): Route {
  const analysis = /^#\/analyses\/([^/]+)$/.exec(hash);
  if (analysis?.[1] !== undefined) {
    return { view: 'ANALYSIS', analysisId: decodeURIComponent(analysis[1]) };
  }
  return hash === '#/analyses' ? { view: 'HISTORY' } : { view: 'NEW' };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [lastCreated, setLastCreated] = useState<AnalysisRecord | undefined>();

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);

  const onCreated = (record: AnalysisRecord) => {
    setLastCreated(record);
    window.location.hash = `#/analyses/${record.analysisId}`;
  };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>ADI</strong> <span className="brand-sub">AWS Deployment Intelligence</span>
          </span>
        </a>
        <nav>
          <a href="#/" className={route.view === 'NEW' ? 'active' : ''}>
            New analysis
          </a>
          <a href="#/analyses" className={route.view === 'HISTORY' ? 'active' : ''}>
            History
          </a>
        </nav>
      </header>
      <main>
        {route.view === 'NEW' && <NewAnalysisView onCreated={onCreated} />}
        {route.view === 'HISTORY' && <HistoryView />}
        {route.view === 'ANALYSIS' && <AnalysisView key={route.analysisId} analysisId={route.analysisId} initial={lastCreated} />}
      </main>
    </div>
  );
}
