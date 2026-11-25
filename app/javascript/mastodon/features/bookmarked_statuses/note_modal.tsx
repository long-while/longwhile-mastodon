import { useCallback, useId, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { isFulfilled } from '@reduxjs/toolkit';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import {
  BOOKMARK_NOTE_MAX_LENGTH,
  setBookmarkNote,
} from 'mastodon/actions/bookmark_list';
import { Button } from 'mastodon/components/button';
import { IconButton } from 'mastodon/components/icon_button';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
  save: { id: 'bookmark_note.save', defaultMessage: 'Save' },
  cancel: { id: 'bookmark_folders.cancel', defaultMessage: 'Cancel' },
  remove: { id: 'bookmark_note.delete', defaultMessage: 'Delete note' },
  placeholder: {
    id: 'bookmark_note.placeholder',
    defaultMessage: 'Why did you save this post?',
  },
});

const useSaveNote = (statusId: string, onClose: () => void) => {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = useCallback(
    (note: string) => {
      setBusy(true);
      setFailed(false);
      void dispatch(setBookmarkNote({ statusId, note, skipAlert: true })).then(
        (result) => {
          setBusy(false);
          if (isFulfilled(result)) {
            onClose();
          } else {
            setFailed(true);
          }
          return result;
        },
      );
    },
    [dispatch, statusId, onClose],
  );

  return { busy, failed, save };
};

export const BookmarkNoteModal: React.FC<{
  statusId: string;
  onClose: () => void;
}> = ({ statusId, onClose }) => {
  const intl = useIntl();
  const fieldId = useId();
  const initial = useAppSelector(
    (state) => state.bookmarkDetails[statusId]?.note ?? '',
  );
  const [note, setNote] = useState(initial);
  const { busy, failed, save } = useSaveNote(statusId, onClose);
  const trimmed = note.trim();
  const tooLong = note.length > BOOKMARK_NOTE_MAX_LENGTH;
  const canSave = !busy && !tooLong && trimmed !== initial;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setNote(e.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (canSave) save(trimmed);
    },
    [canSave, save, trimmed],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (canSave) save(trimmed);
    },
    [canSave, save, trimmed],
  );

  const handleDelete = useCallback(() => {
    if (!busy) save('');
  }, [busy, save]);

  return (
    <div className='modal-root__modal dialog-modal bookmark-modal bookmark-note-modal'>
      <div className='dialog-modal__header'>
        <IconButton
          className='dialog-modal__header__close'
          title={intl.formatMessage(messages.close)}
          icon='times'
          iconComponent={CloseIcon}
          onClick={onClose}
        />

        <label className='dialog-modal__header__title' htmlFor={fieldId}>
          {initial ? (
            <FormattedMessage
              id='bookmark_note.edit'
              defaultMessage='Edit note'
            />
          ) : (
            <FormattedMessage
              id='bookmark_note.add'
              defaultMessage='Add note'
            />
          )}
        </label>
      </div>

      <form className='dialog-modal__content' onSubmit={handleSubmit}>
        <div className='dialog-modal__content__form'>
          <textarea
            id={fieldId}
            className='bookmark-note-modal__field'
            value={note}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            maxLength={BOOKMARK_NOTE_MAX_LENGTH}
            rows={5}
            placeholder={intl.formatMessage(messages.placeholder)}
            aria-describedby={`${fieldId}-count`}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />

          <div className='bookmark-note-modal__meta'>
            {failed && (
              <span role='alert' className='bookmark-note-modal__error'>
                <FormattedMessage
                  id='bookmark_note.save_error'
                  defaultMessage='Could not save the note. Please try again.'
                />
              </span>
            )}

            <span
              id={`${fieldId}-count`}
              className='bookmark-note-modal__count'
            >
              {note.length}/{BOOKMARK_NOTE_MAX_LENGTH}
            </span>
          </div>

          <div className='bookmark-note-modal__actions'>
            {initial && (
              <Button
                className='bookmark-note-modal__delete'
                secondary
                dangerous
                disabled={busy}
                onClick={handleDelete}
                text={intl.formatMessage(messages.remove)}
              />
            )}

            <div className='spacer' />

            <Button
              secondary
              onClick={onClose}
              text={intl.formatMessage(messages.cancel)}
            />
            <Button
              type='submit'
              disabled={!canSave}
              text={intl.formatMessage(messages.save)}
            />
          </div>
        </div>
      </form>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default BookmarkNoteModal;
