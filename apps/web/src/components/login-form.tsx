'use client';

import { useState, type FormEvent } from 'react';

import { Alert, Button, Field, Input } from './ui';

export interface LoginValues {
  email: string;
  password: string;
}

/**
 * The login form. It only validates and reports; the page decides what submitting does, which
 * keeps this component easy to test.
 */
export function LoginForm({
  onSubmit,
  error,
  submitting,
}: {
  onSubmit: (values: LoginValues) => void;
  error?: string;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<LoginValues>({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<LoginValues>>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const errors: Partial<LoginValues> = {};
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = 'Enter a valid email address';
    if (!values.password) errors.password = 'Enter your password';
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) {
      onSubmit({ email: values.email.trim(), password: values.password });
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Field label="Email" error={fieldErrors.email}>
        <Input
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
        />
      </Field>
      <Field label="Password" error={fieldErrors.password}>
        <Input
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log in'}
      </Button>
    </form>
  );
}
