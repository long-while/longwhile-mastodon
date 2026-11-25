import { IntlProvider } from 'react-intl';

import { Provider } from 'react-redux';

import { fireEvent, render, screen } from '@testing-library/react';

import { store } from 'mastodon/store';

import { BookmarkFolderTabs } from '../folder_tabs';

const folders = [
  { id: '1', name: 'Read later', position: 0 },
  { id: '2', name: 'Recipes', position: 1 },
];

const renderTabs = (selectedId?: string) => {
  const onSelect = vi.fn();

  render(
    <Provider store={store}>
      <IntlProvider locale='en'>
        <BookmarkFolderTabs
          folders={folders}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </IntlProvider>
    </Provider>,
  );

  return onSelect;
};

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('<BookmarkFolderTabs />', () => {
  it('is a labelled navigation with the active tab pressed', () => {
    renderTabs('2');

    expect(
      screen.getByRole('navigation', { name: 'Bookmark folders' }),
    ).toBeTruthy();
    expect(pressed('Recipes')).toBe('true');
    expect(pressed('Read later')).toBe('false');
    expect(pressed('All')).toBe('false');
  });

  it('presses "All" when no folder is selected', () => {
    renderTabs();

    expect(pressed('All')).toBe('true');
  });

  it('gives each folder tab its full name as a title', () => {
    renderTabs();

    expect(
      screen.getByRole('button', { name: 'Recipes' }).getAttribute('title'),
    ).toBe('Recipes');
  });

  it('calls onSelect with the folder id, or undefined for "All"', () => {
    const onSelect = renderTabs('1');

    fireEvent.click(screen.getByRole('button', { name: 'Recipes' }));
    expect(onSelect).toHaveBeenLastCalledWith('2');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });
});
