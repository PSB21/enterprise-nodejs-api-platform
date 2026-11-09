import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewKeyPanel } from './new-key-panel';

const KEY = 'ams_dGhpcyBpcyBub3QgYSByZWFsIGtleSBidXQgaXQgbG9va3M';

describe('NewKeyPanel', () => {
  it('shows the key with a warning that it will not be shown again', () => {
    render(<NewKeyPanel apiKey={KEY} onDone={jest.fn()} />);

    expect(screen.getByTestId('new-api-key')).toHaveTextContent(KEY);
    expect(screen.getByText(/will not be able to see it again/)).toBeInTheDocument();
  });

  it('copies the key to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<NewKeyPanel apiKey={KEY} onDone={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith(KEY);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('calls onDone when the user confirms they saved it', async () => {
    const onDone = jest.fn();
    render(<NewKeyPanel apiKey={KEY} onDone={onDone} />);

    await userEvent.click(screen.getByRole('button', { name: 'I have saved it' }));

    expect(onDone).toHaveBeenCalled();
  });
});
