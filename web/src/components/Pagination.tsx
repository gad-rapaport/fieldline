interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  label: string;
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, label }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <p className="pagination__summary" aria-live="polite">
        {total === 0 ? 'No results' : `${first}–${last} of ${total}`}
      </p>
      <div className="pagination__controls">
        <label className="inline-field">
          <span>Rows</span>
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn--quiet"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <span className="pagination__page">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          className="btn btn--quiet"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
