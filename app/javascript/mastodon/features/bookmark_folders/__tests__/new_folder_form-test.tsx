import { IntlProvider } from 'react-intl';

import { Provider } from 'react-redux';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { apiCreateBookmarkFolder } from 'mastodon/api/bookmark_folders';
import { store } from 'mastodon/store';

import { FOLDERS_PER_ACCOUNT, NewFolderForm } from '../new_folder_form';

vi.mock('mastodon/api/bookmark_folders');

const renderForm = (folderCount: number, onCreate = vi.fn()) => {
  render(
    <Provider store={store}>
      <IntlProvider locale='en'>
        <NewFolderForm folderCount={folderCount} onCreate={onCreate} />
      </IntlProvider>
    </Provider>,
  );

  return onCreate;
};

describe('<NewFolderForm />', () => {
  beforeEach(() => {
    vi.mocked(apiCreateBookmarkFolder).mockReset();
  });

  it('shows the limit message instead of the form when full', () => {
    renderForm(FOLDERS_PER_ACCOUNT);

    expect(
      screen.getByText(`You can have up to ${FOLDERS_PER_ACCOUNT} folders.`),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps the create button disabled for a blank name', () => {
    renderForm(0);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Create' })
        .disabled,
    ).toBe(true);
    expect(apiCreateBookmarkFolder).not.toHaveBeenCalled();
  });

  it('sends the trimmed name and reports the created folder', async () => {
    const created = { id: '9', name: 'Recipes', position: 0 };
    vi.mocked(apiCreateBookmarkFolder).mockResolvedValue(created);
    const onCreate = renderForm(0);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  Recipes  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(created);
    });
    expect(apiCreateBookmarkFolder).toHaveBeenCalledWith('Recipes');
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('');
  });
});
