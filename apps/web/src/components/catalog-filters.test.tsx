import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CatalogFilters } from './catalog-filters';

const tags = [
  { tag: 'geo', count: 3 },
  { tag: 'logistics', count: 1 },
];

function setup(props: Partial<Parameters<typeof CatalogFilters>[0]> = {}) {
  const handlers = { onToggleTag: jest.fn(), onStatusChange: jest.fn(), onToggleMine: jest.fn() };
  render(
    <CatalogFilters
      tags={tags}
      selectedTags={[]}
      showOwnerFilters={false}
      status=""
      mine={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe('CatalogFilters', () => {
  it('marks every selected tag, so several can be active at once', () => {
    setup({ selectedTags: ['geo', 'logistics'] });

    expect(screen.getByRole('button', { name: /#geo/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /#logistics/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('toggles a tag when clicked', async () => {
    const { onToggleTag } = setup();

    await userEvent.click(screen.getByRole('button', { name: /#logistics/ }));

    expect(onToggleTag).toHaveBeenCalledWith('logistics');
  });

  it('hides status and ownership filters from developers', () => {
    setup({ showOwnerFilters: false });

    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Only my APIs')).not.toBeInTheDocument();
  });

  it('lets publishers filter by status and ownership', async () => {
    const { onStatusChange, onToggleMine } = setup({ showOwnerFilters: true });

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'draft');
    await userEvent.click(screen.getByLabelText('Only my APIs'));

    expect(onStatusChange).toHaveBeenCalledWith('draft');
    expect(onToggleMine).toHaveBeenCalled();
  });
});
