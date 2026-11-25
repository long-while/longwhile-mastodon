import { Provider } from 'react-redux';

import { act, renderHook } from '@testing-library/react';

import { store } from 'mastodon/store';

import {
  SEARCH_DEBOUNCE_MS,
  buildBookmarkQuery,
  hasActiveFilters,
  useBookmarkFilters,
} from '../use_bookmark_filters';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('buildBookmarkQuery', () => {
  it('combines the tab with search and filters, dropping empty values', () => {
    expect(
      buildBookmarkQuery('none', {
        q: '  cake ',
        onlyMedia: true,
        accountId: '7',
      }),
    ).toEqual({ folderId: 'none', q: 'cake', onlyMedia: true, accountId: '7' });

    expect(
      buildBookmarkQuery(undefined, { q: '   ', onlyMedia: false }),
    ).toEqual({});
  });

  it('tells whether any filter is active', () => {
    expect(hasActiveFilters({ q: ' ', onlyMedia: false })).toBe(false);
    expect(hasActiveFilters({ q: '', onlyMedia: true })).toBe(true);
    expect(hasActiveFilters({ q: '', onlyMedia: false, accountId: '1' })).toBe(
      true,
    );
  });
});

describe('useBookmarkFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits the search text after the debounce delay', () => {
    const { result } = renderHook(() => useBookmarkFilters(''), { wrapper });

    act(() => {
      result.current.setSearchText('ca');
    });
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50);
    });
    act(() => {
      result.current.setSearchText('cake');
    });
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50);
    });
    expect(result.current.filters.q).toBe('');

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.filters.q).toBe('cake');
  });

  it('searches right away on submit and empties on clear', () => {
    const { result } = renderHook(() => useBookmarkFilters(''), { wrapper });

    act(() => {
      result.current.setSearchText('soup');
    });
    act(() => {
      result.current.submitSearch();
    });
    expect(result.current.filters.q).toBe('soup');

    act(() => {
      result.current.clearSearch();
    });
    expect(result.current.searchText).toBe('');
    expect(result.current.filters.q).toBe('');
  });

  it('clears the search and every filter at once', () => {
    const { result } = renderHook(
      () =>
        useBookmarkFilters('', { q: 'tea', onlyMedia: true, accountId: '3' }),
      { wrapper },
    );

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.searchText).toBe('');
    expect(result.current.filters).toEqual({
      q: '',
      onlyMedia: false,
      accountId: undefined,
    });
    expect(hasActiveFilters(result.current.filters)).toBe(false);
  });

  it('starts from the pinned column params', () => {
    const { result } = renderHook(
      () =>
        useBookmarkFilters('col', {
          q: 'tea',
          onlyMedia: true,
          accountId: '3',
        }),
      { wrapper },
    );

    expect(result.current.searchText).toBe('tea');
    expect(result.current.filters).toEqual({
      q: 'tea',
      onlyMedia: true,
      accountId: '3',
    });
  });
});
