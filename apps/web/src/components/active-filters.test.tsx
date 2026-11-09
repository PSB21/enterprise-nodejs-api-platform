import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ActiveFilters } from './active-filters';

describe('ActiveFilters', () => {
  it('shows nothing when no filter is applied', () => {
    const { container } = render(<ActiveFilters filters={[]} onClearAll={jest.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows each applied filter and removes one when its × is clicked', async () => {
    const removeTag = jest.fn();
    render(
      <ActiveFilters
        filters={[
          { label: 'Search: "maps"', onRemove: jest.fn() },
          { label: 'Tag: #geo', onRemove: removeTag },
        ]}
        onClearAll={jest.fn()}
      />
    );

    expect(screen.getByText('Search: "maps"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Tag: #geo' }));

    expect(removeTag).toHaveBeenCalled();
  });

  it('offers "Clear all" when more than one filter is applied', async () => {
    const onClearAll = jest.fn();
    render(
      <ActiveFilters
        filters={[
          { label: 'Tag: #geo', onRemove: jest.fn() },
          { label: 'Only my APIs', onRemove: jest.fn() },
        ]}
        onClearAll={onClearAll}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(onClearAll).toHaveBeenCalled();
  });
});
