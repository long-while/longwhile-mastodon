import { useEffect, useRef, useCallback, useMemo, useState } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import { Helmet } from 'react-helmet';

import BookmarksIcon from '@/material-icons/400-24px/bookmarks-fill.svg?react';
import {
  UNSORTED_FOLDER_ID,
  isRealFolderId,
  removeStatusesFromBookmarkFolder,
} from 'mastodon/actions/bookmark_list';
import {
  addColumn,
  removeColumn,
  moveColumn,
  changeColumnParams,
} from 'mastodon/actions/columns';
import { openModal } from 'mastodon/actions/modal';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
import { Button } from 'mastodon/components/button';
import { Column } from 'mastodon/components/column';
import type { ColumnRef } from 'mastodon/components/column';
import { ColumnHeader } from 'mastodon/components/column_header';
import { useAppHistory } from 'mastodon/components/router';
import StatusList from 'mastodon/components/status_list';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { BookmarkFolderTabs } from '../bookmark_folders/folder_tabs';

import { BookmarkContext } from './bookmark_context';
import type { BookmarkContextValue } from './bookmark_context';
import { BookmarkFilterBar } from './components/filter_bar';
import { BookmarkSelectActions } from './components/select_actions';
import { BookmarkSelectList } from './components/select_list';
import type { BookmarkColumnParams } from './use_bookmark_filters';
import {
  buildBookmarkQuery,
  hasActiveFilters,
  useBookmarkFilters,
} from './use_bookmark_filters';
import {
  useBookmarkDetailsLoader,
  useBookmarkFolders,
  useBookmarkList,
  useSelectMode,
} from './use_bookmark_page';

const messages = defineMessages({
  heading: { id: 'column.bookmarks', defaultMessage: 'Bookmarks' },
  headingWithFolder: {
    id: 'column.bookmarks_folder',
    defaultMessage: 'Bookmarks · {name}',
  },
  unsorted: { id: 'bookmark_folders.unsorted', defaultMessage: 'Unsorted' },
  showAll: {
    id: 'bookmark_folders.show_all',
    defaultMessage: 'Show all bookmarks',
  },
  resetFilters: {
    id: 'bookmarks.filter.reset_all',
    defaultMessage: 'Clear search and filters',
  },
});

const useSelectedFolder = (
  routeFolderId: string | undefined,
  columnId: string,
) => {
  const dispatch = useAppDispatch();
  const history = useAppHistory();
  const pinned = !!columnId;
  const [folderId, setFolderId] = useState(routeFolderId);

  useEffect(() => {
    setFolderId(routeFolderId);
  }, [routeFolderId]);

  const select = useCallback(
    (nextId: string | undefined) => {
      setFolderId(nextId);

      if (pinned) {
        dispatch(changeColumnParams(columnId, ['folderId'], nextId ?? null));
        return;
      }

      history.replace(nextId ? `/bookmarks/${nextId}` : '/bookmarks');
    },
    [dispatch, history, pinned, columnId],
  );

  return [folderId, select] as const;
};

const EmptyMessage: React.FC<{
  folderId?: string;
  missing: boolean;
  filtered: boolean;
  onShowAll: () => void;
  onResetFilters: () => void;
}> = ({ folderId, missing, filtered, onShowAll, onResetFilters }) => {
  const intl = useIntl();

  if (missing) {
    return (
      <div className='bookmark-empty'>
        <FormattedMessage
          id='bookmark_folders.missing'
          defaultMessage='Folder not found. It may have been deleted.'
        />
        <Button
          text={intl.formatMessage(messages.showAll)}
          onClick={onShowAll}
        />
      </div>
    );
  }

  if (filtered) {
    return (
      <div className='bookmark-empty'>
        <FormattedMessage
          id='empty_column.bookmarks_filtered'
          defaultMessage='No bookmarks match your search or filters.'
        />
        <Button
          secondary
          text={intl.formatMessage(messages.resetFilters)}
          onClick={onResetFilters}
        />
      </div>
    );
  }

  if (folderId === UNSORTED_FOLDER_ID) {
    return (
      <FormattedMessage
        id='empty_column.bookmarks_unsorted'
        defaultMessage='Every bookmark is in a folder.'
      />
    );
  }

  if (folderId) {
    return (
      <FormattedMessage
        id='empty_column.bookmark_folder'
        defaultMessage='There are no posts in this folder yet. Use "Add to bookmark folder" in the menu of a post.'
      />
    );
  }

  return (
    <FormattedMessage
      id='empty_column.bookmarked_statuses'
      defaultMessage="You don't have any bookmarked posts yet. When you bookmark one, it will show up here."
    />
  );
};

const useColumnTitle = (
  folderId: string | undefined,
  folder: ApiBookmarkFolderJSON | undefined,
) => {
  const intl = useIntl();

  if (folder) {
    return intl.formatMessage(messages.headingWithFolder, {
      name: folder.name,
    });
  }

  if (folderId === UNSORTED_FOLDER_ID) {
    return intl.formatMessage(messages.headingWithFolder, {
      name: intl.formatMessage(messages.unsorted),
    });
  }

  return intl.formatMessage(messages.heading);
};

const useBookmarkContextValue = (
  realFolderId: string | undefined,
): BookmarkContextValue => {
  const dispatch = useAppDispatch();
  const details = useAppSelector((state) => state.bookmarkDetails);

  const onEditNote = useCallback(
    (statusId: string) => {
      dispatch(
        openModal({ modalType: 'BOOKMARK_NOTE', modalProps: { statusId } }),
      );
    },
    [dispatch],
  );

  const onRemoveFromFolder = useCallback(
    (statusId: string) => {
      if (!realFolderId) return;
      void dispatch(
        removeStatusesFromBookmarkFolder({
          folderId: realFolderId,
          statusIds: [statusId],
        }),
      );
    },
    [dispatch, realFolderId],
  );

  return useMemo(
    () => ({ folderId: realFolderId, details, onEditNote, onRemoveFromFolder }),
    [realFolderId, details, onEditNote, onRemoveFromFolder],
  );
};

