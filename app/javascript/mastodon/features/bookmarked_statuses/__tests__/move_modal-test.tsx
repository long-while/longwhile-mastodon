import { IntlProvider } from 'react-intl';

import { fireEvent, render, screen } from '@testing-library/react';

import { BookmarkMoveModal } from '../move_modal';

const folders = [
  { id: '2', name: 'Recipes', position: 1, statuses_count: 2 },
  { id: '3', name: 'Travel', position: 2, statuses_count: 0 },
];

const renderModal = (includeUnsorted: boolean, list = folders) => {
  const onMove = vi.fn();
  const onClose = vi.fn();

  render(
    <IntlProvider locale='en'>
      <BookmarkMoveModal
        folders={list}
        includeUnsorted={includeUnsorted}
        onMove={onMove}
        onClose={onClose}
      />
    </IntlProvider>,
  );

  return { onMove, onClose };
};

const moveButton = () =>
  screen.getByRole('button', { name: 'Move' }) as HTMLButtonElement;

describe('<BookmarkMoveModal />', () => {
  it('keeps "move" disabled until a folder is picked, then moves there', () => {
    const { onMove, onClose } = renderModal(false);

    expect(moveButton().disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Travel'));
    expect(moveButton().disabled).toBe(false);

    fireEvent.click(moveButton());
    expect(onClose).toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledWith('3');
  });

  it('lists "unsorted" first only when asked', () => {
    renderModal(true);

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(screen.getByLabelText('Unsorted')).toBe(options[0]);
  });

  it('leaves out "unsorted" otherwise', () => {
    renderModal(false);

    expect(screen.queryByLabelText('Unsorted')).toBeNull();
  });

  it('asks to create a folder when there is nowhere to move', () => {
    renderModal(false, []);

    expect(screen.getByText('Create a folder first.')).toBeTruthy();
    expect(moveButton().disabled).toBe(true);
  });
});
