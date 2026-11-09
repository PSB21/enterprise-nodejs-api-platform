'use client';

import Link from 'next/link';
import { useState } from 'react';

import { NewKeyPanel } from '@/components/new-key-panel';
import { Alert, Button, Card, EmptyState, Input, PageHeader, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useAccessRequests, useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/lib/queries';

export default function KeysPage() {
  const approved = useAccessRequests({ status: 'approved' });
  const keys = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [names, setNames] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  function create(accessRequestId: string) {
    createKey.mutate(
      { accessRequestId, name: names[accessRequestId]?.trim() || 'Default key' },
      { onSuccess: (result) => setNewKey(result.key) }
    );
  }

  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys let your code call the gateway. Each one belongs to one approved API."
      />

      {newKey && (
        <div className="mb-6">
          <NewKeyPanel apiKey={newKey} onDone={() => setNewKey(null)} />
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-3 font-semibold">Create a key</h2>
        {approved.isLoading && <Spinner />}
        {approved.data?.data.length === 0 && (
          <EmptyState title="No approved access yet">
            <Link href="/apis" className="text-indigo-600 hover:underline">
              Request access to an API
            </Link>{' '}
            first. Keys can be created once a publisher approves it.
          </EmptyState>
        )}
        {createKey.error && <Alert>{errorMessage(createKey.error)}</Alert>}
        <div className="grid gap-4 md:grid-cols-2">
          {approved.data?.data.map((request) => (
            <Card key={request.id}>
              <p className="font-medium">{request.api.name}</p>
              <p className="text-sm text-slate-500">{request.planName} plan</p>
              <div className="mt-3 flex gap-2">
                <Input
                  aria-label={`Key name for ${request.api.name}`}
                  placeholder="Key name, e.g. Production"
                  maxLength={50}
                  value={names[request.id] ?? ''}
                  onChange={(e) => setNames({ ...names, [request.id]: e.target.value })}
                />
                <Button onClick={() => create(request.id)} disabled={createKey.isPending}>
                  Create
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Your active keys</h2>
        {keys.isLoading && <Spinner />}
        {keys.error && <Alert>{errorMessage(keys.error)}</Alert>}
        {revokeKey.error && <Alert>{errorMessage(revokeKey.error)}</Alert>}
        {keys.data?.data.length === 0 && <EmptyState title="No active keys" />}
        {keys.data && keys.data.data.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">API</th>
                  <th className="px-4 py-3">Last used</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.data.data.map((key) => (
                  <tr key={key.id}>
                    <td className="px-4 py-3 font-medium">{key.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{key.prefix}…</td>
                    <td className="px-4 py-3">
                      {key.api.name} <span className="text-slate-500">({key.planName})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(key.lastUsedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {confirmRevoke === key.id ? (
                        <span className="inline-flex gap-2">
                          <Button
                            variant="danger"
                            disabled={revokeKey.isPending}
                            onClick={() =>
                              revokeKey.mutate(key.id, { onSuccess: () => setConfirmRevoke(null) })
                            }
                          >
                            Revoke now
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirmRevoke(null)}>
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button variant="secondary" onClick={() => setConfirmRevoke(key.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
