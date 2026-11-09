'use client';

import Link from 'next/link';
import { useState } from 'react';

import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useReviewRequest, type ReviewAction } from '@/lib/queries';
import type { AccessRequest } from '@/lib/types';
import { StatusBadge } from './status-badge';
import { Alert, Button, Card, Input } from './ui';

/** One access request, with its history and, for reviewers, the actions allowed next. */
export function RequestCard({ request, reviewer }: { request: AccessRequest; reviewer: boolean }) {
  const review = useReviewRequest();
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [note, setNote] = useState('');

  const actions: ReviewAction[] =
    request.status === 'pending'
      ? ['approve', 'reject']
      : request.status === 'approved'
        ? ['revoke']
        : [];
  // Saying no needs a reason, so the developer knows what to change.
  const noteRequired = action === 'reject' || action === 'revoke';

  function confirm() {
    if (!action) return;
    review.mutate(
      { id: request.id, action, note: note.trim() },
      {
        onSuccess: () => {
          setAction(null);
          setNote('');
        },
      }
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            <Link href={`/apis/${request.api.slug}`} className="hover:text-indigo-600">
              {request.api.name ?? 'API'}
            </Link>
            <span className="ml-2 text-sm font-normal text-slate-500">{request.planName} plan</span>
          </h3>
          {reviewer && request.developer && (
            <p className="text-sm text-slate-600">
              {request.developer.name} · {request.developer.email}
            </p>
          )}
        </div>
        <StatusBadge status={request.status} />
      </div>

      <p className="mt-3 text-sm text-slate-700">“{request.useCase}”</p>

      <ol className="mt-4 space-y-1 border-l-2 border-slate-200 pl-4 text-xs text-slate-500">
        {request.history.map((entry, index) => (
          <li key={index}>
            <span className="font-medium capitalize text-slate-700">{entry.status}</span> ·{' '}
            {formatDateTime(entry.at)}
            {entry.note && <span className="text-slate-600"> · “{entry.note}”</span>}
          </li>
        ))}
      </ol>

      {!reviewer && request.status === 'approved' && (
        <p className="mt-4 text-sm">
          <Link href="/keys" className="font-medium text-indigo-600 hover:underline">
            Create an API key →
          </Link>
        </p>
      )}

      {reviewer && actions.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {action ? (
            <div className="space-y-3">
              <Input
                aria-label="Note"
                placeholder={
                  noteRequired ? 'Reason (required)' : 'Note for the developer (optional)'
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
              {review.error && <Alert>{errorMessage(review.error)}</Alert>}
              <div className="flex gap-2">
                <Button
                  variant={action === 'approve' ? 'primary' : 'danger'}
                  onClick={confirm}
                  disabled={review.isPending || (noteRequired && note.trim().length < 3)}
                >
                  Confirm {action}
                </Button>
                <Button variant="ghost" onClick={() => setAction(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {actions.map((a) => (
                <Button
                  key={a}
                  variant={a === 'approve' ? 'primary' : 'secondary'}
                  onClick={() => setAction(a)}
                  className="capitalize"
                >
                  {a}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
