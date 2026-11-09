'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { ActiveFilters, type ActiveFilter } from '@/components/active-filters';
import { StatusBadge } from '@/components/status-badge';
import { Alert, Button, EmptyState, Input, PageHeader, Pagination, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useApis } from '@/lib/queries';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  filtersCleared,
  mineToggled,
  pageChanged,
  searchChanged,
  tagChanged,
} from '@/store/catalog-slice';

export default function ApisPage() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.catalog);
  const role = useAppSelector((s) => s.auth.user?.role);
  const { data, isLoading, isFetching, error } = useApis(filters);

  // The search box is only applied on submit, so typing does not fire a request per key.
  // It starts from the saved filter, so returning to the catalog shows the last search.
  const [search, setSearch] = useState(filters.q);

  function clearFilters() {
    setSearch('');
    dispatch(filtersCleared());
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    dispatch(searchChanged(search.trim()));
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
  if (filters.tag) {
    active.push({ label: `Tag: #${filters.tag}`, onRemove: () => dispatch(tagChanged('')) });
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

      <form onSubmit={handleSearch} className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <Input
            type="search"
            aria-label="Search APIs"
            placeholder="Search by name, tag or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit">Search</Button>
        {role !== 'DEVELOPER' && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={filters.mine}
              onChange={() => dispatch(mineToggled())}
              className="rounded border-slate-300"
            />
            Only my APIs
          </label>
        )}
      </form>

      <ActiveFilters filters={active} onClearAll={clearFilters} />

      {error && <Alert>{errorMessage(error)}</Alert>}
      {isLoading && <Spinner label="Loading APIs" />}

      {data && data.data.length === 0 && (
        <EmptyState title="No APIs found">
          {filtered ? 'Try a different search or clear the filters.' : 'Nothing is published yet.'}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
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
                      const selected = filters.tag === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          aria-pressed={selected}
                          title={selected ? 'Remove this tag filter' : `Show only #${tag} APIs`}
                          // Clicking the selected tag again removes the filter.
                          onClick={() => dispatch(tagChanged(selected ? '' : tag))}
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
