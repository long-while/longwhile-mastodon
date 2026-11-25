import { useCallback, useEffect, useRef, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { isFulfilled } from '@reduxjs/toolkit';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import {
  deleteBookmarkFolder,
  fetchBookmarkFolders,
  reorderBookmarkFolders,
} from 'mastodon/actions/bookmark_folders';
import { openModal } from 'mastodon/actions/modal';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
import { IconButton } from 'mastodon/components/icon_button';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import type { FolderRowFocus } from './folder_row';
import { FolderRow } from './folder_row';
import { NewFolderForm } from './new_folder_form';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
  deleteTitle: {
    id: 'bookmark_folders.delete_confirm.title',
    defaultMessage: 'Delete this folder?',
  },
  deleteMessage: {
    id: 'bookmark_folders.delete_confirm.message',
    defaultMessage:
      'The folder "{name}" will be deleted. The posts in it stay bookmarked.',
  },
  deleteConfirm: { id: 'bookmark_folders.delete', defaultMessage: 'Delete' },
});

export const moveFolderId = (ids: string[], index: number, delta: number) => {
  const target = index + delta;
  const moving = ids[index];
  if (moving === undefined || target < 0 || target >= ids.length) return null;

  const next = ids.filter((_, i) => i !== index);
  next.splice(target, 0, moving);
  return next;
};

type PendingFocus = { id: string; kind: FolderRowFocus } | { kind: 'new' };

const focusFor = (pending: PendingFocus | null, id: string) =>
  pending && pending.kind !== 'new' && pending.id === id
    ? pending.kind
    : undefined;

const useFolderActions = () => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const folders = useAppSelector((state) => state.bookmarkFolders.items);
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);
  const reordering = useRef(false);

  const handleFocusHandled = useCallback(() => {
    setPendingFocus(null);
  }, []);

  const handleMove = useCallback(
    (index: number, delta: number) => {
      const moved = folders[index];
      const folderIds = moveFolderId(
        folders.map((f) => f.id),
        index,
        delta,
      );
      if (!moved || !folderIds || reordering.current) return;

      reordering.current = true;
      void dispatch(reorderBookmarkFolders({ folderIds })).then((result) => {
        reordering.current = false;
        if (isFulfilled(result)) {
          setPendingFocus({ id: moved.id, kind: delta < 0 ? 'up' : 'down' });
        } else {
          void dispatch(fetchBookmarkFolders());
        }
        return result;
      });
    },
    [dispatch, folders],
  );

  const handleDelete = useCallback(
    (folder: ApiBookmarkFolderJSON) => {
      const at = folders.findIndex((f) => f.id === folder.id);
      const neighbour = folders[at + 1] ?? folders[at - 1];

      dispatch(
        openModal({
          modalType: 'CONFIRM',
          modalProps: {
            title: intl.formatMessage(messages.deleteTitle),
            message: intl.formatMessage(messages.deleteMessage, {
              name: folder.name,
            }),
            confirm: intl.formatMessage(messages.deleteConfirm),
            onConfirm: () => {
              void dispatch(deleteBookmarkFolder({ id: folder.id })).then(
                (result) => {
                  if (!isFulfilled(result)) return result;
                  setPendingFocus(
                    neighbour
                      ? { id: neighbour.id, kind: 'row' }
                      : { kind: 'new' },
                  );
                  return result;
                },
              );
            },
          },
        }),
      );
    },
    [dispatch, intl, folders],
  );

  return {
    folders,
    pendingFocus,
    handleFocusHandled,
    handleMove,
    handleDelete,
  };
};

export const BookmarkFolderManagerModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const newInputRef = useRef<HTMLInputElement>(null);
  const {
    folders,
    pendingFocus,
    handleFocusHandled,
    handleMove,
    handleDelete,
  } = useFolderActions();

  useEffect(() => {
    void dispatch(fetchBookmarkFolders());
  }, [dispatch]);

  useEffect(() => {
    if (pendingFocus?.kind !== 'new') return;
    newInputRef.current?.focus();
    handleFocusHandled();
  }, [pendingFocus, handleFocusHandled]);

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
            id='bookmark_folders.manager.title'
            defaultMessage='Manage bookmark folders'
          />
        </span>
      </div>

      <div className='dialog-modal__content'>
        <div className='lists-scrollable'>
          <NewFolderForm folderCount={folders.length} inputRef={newInputRef} />

          {folders.length === 0 && (
            <p className='bookmark-folders__hint'>
              <FormattedMessage
                id='bookmark_folders.manager.empty'
                defaultMessage='You have no folders yet.'
              />
            </p>
          )}

          {folders.map((folder, index) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              index={index}
              count={folders.length}
              focusKind={focusFor(pendingFocus, folder.id)}
              onFocusHandled={handleFocusHandled}
              onMove={handleMove}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default BookmarkFolderManagerModal;
