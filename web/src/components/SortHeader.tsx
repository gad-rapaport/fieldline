interface Props {
  label: string;
  field: string;
  sort: string;
  onSort: (sort: string) => void;
  className?: string;
  /** First click sorts descending (e.g. newest, most urgent first). */
  descFirst?: boolean;
}

/** Sortable column header: a real button inside the th, with aria-sort on the th. */
export function SortHeader({ label, field, sort, onSort, className, descFirst = false }: Props) {
  const active = sort === field || sort === `-${field}`;
  const desc = sort === `-${field}`;
  const next = active ? (desc ? field : `-${field}`) : descFirst ? `-${field}` : field;
  return (
    <th scope="col" className={className} aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sort-btn" onClick={() => onSort(next)}>
        {label}
        <svg
          viewBox="0 0 10 14"
          aria-hidden="true"
          className={`sort-icon ${active ? (desc ? 'is-desc' : 'is-asc') : ''}`}
        >
          <path d="M5 1L9 5H1z" className="up" />
          <path d="M5 13L1 9h8z" className="down" />
        </svg>
      </button>
    </th>
  );
}
