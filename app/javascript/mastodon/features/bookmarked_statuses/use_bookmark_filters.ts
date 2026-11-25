import { useCallback, useEffect, useState } from 'react';

import { changeColumnParams } from 'mastodon/actions/columns';
import type {
  BookmarkNoteFilter,
  BookmarkQuery,
} from 'mastodon/api_types/bookmark_folders';
import { useAppDispatch } from 'mastodon/store';

export const SEARCH_DEBOUNCE_MS = 300;

export interface BookmarkFilters {
  q: string;
  onlyMedia: boolean;
  accountId?: string;
  note?: BookmarkNoteFilter;
}

export interface BookmarkColumnParams {
  folderId?: string | null;
  q?: string | null;
  onlyMedia?: boolean | null;
  accountId?: string | null;
  note?: BookmarkNoteFilter | null;
}

export const buildBookmarkQuery = (
  folderId: string | undefined,
  filters: BookmarkFilters,
): BookmarkQuery => {
  const query: BookmarkQuery = {};
  const q = filters.q.trim();

  if (folderId) query.folderId = folderId;
  if (q) query.q = q;
  if (filters.onlyMedia) query.onlyMedia = true;
  if (filters.accountId) query.accountId = filters.accountId;
  if (filters.note) query.note = filters.note;

  return query;
};

export const hasActiveFilters = (filters: BookmarkFilters) =>
  !!filters.q.trim() ||
  filters.onlyMedia ||
  !!filters.accountId ||
  !!filters.note;

const initialFilters = (params?: BookmarkColumnParams): BookmarkFilters => ({
  q: params?.q ?? '',
  onlyMedia: !!params?.onlyMedia,
  accountId: params?.accountId ?? undefined,
  note: params?.note ?? undefined,
});

const useColumnParam = (columnId: string) => {
  const dispatch = useAppDispatch();

  return useCallback(
    (key: keyof BookmarkColumnParams, value: string | boolean | null) => {
      if (columnId) dispatch(changeColumnParams(columnId, [key], value));
    },
    [dispatch, columnId],
  );
};

export const useBookmarkFilters = (
  columnId: string,
  params?: BookmarkColumnParams,
) => {
  const persist = useColumnParam(columnId);
  const [searchText, setSearchText] = useState(params?.q ?? '');
  const [filters, setFilters] = useState(() => initialFilters(params));

  const commitSearch = useCallback(
    (text: string) => {
      setFilters((current) =>
        current.q === text ? current : { ...current, q: text },
      );
      persist('q', text.trim() || null);
    },
    [persist],
  );

  useEffect(() => {
    if (searchText === filters.q) return;

    const timer = setTimeout(() => {
      commitSearch(searchText);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [searchText, filters.q, commitSearch]);

  const submitSearch = useCallback(() => {
    commitSearch(searchText);
  }, [commitSearch, searchText]);

  const clearSearch = useCallback(() => {
    setSearchText('');
    commitSearch('');
  }, [commitSearch]);

  const setOnlyMedia = useCallback(
    (onlyMedia: boolean) => {
      setFilters((current) => ({ ...current, onlyMedia }));
      persist('onlyMedia', onlyMedia || null);
    },
    [persist],
  );

  const setAccountId = useCallback(
    (accountId: string | undefined) => {
      setFilters((current) => ({ ...current, accountId }));
      persist('accountId', accountId ?? null);
    },
    [persist],
  );

  const setNote = useCallback(
    (note: BookmarkNoteFilter | undefined) => {
      setFilters((current) => ({ ...current, note }));
      persist('note', note ?? null);
    },
    [persist],
  );

  const clearAll = useCallback(() => {
    setSearchText('');
    setFilters({
      q: '',
      onlyMedia: false,
      accountId: undefined,
      note: undefined,
    });
    persist('q', null);
    persist('onlyMedia', null);
    persist('accountId', null);
    persist('note', null);
  }, [persist]);

  return {
    searchText,
    setSearchText,
    submitSearch,
    clearSearch,
    clearAll,
    filters,
    setOnlyMedia,
    setAccountId,
    setNote,
  };
};