const Bookmarks: React.FC<{
  columnId: string;
  multiColumn: boolean;
  params?: BookmarkColumnParams;
}> = ({ columnId, multiColumn, params }) => {
  const dispatch = useAppDispatch();
  const columnRef = useRef<ColumnRef>(null);
  const pinned = !!columnId;
  const [folderId, selectFolder] = useSelectedFolder(
    params?.folderId ?? undefined,
    columnId,
  );
  const realFolderId = isRealFolderId(folderId) ? folderId : undefined;
  const filterState = useBookmarkFilters(columnId, params);
  const { filters } = filterState;
  const filtered = hasActiveFilters(filters);
  const query = useMemo(
    () => buildBookmarkQuery(folderId, filters),
    [folderId, filters],
  );

  const { folders, failed: foldersFailed, settled } = useBookmarkFolders();
  const folder = realFolderId
    ? folders.find((f) => f.id === realFolderId)
    : undefined;
  const folderMissing = !!realFolderId && settled && !foldersFailed && !folder;
  const title = useColumnTitle(folderId, folder);

  const canLoad = !realFolderId || !!folder || foldersFailed;
  const list = useBookmarkList(query, canLoad);
  useBookmarkDetailsLoader(list.statusIds);

  const select = useSelectMode({
    statusIds: list.statusIds,
    listKey: list.key,
    folderId: realFolderId,
    folders,
  });
  const contextValue = useBookmarkContextValue(realFolderId);

  const handlePin = useCallback(() => {
    if (columnId) {
      dispatch(removeColumn(columnId));
      return;
    }

    const { folderId: pinnedFolderId, q, onlyMedia, accountId, note } = query;
    dispatch(
      addColumn('BOOKMARKS', {
        ...(pinnedFolderId && { folderId: pinnedFolderId }),
        ...(q && { q }),
        ...(onlyMedia && { onlyMedia }),
        ...(accountId && { accountId }),
        ...(note && { note }),
      }),
    );
  }, [dispatch, columnId, query]);

  const handleMove = useCallback(
    (dir: number) => {
      dispatch(moveColumn(columnId, dir));
    },
    [dispatch, columnId],
  );

  const handleShowAll = useCallback(() => {
    selectFolder(undefined);
  }, [selectFolder]);

  const handleHeaderClick = useCallback(() => {
    columnRef.current?.scrollTop();
  }, []);

  const statusIds = folderMissing ? list.statusIds.clear() : list.statusIds;
  const scrollKey = `bookmarked_statuses-${columnId}-${list.key}`;
  const emptyMessage = (
    <EmptyMessage
      folderId={folderId}
      missing={folderMissing}
      filtered={filtered}
      onShowAll={handleShowAll}
      onResetFilters={filterState.clearAll}
    />
  );

  return (
    <Column bindToDocument={!multiColumn} ref={columnRef} label={title}>
      <ColumnHeader
        icon='bookmarks'
        iconComponent={BookmarksIcon}
        title={title}
        onPin={handlePin}
        onMove={handleMove}
        onClick={handleHeaderClick}
        pinned={pinned}
        multiColumn={multiColumn}
        appendContent={
          <>
            <BookmarkFolderTabs
              folders={folders}
              selectedId={folderId}
              onSelect={selectFolder}
            />

            <BookmarkFilterBar
              searchText={filterState.searchText}
              onSearchTextChange={filterState.setSearchText}
              onSearchSubmit={filterState.submitSearch}
              onSearchClear={filterState.clearSearch}
              onlyMedia={filters.onlyMedia}
              onOnlyMediaChange={filterState.setOnlyMedia}
              accountId={filters.accountId}
              onAccountChange={filterState.setAccountId}
              note={filters.note}
              onNoteChange={filterState.setNote}
              filtered={filtered}
              onClearAll={filterState.clearAll}
              selecting={select.selecting}
              onSelectingChange={select.changeSelecting}
              selectActions={
                <BookmarkSelectActions
                  selectedCount={select.selected.size}
                  loadedCount={statusIds.size}
                  busy={select.busy}
                  onSelectAll={select.selectAll}
                  onClearSelection={select.clear}
                  onMove={select.moveSelected}
                  onUnbookmark={select.unbookmarkSelected}
                />
              }
            />
          </>
        }
      />

      <BookmarkContext.Provider value={contextValue}>
        {select.selecting ? (
          <BookmarkSelectList
            statusIds={statusIds.toArray()}
            selected={select.selected}
            onToggle={select.toggle}
            scrollKey={`${scrollKey}-select`}
            hasMore={!folderMissing && !!list.next}
            isLoading={!folderMissing && list.isLoading}
            onLoadMore={list.loadMore}
            emptyMessage={emptyMessage}
            bindToDocument={!multiColumn}
          />
        ) : (
          <StatusList
            trackScroll={!pinned}
            statusIds={statusIds}
            scrollKey={scrollKey}
            hasMore={!folderMissing && !!list.next}
            isLoading={!folderMissing && list.isLoading}
            onLoadMore={list.loadMore}
            emptyMessage={emptyMessage}
            bindToDocument={!multiColumn}
            timelineId='bookmarks'
          />
        )}
      </BookmarkContext.Provider>

      <Helmet>
        <title>{title}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default Bookmarks;
