'use client';

import { useState } from 'react';

import { RequestCard } from '@/components/request-card';
import { Alert, EmptyState, PageHeader, Pagination, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useAccessRequests } from '@/lib/queries';
import type { RequestStatus } from '@/lib/types';
import { useAppSelector } from '@/store';

const TABS: { label: string; status?: RequestStatus }[] = [
  { label: 'Pending', status: 'pending' },
  { label: 'Approved', status: 'approved' },
  { label: 'Rejected', status: 'rejected' },
  { label: 'Revoked', status: 'revoked' },
  { label: 'All' },
];

export default function RequestsPage() {
  const role = useAppSelector((s) => s.auth.user?.role);
  const reviewer = role === 'PUBLISHER' || role === 'ADMIN';
  // Reviewers start on their queue of pending requests; developers see everything they sent.
  const [tab, setTab] = useState(reviewer ? 0 : TABS.length - 1);
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAccessRequests({ status: TABS[tab]?.status, page });

  return (
    <>
      <PageHeader
        title={reviewer ? 'Review queue' : 'My access requests'}
        description={
          reviewer
            ? 'Requests for your APIs. Approving lets the developer create API keys.'
            : 'Requests you have sent, and what happened to them.'
        }
      />

      <div role="tablist" className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t, index) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={tab === index}
            onClick={() => {
              setTab(index);
              setPage(1);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === index ? 'border-indigo-600 font-medium text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <Alert>{errorMessage(error)}</Alert>}
      {isLoading && <Spinner label="Loading requests" />}
      {data && data.data.length === 0 && (
        <EmptyState title="Nothing here">
          {reviewer
            ? 'No requests with this status.'
            : 'Find an API in the catalog and request access.'}
        </EmptyState>
      )}

      <div className="space-y-4">
        {data?.data.map((request) => (
          <RequestCard key={request.id} request={request} reviewer={reviewer} />
        ))}
      </div>

      {data && (
        <Pagination page={data.meta.page} totalPages={data.meta.totalPages} onChange={setPage} />
      )}
    </>
  );
}
