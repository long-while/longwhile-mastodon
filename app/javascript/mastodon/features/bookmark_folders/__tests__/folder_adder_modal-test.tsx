import { IntlProvider } from 'react-intl';

import { Provider } from 'react-redux';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  apiCreateBookmarkFolder,
  apiGetBookmarkFolders,
  apiGetStatusBookmarkFolders,
  apiSetStatusBookmarkFolders,
} from 'mastodon/api/bookmark_folders';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
import { store } from 'mastodon/store';

import { BookmarkFolderAdderModal } from '../folder_adder_modal';

vi.mock('mastodon/api/bookmark_folders');
vi.mock('mastodon/actions/importer', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  importFetchedStatuses: () => ({ type: 'test/noop' }),
}));

type SetResult = Awaited<ReturnType<typeof apiSetStatusBookmarkFolders>>;

const folders: ApiBookmarkFolderJSON[] = [
  { id: '1', name: 'Read later', position: 0, statuses_count: 0 },
  { id: '2', name: 'Recipes', position: 1, statuses_count: 0 },
];

const saved = (folderIds: string[]) =>
  ({
    folder_ids: folderIds,
    status: { id: '10', bookmarked: true },
  }) as unknown as SetResult;

const renderModal = () =>
  render(
    <Provider store={store}>
      <IntlProvider locale='en'>
        <BookmarkFolderAdderModal statusId='10' onClose={vi.fn()} />
      </IntlProvider>
    </Provider>,
  );

const checkbox = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLInputElement>(
    `input[type='checkbox'][value='${id}']`,
  );

describe('<BookmarkFolderAdderModal />', () => {
  beforeEach(() => {
    vi.mocked(apiGetBookmarkFolders).mockReset().mockResolvedValue(folders);
    vi.mocked(apiGetStatusBookmarkFolders).mockReset();
    vi.mocked(apiSetStatusBookmarkFolders)
      .mockReset()
      .mockImplementation((_id, ids) => Promise.resolve(saved(ids)));
    vi.mocked(apiCreateBookmarkFolder).mockReset();
  });

  it('sends the whole folder set when a folder is toggled', async () => {
    vi.mocked(apiGetStatusBookmarkFolders).mockResolvedValue({
      folder_ids: ['1'],
    });
    const { container } = renderModal();

    await waitFor(() => {
      expect(checkbox(container, '1')?.checked).toBe(true);
    });

    fireEvent.click(checkbox(container, '2') as HTMLInputElement);

    await waitFor(() => {
      expect(apiSetStatusBookmarkFolders).toHaveBeenCalledWith('10', [
        '1',
        '2',
      ]);
    });
  });

  it('adds a folder created before the status folders loaded', async () => {
    let finishLoad: (value: { folder_ids: string[] }) => void = () => {};
    vi.mocked(apiGetStatusBookmarkFolders).mockReturnValue(
      new Promise((resolve) => {
        finishLoad = resolve;
      }),
    );
    vi.mocked(apiCreateBookmarkFolder).mockResolvedValue({
      id: '9',
      name: 'Fresh',
      position: 2,
      statuses_count: 0,
    });
    renderModal();

    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'Fresh' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('Fresh');
    expect(apiSetStatusBookmarkFolders).not.toHaveBeenCalled();

    finishLoad({ folder_ids: ['1'] });

    await waitFor(() => {
      expect(apiSetStatusBookmarkFolders).toHaveBeenCalledWith('10', [
        '1',
        '9',
      ]);
    });
  });

  it('offers a retry when the status folders cannot be loaded', async () => {
    vi.mocked(apiGetStatusBookmarkFolders)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ folder_ids: [] });
    renderModal();

    expect(await screen.findByText('Could not load the folders.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.queryByText('Could not load the folders.')).toBeNull();
    });
  });
});
