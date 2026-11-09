'use client';

import { useState } from 'react';

import type { Plan } from '@/lib/types';
import { Alert, Button, Field, Textarea } from './ui';

export interface AccessRequestValues {
  planName: string;
  useCase: string;
}

const STEPS = ['Choose a plan', 'Describe your use', 'Review'] as const;
const MIN_USE_CASE = 10;

/**
 * Requesting access in three steps: plan, use case, review. Each step validates before the
 * next. Like the login form, it only collects input; the page decides what submitting does.
 */
export function RequestAccessWizard({
  plans,
  onSubmit,
  submitting,
  error,
}: {
  plans: Plan[];
  onSubmit: (values: AccessRequestValues) => void;
  submitting?: boolean;
  error?: string;
}) {
  const [step, setStep] = useState(0);
  const [planName, setPlanName] = useState('');
  const [useCase, setUseCase] = useState('');
  const [useCaseError, setUseCaseError] = useState<string>();

  const plan = plans.find((p) => p.name === planName);

  function next() {
    if (step === 1 && useCase.trim().length < MIN_USE_CASE) {
      setUseCaseError(`Please write at least ${MIN_USE_CASE} characters.`);
      return;
    }
    setUseCaseError(undefined);
    setStep(step + 1);
  }

  return (
    <div>
      <ol className="mb-5 flex gap-2 text-xs" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={`flex-1 border-t-4 pt-2 ${index <= step ? 'border-indigo-600 font-medium text-indigo-700' : 'border-slate-200 text-slate-500'}`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-slate-700">
            Which plan do you need?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <label
                key={p.name}
                className={`cursor-pointer rounded-lg border p-4 text-sm ${planName === p.name ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.name}
                  checked={planName === p.name}
                  onChange={() => setPlanName(p.name)}
                  className="sr-only"
                />
                <span className="block font-semibold">{p.name}</span>
                <span className="mt-1 block text-slate-600">
                  {p.rateLimitPerMinute} requests per minute
                </span>
                <span className="block text-slate-600">
                  {p.monthlyQuota
                    ? `${p.monthlyQuota.toLocaleString()} per month`
                    : 'No monthly cap'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {step === 1 && (
        <Field
          label="How will you use this API?"
          hint="The publisher reads this before approving."
          error={useCaseError}
        >
          <Textarea value={useCase} onChange={(e) => setUseCase(e.target.value)} maxLength={1000} />
        </Field>
      )}

      {step === 2 && (
        <dl className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
          <div>
            <dt className="text-slate-500">Plan</dt>
            <dd className="font-medium">
              {plan?.name} · {plan?.rateLimitPerMinute} requests per minute
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Use case</dt>
            <dd className="whitespace-pre-wrap">{useCase.trim()}</dd>
          </div>
        </dl>
      )}

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-5 flex justify-between gap-3">
        <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={step === 0}>
          Back
        </Button>
        {step < 2 ? (
          <Button onClick={next} disabled={step === 0 && !planName}>
            Continue
          </Button>
        ) : (
          <Button
            onClick={() => onSubmit({ planName, useCase: useCase.trim() })}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Send request'}
          </Button>
        )}
      </div>
    </div>
  );
}
