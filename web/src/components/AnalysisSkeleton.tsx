/** Placeholder with the analysis page's shape, shown while its code or data loads. */
export function AnalysisSkeleton() {
  return (
    <div className="page-with-rail analysis-page" aria-busy="true" aria-label="Loading analysis">
      <div className="page-column">
        <span className="skeleton skeleton-line short" />
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-block" style={{ height: 76 }} />
        <span className="skeleton skeleton-block" style={{ height: 520 }} />
      </div>
      <aside className="rail findings-rail">
        <span className="skeleton skeleton-line short" />
        <span className="skeleton skeleton-block" style={{ height: 120 }} />
        <span className="skeleton skeleton-block" style={{ height: 220 }} />
      </aside>
    </div>
  );
}
