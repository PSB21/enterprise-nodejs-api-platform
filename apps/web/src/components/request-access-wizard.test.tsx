import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RequestAccessWizard } from './request-access-wizard';

const plans = [
  { name: 'Free', rateLimitPerMinute: 30, monthlyQuota: 10_000 },
  { name: 'Pro', rateLimitPerMinute: 300, monthlyQuota: null },
];

function setup(props: Partial<Parameters<typeof RequestAccessWizard>[0]> = {}) {
  const onSubmit = jest.fn();
  render(<RequestAccessWizard plans={plans} onSubmit={onSubmit} {...props} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('RequestAccessWizard', () => {
  it('cannot continue until a plan is chosen', async () => {
    const { user } = setup();

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.click(screen.getByText('Pro'));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('requires a use case of at least 10 characters', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Free'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(screen.getByLabelText(/How will you use/), 'too short');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Please write at least 10 characters.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('shows a review step and submits the chosen plan and trimmed use case', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByText('Pro'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText(/How will you use/), '  Show orders in our app.  ');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Pro · 300 requests per minute')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(onSubmit).toHaveBeenCalledWith({ planName: 'Pro', useCase: 'Show orders in our app.' });
  });

  it('keeps answers when going back', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Pro'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('radio', { name: /Pro/ })).toBeChecked();
  });

  it('shows an error from the server', () => {
    setup({ error: 'You already have a pending or approved request for this API' });

    expect(screen.getByRole('alert')).toHaveTextContent('already have a pending');
  });
});
