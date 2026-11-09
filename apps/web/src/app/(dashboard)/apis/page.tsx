'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { ActiveFilters, type ActiveFilter } from '@/components/active-filters';
import { CatalogFilters } from '@/components/catalog-filters';
import { StatusBadge } from '@/components/status-badge';
import { Alert, Button, EmptyState, Input, PageHeader, Pagination, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useApis, useApiTags } from '@/lib/queries';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  filtersCleared,
  mineToggled,
  pageChanged,
  searchChanged,
  statusChanged,
  tagToggled,
} from '@/store/catalog-slice';

// How long typing must pause before the search runs, so it does not fire on every key.
const SEARCH_DELAY_MS = 350;

export default function ApisPage() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.catalog);
  const role = useAppSelector((s) => s.auth.user?.role);
  const { data, isLoading, isFetching, error } = useApis(filters);
  const { data: tags = [] } = useApiTags();

  // Starts from the saved search, so returning to the catalog shows the last one.
  const [search, setSearch] = useState(filters.q);

  // Search as you type: apply the text once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() !== filters.q) dispatch(searchChanged(search.trim()));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, filters.q, dispatch]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    dispatch(searchChanged(search.trim()));
  }

  function clearFilters() {
    setSearch('');
    dispatch(filtersCleared());
  }

  const active: ActiveFilter[] = [];
  if (filters.q) {
    active.push({
      label: `Search: "${filters.q}"`,
      onRemove: () => {
        setSearch('');
        dispatch(searchChanged(''));
      },
    });
  }
  for (const tag of filters.tags) {
    active.push({ label: `Tag: #${tag}`, onRemove: () => dispatch(tagToggled(tag)) });
  }
  if (filters.status) {
    active.push({
      label: `Status: ${filters.status}`,
      onRemove: () => dispatch(statusChanged('')),
    });
  }
  if (filters.mine) {
    active.push({ label: 'Only my APIs', onRemove: () => dispatch(mineToggled()) });
  }
  const filtered = active.length > 0;

  return (
    <>
      <PageHeader
        title="API catalog"
        description={
          role === 'DEVELOPER'
            ? 'Find an API, choose a plan and request access.'
            : 'Published APIs, plus your own drafts.'
        }
      />

      <form onSubmit={handleSearch} className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <Input
            type="search"
            aria-label="Search APIs"
            placeholder="Search by name, tag or description, e.g. logi"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      <CatalogFilters
        tags={tags}
        selectedTags={filters.tags}
        onToggleTag={(tag) => dispatch(tagToggled(tag))}
        showOwnerFilters={role !== 'DEVELOPER'}
        status={filters.status}
        onStatusChange={(status) => dispatch(statusChanged(status))}
        mine={filters.mine}
        onToggleMine={() => dispatch(mineToggled())}
      />

      <ActiveFilters filters={active} onClearAll={clearFilters} />

      {error && <Alert>{errorMessage(error)}</Alert>}
      {isLoading && <Spinner label="Loading APIs" />}

      {data && data.data.length === 0 && (
        <EmptyState title="No APIs found">
          {filtered ? (
            <>
              Try a different search, or{' '}
              <button type="button" onClick={clearFilters} className="text-indigo-600 underline">
                clear the filters
              </button>
              .
            </>
          ) : (
            'Nothing is published yet.'
          )}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {data.meta.total} API{data.meta.total === 1 ? '' : 's'}
          </p>
          <ul
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isFetching ? 'opacity-60' : ''}`}
          >
            {data.data.map((item) => (
              <li key={item.id}>
                <article className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">
                      <Link href={`/apis/${item.slug}`} className="hover:text-indigo-600">
                        {item.name}
                      </Link>
                    </h2>
                    {item.status !== 'published' && <StatusBadge status={item.status} />}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.version} · {item.plans.length} plan{item.plans.length === 1 ? '' : 's'}
                  </p>
                  <p className="mt-3 line-clamp-3 flex-1 text-sm text-slate-600">
                    {item.description}
                  </p>
                  {item.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => {
                        const selected = filters.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            aria-pressed={selected}
                            title={selected ? 'Remove this tag filter' : `Also show #${tag} APIs`}
                            onClick={() => dispatch(tagToggled(tag))}
                            className={`rounded-full px-2 py-0.5 text-xs ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`}
                          >
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </>
      )}

      {data && (
        <Pagination
          page={data.meta.page}
          totalPages={data.meta.totalPages}
          onChange={(next) => dispatch(pageChanged(next))}
        />
      )}
    </>
  );
}
