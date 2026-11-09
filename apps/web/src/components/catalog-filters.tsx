'use client';

import type { ApiStatus } from '@/lib/types';

const STATUSES: { value: ApiStatus | ''; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'deprecated', label: 'Deprecated' },
];

/**
 * The catalog's filter bar. Tags can be combined (an API matching any selected tag is shown),
 * and every filter combines with the search. Publishers and admins also get status and
 * "only my APIs" filters, since they can see drafts.
 */
export function CatalogFilters({
  tags,
  selectedTags,
  onToggleTag,
  showOwnerFilters,
  status,
  onStatusChange,
  mine,
  onToggleMine,
}: {
  tags: { tag: string; count: number }[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  showOwnerFilters: boolean;
  status: ApiStatus | '';
  onStatusChange: (status: ApiStatus | '') => void;
  mine: boolean;
  onToggleMine: () => void;
}) {
  return (
    <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by tag">
          <span className="mr-1 text-sm font-medium text-slate-700">Tags</span>
          {tags.map(({ tag, count }) => {
            const selected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleTag(tag)}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${selected ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
              >
                #{tag}{' '}
                <span className={selected ? 'text-indigo-100' : 'text-slate-400'}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {showOwnerFilters && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Status</span>
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value as ApiStatus | '')}
              className="rounded-md border border-slate-300 bg-white px-2 py-1"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={mine}
              onChange={onToggleMine}
              className="rounded border-slate-300"
            />
            Only my APIs
          </label>
        </div>
      )}
    </div>
  );
}
