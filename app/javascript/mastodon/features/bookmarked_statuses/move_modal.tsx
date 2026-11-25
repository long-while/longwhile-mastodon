import { useCallback, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import { UNSORTED_FOLDER_ID } from 'mastodon/actions/bookmark_list';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
import { Button } from 'mastodon/components/button';
import { IconButton } from 'mastodon/components/icon_button';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
  unsorted: { id: 'bookmark_folders.unsorted', defaultMessage: 'Unsorted' },
  move: { id: 'bookmarks.move.confirm', defaultMessage: 'Move' },
});

interface MoveTarget {
  id: string;
  name: string;
}

const TargetOption: React.FC<{
  target: MoveTarget;
  checked: boolean;
  onPick: (id: string) => void;
}> = ({ target, checked, onPick }) => {
  const handleChange = useCallback(() => {
    onPick(target.id);
  }, [onPick, target.id]);

  return (
    <label
      className={classNames('bookmark-move-modal__option', {
        'bookmark-move-modal__option--checked': checked,
      })}
    >
      <input
        type='radio'
        name='bookmark-move-target'
        className='bookmark-move-modal__radio'
        checked={checked}
        onChange={handleChange}
      />
      <span className='bookmark-move-modal__name'>{target.name}</span>
    </label>
  );
};

export const BookmarkMoveModal: React.FC<{
  folders: ApiBookmarkFolderJSON[];
  includeUnsorted: boolean;
  onMove: (targetId: string) => void;
  onClose: () => void;
}> = ({ folders, includeUnsorted, onMove, onClose }) => {
  const intl = useIntl();
  const [picked, setPicked] = useState<string>();

  const targets: MoveTarget[] = [
    ...(includeUnsorted
      ? [
          {
            id: UNSORTED_FOLDER_ID,
            name: intl.formatMessage(messages.unsorted),
          },
        ]
      : []),
    ...folders.map(({ id, name }) => ({ id, name })),
  ];

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!picked) return;
      onClose();
      onMove(picked);
    },
    [picked, onClose, onMove],
  );

  return (
    <div className='modal-root__modal dialog-modal bookmark-modal bookmark-move-modal'>
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
            id='bookmarks.move.title'
            defaultMessage='Move bookmarks to which folder?'
          />
        </span>
      </div>

      <form className='dialog-modal__content' onSubmit={handleSubmit}>
        <div className='dialog-modal__content__form'>
          {targets.length === 0 ? (
            <p className='bookmark-folders__hint'>
              <FormattedMessage
                id='bookmarks.select.no_folders'
                defaultMessage='Create a folder first.'
              />
            </p>
          ) : (
            <div className='bookmark-move-modal__list' role='radiogroup'>
              {targets.map((target) => (
                <TargetOption
                  key={target.id}
                  target={target}
                  checked={picked === target.id}
                  onPick={setPicked}
                />
              ))}
            </div>
          )}

          <div className='bookmark-move-modal__actions'>
            <Button
              type='submit'
              disabled={!picked}
              text={intl.formatMessage(messages.move)}
            />
          </div>
        </div>
      </form>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default BookmarkMoveModal;
