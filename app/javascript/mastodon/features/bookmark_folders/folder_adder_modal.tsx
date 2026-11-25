import { useCallback, useEffect, useRef, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { isFulfilled } from '@reduxjs/toolkit';

import BookmarksIcon from '@/material-icons/400-24px/bookmarks.svg?react';
import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import {
  fetchBookmarkFolders,
  setStatusBookmarkFolders,
} from 'mastodon/actions/bookmark_folders';
import { apiGetStatusBookmarkFolders } from 'mastodon/api/bookmark_folders';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
import { Button } from 'mastodon/components/button';
import { CheckBox } from 'mastodon/components/check_box';
import { Icon } from 'mastodon/components/icon';
import { IconButton } from 'mastodon/components/icon_button';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { NewFolderForm } from './new_folder_form';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
  retry: { id: 'bookmark_folders.retry', defaultMessage: 'Try again' },
});

const FolderItem: React.FC<{
  folder: ApiBookmarkFolderJSON;
  checked: boolean;
  disabled: boolean;
  onToggle: (id: string, checked: boolean) => void;
}> = ({ folder, checked, disabled, onToggle }) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onToggle(folder.id, e.target.checked);
    },
    [folder.id, onToggle],
  );

  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label className='lists__item'>
      <div className='lists__item__title'>
        <Icon id='bookmarks' icon={BookmarksIcon} />
        <span>{folder.name}</span>
      </div>

      <CheckBox
        value={folder.id}
        checked={checked}
        onChange={disabled ? undefined : handleChange}
      />
    </label>
  );
};

const useStatusFolders = (statusId: string) => {
  const dispatch = useAppDispatch();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pendingAdds, setPendingAdds] = useState<string[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const queued = useRef(0);

  const reload = useCallback(
    () =>
      apiGetStatusBookmarkFolders(statusId)
        .then(({ folder_ids }) => {
          setSelected(folder_ids);
          setFailed(false);
          return folder_ids;
        })
        .catch(() => {
          setFailed(true);
        }),
    [statusId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    (folderIds: string[]) => {
      setSelected(folderIds);
      queued.current += 1;
      queue.current = queue.current.then(async () => {
        const result = await dispatch(
          setStatusBookmarkFolders({ statusId, folderIds }),
        );
        queued.current -= 1;
        if (queued.current > 0) return;

        if (isFulfilled(result)) {
          setSelected(result.payload.folderIds);
        } else {
          await reload();
        }
      });
    },
    [dispatch, statusId, reload],
  );

  useEffect(() => {
    if (!selected || pendingAdds.length === 0) return;
    setPendingAdds([]);
    save([...selected, ...pendingAdds.filter((id) => !selected.includes(id))]);
  }, [selected, pendingAdds, save]);

  const addWhenLoaded = useCallback((id: string) => {
    setPendingAdds((current) => [...current, id]);
  }, []);

  return { selected, pendingAdds, failed, save, reload, addWhenLoaded };
};

const LoadError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const intl = useIntl();

  return (
    <div role='alert' className='bookmark-folders__retry'>
      <p className='bookmark-folders__hint'>
        <FormattedMessage
          id='bookmark_folders.load_error'
          defaultMessage='Could not load the folders.'
        />
      </p>
      <Button text={intl.formatMessage(messages.retry)} onClick={onRetry} />
    </div>
  );
};

export const BookmarkFolderAdderModal: React.FC<{
  statusId: string;
  onClose: () => void;
}> = ({ statusId, onClose }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const folders = useAppSelector((state) => state.bookmarkFolders.items);
  const foldersLoaded = useAppSelector((state) => state.bookmarkFolders.loaded);
  const foldersFailed = useAppSelector(
    (state) => state.bookmarkFolders.hasError,
  );
  const { selected, pendingAdds, failed, save, reload, addWhenLoaded } =
    useStatusFolders(statusId);
  const loadFailed = failed || (foldersFailed && !foldersLoaded);

  useEffect(() => {
    void dispatch(fetchBookmarkFolders());
  }, [dispatch]);

  const handleRetry = useCallback(() => {
    void dispatch(fetchBookmarkFolders());
    void reload();
  }, [dispatch, reload]);

  const handleToggle = useCallback(
    (id: string, checked: boolean) => {
      if (!selected) return;
      const rest = selected.filter((folderId) => folderId !== id);
      save(checked ? [...rest, id] : rest);
    },
    [selected, save],
  );

  const handleCreate = useCallback(
    (folder: ApiBookmarkFolderJSON) => {
      if (selected) {
        save([...selected, folder.id]);
      } else {
        addWhenLoaded(folder.id);
      }
    },
    [selected, save, addWhenLoaded],
  );

  return (
    <div className='modal-root__modal dialog-modal'>
      <div className='dialog-modal__header'>
        <IconButton
          className='dialog-modal__header__close'
          title={intl.formatMessage(messages.close)}
          icon='times'
          iconComponent={CloseIcon}
          onClick={onClose}
        />

        <span className='dialog-modal__header__title'>
          <FormattedMessage
            id='bookmark_folders.adder.title'
            defaultMessage='Add to bookmark folder'
          />
        </span>
      </div>

      <div className='dialog-modal__content'>
        <p className='bookmark-folders__hint'>
          <FormattedMessage
            id='bookmark_folders.adder.hint'
            defaultMessage='Adding a post to a folder bookmarks it automatically. Removing it from every folder keeps the bookmark.'
          />
        </p>

        {loadFailed && <LoadError onRetry={handleRetry} />}

        <div className='lists-scrollable'>
          <NewFolderForm folderCount={folders.length} onCreate={handleCreate} />

          {foldersLoaded && folders.length === 0 && (
            <p className='bookmark-folders__hint'>
              <FormattedMessage
                id='bookmark_folders.adder.empty'
                defaultMessage='You have no folders yet. Type a name to create your first one.'
              />
            </p>
          )}

          {folders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              checked={
                !!selected?.includes(folder.id) ||
                pendingAdds.includes(folder.id)
              }
              disabled={selected === null}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default BookmarkFolderAdderModal;
