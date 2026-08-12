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
  reply: { id: 'status.reply', defaultMessage: 'Reply' },
  copy: { id: 'messages.menu.copy', defaultMessage: 'Copy text' },
  open: { id: 'messages.menu.open', defaultMessage: 'View original post' },
  delete: { id: 'status.delete', defaultMessage: 'Delete' },
  report: { id: 'status.report', defaultMessage: 'Report @{name}' },
});

interface Props {
  statusId: string;

  accountId?: string;
  accountAcct?: string;

  isMine: boolean;

  contentHtml?: string;

  onReply: (statusId: string) => void;
}

export const MessageMenu: React.FC<Props> = ({
  statusId,
  accountId,
  accountAcct,
  isMine,
  contentHtml,
  onReply,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const handleReply = useCallback(() => {
    onReply(statusId);
  }, [onReply, statusId]);

  const handleCopy = useCallback(() => {
    const text = contentHtml ? unescapeHTML(contentHtml) : '';

    if (!text) return;

    void navigator.clipboard.writeText(text).catch(() => undefined);
  }, [contentHtml]);

  const handleDelete = useCallback(() => {
    dispatch(
      openModal({
        modalType: 'CONFIRM_DELETE_STATUS',
        modalProps: { statusId, withRedraft: false },
      }),
    );
  }, [dispatch, statusId]);

  const handleReport = useCallback(() => {
    if (!accountId) return;

    dispatch(
      openModal({
        modalType: 'REPORT',
        modalProps: { accountId, statusId },
      }),
    );
  }, [accountId, dispatch, statusId]);

  const items = useMemo(() => {
    const menu: MenuItem[] = [
      { text: intl.formatMessage(messages.reply), action: handleReply },
    ];

    if (contentHtml) {
      menu.push({ text: intl.formatMessage(messages.copy), action: handleCopy });
    }

    if (accountAcct) {
      menu.push({
        text: intl.formatMessage(messages.open),
        to: `/@${accountAcct}/${statusId}`,
      });
    }

    menu.push(null);

    if (isMine) {
      menu.push({
        text: intl.formatMessage(messages.delete),
        action: handleDelete,
        dangerous: true,
      });
    } else if (accountId) {
      menu.push({
        text: intl.formatMessage(messages.report, { name: accountAcct ?? '' }),
        action: handleReport,
        dangerous: true,
      });
    }

    return menu;
  }, [
    accountAcct,
    accountId,
    contentHtml,
    handleCopy,
    handleDelete,
    handleReply,
    handleReport,
    intl,
    isMine,
    statusId,
  ]);

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
