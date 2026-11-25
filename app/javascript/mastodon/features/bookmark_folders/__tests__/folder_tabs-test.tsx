import { IntlProvider } from 'react-intl';

import { Provider } from 'react-redux';

import { fireEvent, render, screen } from '@testing-library/react';

import { store } from 'mastodon/store';

import { BookmarkFolderTabs } from '../folder_tabs';

const folders = [
  { id: '1', name: 'Read later', position: 0, statuses_count: 3 },
  { id: '2', name: 'Recipes', position: 1, statuses_count: 12 },
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

const tab = (name: string | RegExp) => screen.getByRole('button', { name });

const pressed = (name: string | RegExp) =>
  tab(name).getAttribute('aria-pressed');

describe('<BookmarkFolderTabs />', () => {
  it('is a labelled navigation with the active tab pressed', () => {
    renderTabs('2');

    expect(
      screen.getByRole('navigation', { name: 'Bookmark folders' }),
    ).toBeTruthy();
    expect(pressed(/^Recipes/)).toBe('true');
    expect(pressed(/^Read later/)).toBe('false');
    expect(pressed('All')).toBe('false');
    expect(pressed('Unsorted')).toBe('false');
  });

  it('presses "All" when no folder is selected', () => {
    renderTabs();

    expect(pressed('All')).toBe('true');
  });

  it('shows the post count of each folder', () => {
    renderTabs();

    expect(tab('Recipes 12')).toBeTruthy();
    expect(tab('Read later 3')).toBeTruthy();
    expect(tab(/^Recipes/).getAttribute('title')).toBe('Recipes (12 posts)');
  });

  it('puts the unsorted tab right after "All"', () => {
    renderTabs('none');

    const names = screen
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(names.slice(0, 3)).toEqual(['All', 'Unsorted', 'Read later 3']);
    expect(pressed('Unsorted')).toBe('true');
    expect(pressed('All')).toBe('false');
  });

  it('calls onSelect with the folder id, or undefined for "All"', () => {
    const onSelect = renderTabs('1');

    fireEvent.click(tab(/^Recipes/));
    expect(onSelect).toHaveBeenLastCalledWith('2');

    fireEvent.click(tab('Unsorted'));
    expect(onSelect).toHaveBeenLastCalledWith('none');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });
});
