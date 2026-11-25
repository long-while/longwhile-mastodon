import { useCallback, useEffect, useRef, useState } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { isFulfilled } from '@reduxjs/toolkit';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import ChevronDownIcon from '@/styles/bird-theme-svg/chevron-down.svg?react';
import ChevronUpIcon from '@/styles/bird-theme-svg/chevron-up.svg?react';
import PencilIcon from '@/styles/bird-theme-svg/pencil.svg?react';
import TrashIcon from '@/styles/bird-theme-svg/trash.svg?react';
import { renameBookmarkFolder } from 'mastodon/actions/bookmark_folders';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
import { Button } from 'mastodon/components/button';
import { IconButton } from 'mastodon/components/icon_button';
import { useAppDispatch } from 'mastodon/store';

import { FOLDER_NAME_MAX } from './new_folder_form';

const messages = defineMessages({
  save: { id: 'bookmark_folders.save', defaultMessage: 'Save' },
  cancel: { id: 'bookmark_folders.cancel', defaultMessage: 'Cancel' },
  moveUp: {
    id: 'bookmark_folders.move_up',
    defaultMessage: 'Move "{name}" up',
  },
  moveDown: {
    id: 'bookmark_folders.move_down',
    defaultMessage: 'Move "{name}" down',
  },
  deleteNamed: {
    id: 'bookmark_folders.delete_named',
    defaultMessage: 'Delete "{name}"',
  },
  renameNamed: {
    id: 'bookmark_folders.rename_named',
    defaultMessage: 'Rename "{name}"',
  },
  nameLabel: {
    id: 'bookmark_folders.name_label',
    defaultMessage: 'Folder name',
  },
});

const RenameForm: React.FC<{
  folder: ApiBookmarkFolderJSON;
  onDone: () => void;
}> = ({ folder, onDone }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const [name, setName] = useState(folder.name);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onDone();
    },
    [onDone],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed || trimmed === folder.name) {
        onDone();
        return;
      }

      void dispatch(
        renameBookmarkFolder({ id: folder.id, name: trimmed }),
      ).then((result) => {
        if (isFulfilled(result)) onDone();
        return result;
      });
    },
    [dispatch, folder, name, onDone],
  );

  return (
    <form className='bookmark-folders__row' onSubmit={handleSubmit}>
      <input
        type='text'
        value={name}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        maxLength={FOLDER_NAME_MAX}
        required
        aria-label={intl.formatMessage(messages.nameLabel)}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
      <Button text={intl.formatMessage(messages.save)} type='submit' />
      <IconButton
        icon='times'
        iconComponent={CloseIcon}
        title={intl.formatMessage(messages.cancel)}
        onClick={onDone}
      />
    </form>
  );
};

export type FolderRowFocus = 'up' | 'down' | 'row';

interface FolderRowProps {
  folder: ApiBookmarkFolderJSON;
  index: number;
  count: number;
  focusKind?: FolderRowFocus;
  onFocusHandled: () => void;
  onMove: (index: number, delta: number) => void;
  onDelete: (folder: ApiBookmarkFolderJSON) => void;
}

const useRowFocus = (
  editing: boolean,
  focusKind: FolderRowFocus | undefined,
  onFocusHandled: () => void,
) => {
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLButtonElement>(null);
  const restoreRename = useRef(false);

  useEffect(() => {
    if (editing || !restoreRename.current) return;
    restoreRename.current = false;
    renameRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!focusKind || editing) return;

    const order =
      focusKind === 'up'
        ? [upRef, downRef, renameRef]
        : focusKind === 'down'
          ? [downRef, upRef, renameRef]
          : [renameRef];
    order
      .map((ref) => ref.current)
      .find((button) => button && !button.disabled)
      ?.focus();
    onFocusHandled();
  }, [focusKind, editing, onFocusHandled]);

  return { upRef, downRef, renameRef, restoreRename };
};

export const FolderRow: React.FC<FolderRowProps> = ({
  folder,
  index,
  count,
  focusKind,
  onFocusHandled,
  onMove,
  onDelete,
}) => {
  const intl = useIntl();
  const [editing, setEditing] = useState(false);
  const { upRef, downRef, renameRef, restoreRename } = useRowFocus(
    editing,
    focusKind,
    onFocusHandled,
  );
  const name = { name: folder.name };

  const startEditing = useCallback(() => {
    setEditing(true);
  }, []);
  const stopEditing = useCallback(() => {
    restoreRename.current = true;
    setEditing(false);
  }, [restoreRename]);
  const moveUp = useCallback(() => {
    onMove(index, -1);
  }, [onMove, index]);
  const moveDown = useCallback(() => {
    onMove(index, 1);
  }, [onMove, index]);
  const remove = useCallback(() => {
    onDelete(folder);
  }, [onDelete, folder]);

  if (editing) {
    return <RenameForm folder={folder} onDone={stopEditing} />;
  }

  return (
    <div className='bookmark-folders__row'>
      <span className='bookmark-folders__row__name'>{folder.name}</span>
      <IconButton
        ref={upRef}
        icon='arrow-up'
        iconComponent={ChevronUpIcon}
        title={intl.formatMessage(messages.moveUp, name)}
        onClick={moveUp}
        disabled={index === 0}
      />
      <IconButton
        ref={downRef}
        icon='arrow-down'
        iconComponent={ChevronDownIcon}
        title={intl.formatMessage(messages.moveDown, name)}
        onClick={moveDown}
        disabled={index === count - 1}
      />
      <IconButton
        ref={renameRef}
        icon='pencil'
        iconComponent={PencilIcon}
        title={intl.formatMessage(messages.renameNamed, name)}
        onClick={startEditing}
      />
      <IconButton
        icon='trash'
        iconComponent={TrashIcon}
        title={intl.formatMessage(messages.deleteNamed, name)}
        onClick={remove}
      />
    </div>
  );
};
