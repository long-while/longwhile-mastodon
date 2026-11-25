import { IntlProvider } from 'react-intl';

import { Provider } from 'react-redux';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { fetchBookmarkDetails } from 'mastodon/actions/bookmark_list';
import { apiSetBookmarkNote } from 'mastodon/api/bookmark_folders';
import { store } from 'mastodon/store';

import { BookmarkNoteModal } from '../note_modal';

vi.mock('mastodon/api/bookmark_folders');

const renderModal = (statusId = '10') => {
  const onClose = vi.fn();

  render(
    <Provider store={store}>
      <IntlProvider locale='en'>
        <BookmarkNoteModal statusId={statusId} onClose={onClose} />
      </IntlProvider>
    </Provider>,
  );

  return onClose;
};

const seedNote = (statusId: string, note: string) => {
  store.dispatch(
    fetchBookmarkDetails.fulfilled(
      {
        requested: [statusId],
        details: [{ status_id: statusId, note, folder_ids: [] }],
      },
      'seed',
      { statusIds: [statusId] },
    ),
  );
};

describe('<BookmarkNoteModal />', () => {
  beforeEach(() => {
    vi.mocked(apiSetBookmarkNote)
      .mockReset()
      .mockImplementation((statusId, note) =>
        Promise.resolve({ status_id: statusId, note, folder_ids: [] }),
      );
  });

  it('saves the trimmed note and closes', async () => {
    const onClose = renderModal('11');

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  주말에 만들기  ' },
    });
    expect(screen.getByText('11/500')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(apiSetBookmarkNote).toHaveBeenCalledWith('11', '주말에 만들기');
    expect(store.getState().bookmarkDetails['11']?.note).toBe('주말에 만들기');
  });

  it('saves with Ctrl+Enter but keeps plain Enter for new lines', async () => {
    const onClose = renderModal('13');
    const field = screen.getByRole('textbox');

    fireEvent.change(field, { target: { value: '줄바꿈' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(apiSetBookmarkNote).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(apiSetBookmarkNote).toHaveBeenCalledWith('13', '줄바꿈');
  });

  it('edits an existing note and can delete it', async () => {
    seedNote('12', '옛 메모');
    const onClose = renderModal('12');

    expect(screen.getByText('Edit note')).toBeTruthy();
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe(
      '옛 메모',
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(apiSetBookmarkNote).toHaveBeenCalledWith('12', '');
  });

  it('keeps the modal open with an error when saving fails', async () => {
    vi.mocked(apiSetBookmarkNote).mockRejectedValue(new Error('boom'));
    const onClose = renderModal('13');

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'memo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
