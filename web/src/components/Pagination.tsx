import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';

interface PaginationProps {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
}

/**
 * Page numbers to show: always the first and last, the current page and its neighbours,
 * and a gap marker wherever pages are skipped.
 */
function pageItems(page: number, pageCount: number): (number | 'GAP')[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...wanted].sort((a, b) => a - b);
  const items: (number | 'GAP')[] = [];
  sorted.forEach((p, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && p - previous > 1) {
      items.push('GAP');
    }
    items.push(p);
  });
  return items;
}

export function Pagination({ page, pageSize, total, onPage }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav className="pagination" aria-label="Pages">
      <span className="pagination-range">
        {String(first)}–{String(last)} of {String(total)}
      </span>
      {pageCount > 1 && (
        <div className="pagination-pages">
          <button type="button" className="icon-button" onClick={() => { onPage(page - 1); }} disabled={page === 1} aria-label="Previous page">
            <CaretLeftIcon weight="bold" />
          </button>
          {pageItems(page, pageCount).map((item, index) =>
            item === 'GAP' ? (
              <span key={`gap-${String(index)}`} className="pagination-gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`pagination-page ${item === page ? 'active' : ''}`}
                onClick={() => { onPage(item); }}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Page ${String(item)}`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className="icon-button"
            onClick={() => { onPage(page + 1); }}
            disabled={page === pageCount}
            aria-label="Next page"
          >
            <CaretRightIcon weight="bold" />
          </button>
        </div>
      )}
    </nav>
  );
}
