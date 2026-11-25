import { useCallback, useState } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { isFulfilled } from '@reduxjs/toolkit';

import { createBookmarkFolder } from 'mastodon/actions/bookmark_folders';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
import { Button } from 'mastodon/components/button';
import { useAppDispatch } from 'mastodon/store';

export const FOLDER_NAME_MAX = 30;
export const FOLDERS_PER_ACCOUNT = 50;

const messages = defineMessages({
  placeholder: {
    id: 'bookmark_folders.new_folder_name',
    defaultMessage: 'New folder name',
  },
  create: { id: 'bookmark_folders.create', defaultMessage: 'Create' },
  limit: {
    id: 'bookmark_folders.limit_reached',
    defaultMessage: 'You can have up to {limit} folders.',
  },
});

export const NewFolderForm: React.FC<{
  folderCount: number;
  onCreate?: (folder: ApiBookmarkFolderJSON) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}> = ({ folderCount, onCreate, inputRef }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const full = folderCount >= FOLDERS_PER_ACCOUNT;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed || busy || full) return;

      setBusy(true);
      void dispatch(createBookmarkFolder({ name: trimmed })).then((result) => {
        setBusy(false);
        if (isFulfilled(result)) {
          setName('');
          onCreate?.(result.payload);
        }
        return result;
      });
    },
    [dispatch, name, busy, full, onCreate],
  );

  if (full) {
    return (
      <p className='bookmark-folders__hint'>
        {intl.formatMessage(messages.limit, { limit: FOLDERS_PER_ACCOUNT })}
      </p>
    );
  }

  return (
    <form className='lists__item bookmark-folders__new' onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type='text'
        value={name}
        onChange={handleChange}
        maxLength={FOLDER_NAME_MAX}
        required
        disabled={busy}
        aria-label={intl.formatMessage(messages.placeholder)}
        placeholder={intl.formatMessage(messages.placeholder)}
      />

      <Button
        text={intl.formatMessage(messages.create)}
        type='submit'
        disabled={busy || !name.trim()}
      />
    </form>
  );
};
