'use client';

export interface ActiveFilter {
  label: string;
  onRemove: () => void;
}

/** Shows each filter currently applied, so the user can see why the list looks the way it does. */
export function ActiveFilters({
  filters,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onClearAll: () => void;
}) {
  if (filters.length === 0) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 text-sm" aria-label="Active filters">
      <span className="text-slate-500">Filtered by:</span>
      {filters.map((filter) => (
        <span
          key={filter.label}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-1 pl-3 pr-1 font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200"
        >
          {filter.label}
          <button
            type="button"
            onClick={filter.onRemove}
            aria-label={`Remove filter ${filter.label}`}
            className="rounded-full px-1.5 leading-5 hover:bg-indigo-100"
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        Clear filters
      </button>
    </div>
  );
}
