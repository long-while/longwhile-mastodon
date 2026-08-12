// @_longwhile custom feature

import { useCallback, useMemo } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import { openModal } from 'mastodon/actions/modal';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import type { MenuItem } from 'mastodon/models/dropdown_menu';
import { useAppDispatch } from 'mastodon/store';
import { unescapeHTML } from 'mastodon/utils/html';

const messages = defineMessages({
  more: { id: 'status.more', defaultMessage: 'More' },
  copy: { id: 'messages.menu.copy', defaultMessage: 'Copy text' },
  deleteForEveryone: {
    id: 'messages.menu.delete_for_everyone',
    defaultMessage: 'Delete for everyone',
  },
});

interface Props {
  statusId: string;
  isMine: boolean;

  contentHtml?: string;
}

export const MessageMenu: React.FC<Props> = ({
  statusId,
  isMine,
  contentHtml,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const handleCopy = useCallback(() => {
    const text = contentHtml ? unescapeHTML(contentHtml) : '';

    if (!text) return;

    void navigator.clipboard.writeText(text).catch(() => undefined);
  }, [contentHtml]);

  const handleDeleteForEveryone = useCallback(() => {
    dispatch(
      openModal({
        modalType: 'CONFIRM_DELETE_STATUS',
        modalProps: { statusId, withRedraft: false },
      }),
    );
  }, [dispatch, statusId]);

  const items = useMemo(() => {
    const menu: MenuItem[] = [];

    if (isMine) {
      menu.push({
        text: intl.formatMessage(messages.deleteForEveryone),
        action: handleDeleteForEveryone,
        dangerous: true,
      });
    } else if (contentHtml?.trim()) {
      menu.push({
        text: intl.formatMessage(messages.copy),
        action: handleCopy,
      });
    }

    return menu;
  }, [contentHtml, handleCopy, handleDeleteForEveryone, intl, isMine]);

  if (items.length === 0) return null;

  return (
    <div className='dm-message__menu'>
      <Dropdown
        items={items}
        icon='ellipsis-h'
        iconComponent={MoreHorizIcon}
        title={intl.formatMessage(messages.more)}
      />
    </div>
  );
};
