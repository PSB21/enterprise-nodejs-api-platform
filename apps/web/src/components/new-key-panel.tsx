'use client';

import { useState } from 'react';

import { Button } from './ui';

/**
 * Shows a newly created API key. This is the only time it can be seen: the server stores a
 * hash, not the key. So the panel says so plainly and offers a copy button.
 */
export function NewKeyPanel({ apiKey, onDone }: { apiKey: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="font-medium text-amber-900">Copy your new API key now</p>
      <p className="mt-1 text-sm text-amber-800">
        You will not be able to see it again. If you lose it, revoke it and create a new one.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code
          data-testid="new-api-key"
          className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-sm ring-1 ring-amber-200"
        >
          {apiKey}
        </code>
        <Button variant="secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-3 text-xs text-amber-800">
        Send it in the <code>x-api-key</code> header of every gateway request.
      </p>
      <Button className="mt-4" onClick={onDone}>
        I have saved it
      </Button>
    </div>
  );
}
