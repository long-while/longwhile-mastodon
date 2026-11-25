import { useCallback, useContext } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { BookmarkContext } from '../bookmark_context';

const messages = defineMessages({
  edit: { id: 'bookmark_note.edit', defaultMessage: 'Edit note' },
});

export const BookmarkNote: React.FC<{ statusId: string }> = ({ statusId }) => {
  const intl = useIntl();
  const context = useContext(BookmarkContext);
  const note = context?.details[statusId]?.note;
  const onEditNote = context?.onEditNote;

  const handleClick = useCallback(() => {
    onEditNote?.(statusId);
  }, [onEditNote, statusId]);

  if (!note) return null;

  return (
    <button
      type='button'
      className='bookmark-note'
      onClick={handleClick}
      title={intl.formatMessage(messages.edit)}
    >
      <span className='bookmark-note__text'>
        <span className='bookmark-note__label'>
          <FormattedMessage id='bookmark_note.label' defaultMessage='Note' />
          {': '}
        </span>
        {note}
      </span>
    </button>
  );
};
