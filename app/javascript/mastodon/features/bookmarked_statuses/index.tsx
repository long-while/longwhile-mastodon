import { useEffect, useRef, useCallback, useState } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import { Helmet } from 'react-helmet';

import BookmarksIcon from '@/material-icons/400-24px/bookmarks-fill.svg?react';
import {
  fetchBookmarkFolders,
  fetchBookmarkFolderStatuses,
  bookmarkFolderListKey,
} from 'mastodon/actions/bookmark_folders';
import {
  fetchBookmarkedStatuses,
  expandBookmarkedStatuses,
} from 'mastodon/actions/bookmarks';
import {
  addColumn,
  removeColumn,
  moveColumn,
  changeColumnParams,
} from 'mastodon/actions/columns';
import { Button } from 'mastodon/components/button';
import { Column } from 'mastodon/components/column';
import type { ColumnRef } from 'mastodon/components/column';
import { ColumnHeader } from 'mastodon/components/column_header';
import { useAppHistory } from 'mastodon/components/router';
import StatusList from 'mastodon/components/status_list';
import { getStatusList } from 'mastodon/selectors';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { BookmarkFolderTabs } from '../bookmark_folders/folder_tabs';

const messages = defineMessages({
  heading: { id: 'column.bookmarks', defaultMessage: 'Bookmarks' },
  headingWithFolder: {
    id: 'column.bookmarks_folder',
    defaultMessage: 'Bookmarks · {name}',
  },
  showAll: {
    id: 'bookmark_folders.show_all',
    defaultMessage: 'Show all bookmarks',
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
  onShowAll: () => void;
}> = ({ folderId, missing, onShowAll }) => {
  const intl = useIntl();

  if (missing) {
    return (
      <>
        <FormattedMessage
          id='bookmark_folders.missing'
          defaultMessage='Folder not found. It may have been deleted.'
        />
        <Button
          text={intl.formatMessage(messages.showAll)}
          onClick={onShowAll}
        />
      </>
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

const Bookmarks: React.FC<{
  columnId: string;
  multiColumn: boolean;
  params?: { folderId?: string | null };
}> = ({ columnId, multiColumn, params }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const columnRef = useRef<ColumnRef>(null);
  const pinned = !!columnId;
  const [folderId, selectFolder] = useSelectedFolder(
    params?.folderId ?? undefined,
    columnId,
  );
  const listKey = folderId ? bookmarkFolderListKey(folderId) : 'bookmarks';

  const folders = useAppSelector((state) => state.bookmarkFolders.items);
  const foldersLoaded = useAppSelector((state) => state.bookmarkFolders.loaded);
  const foldersLoading = useAppSelector(
    (state) => state.bookmarkFolders.isLoading,
  );
  const foldersFailed = useAppSelector(
    (state) => state.bookmarkFolders.hasError,
  );
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  const folderExists = !!folder;
  const folderMissing =
    !!folderId && foldersLoaded && !foldersLoading && !folderExists;
  const title = folder
    ? intl.formatMessage(messages.headingWithFolder, { name: folder.name })
    : intl.formatMessage(messages.heading);
  const statusIds = useAppSelector((state) => getStatusList(state, listKey));
  const isLoading = useAppSelector(
    (state) =>
      state.status_lists.getIn([listKey, 'isLoading'], true) as boolean,
  );
  const next = useAppSelector(
    (state) =>
      state.status_lists.getIn([listKey, 'next'], null) as string | null,
  );

  useEffect(() => {
    void dispatch(fetchBookmarkFolders());
  }, [dispatch]);

  useEffect(() => {
    if (!folderId) {
      dispatch(fetchBookmarkedStatuses());
      return;
    }

    if (folderExists || foldersFailed) {
      void dispatch(fetchBookmarkFolderStatuses({ folderId }));
    }
  }, [dispatch, folderId, folderExists, foldersFailed]);

  const handlePin = useCallback(() => {
    if (columnId) {
      dispatch(removeColumn(columnId));
    } else {
      dispatch(addColumn('BOOKMARKS', folderId ? { folderId } : {}));
    }
  }, [dispatch, columnId, folderId]);

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

  const handleLoadMore = useCallback(() => {
    if (!folderId) {
      dispatch(expandBookmarkedStatuses());
      return;
    }

    if (next && !isLoading) {
      void dispatch(fetchBookmarkFolderStatuses({ folderId, url: next }));
    }
  }, [dispatch, folderId, next, isLoading]);

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
          <BookmarkFolderTabs
            folders={folders}
            selectedId={folderId}
            onSelect={selectFolder}
          />
        }
      />

      <StatusList
        trackScroll={!pinned}
        statusIds={folderMissing ? statusIds.clear() : statusIds}
        scrollKey={`bookmarked_statuses-${columnId}-${folderId ?? 'all'}`}
        hasMore={!folderMissing && !!next}
        isLoading={!folderMissing && isLoading}
        onLoadMore={handleLoadMore}
        emptyMessage={
          <EmptyMessage
            folderId={folderId}
            missing={folderMissing}
            onShowAll={handleShowAll}
          />
        }
        bindToDocument={!multiColumn}
        timelineId='bookmarks'
      />

      <Helmet>
        <title>{title}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default Bookmarks;
