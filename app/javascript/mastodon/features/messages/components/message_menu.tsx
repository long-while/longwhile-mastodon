// @_longwhile custom feature

import { useCallback, useMemo } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import { hideDmMessage } from 'mastodon/actions/dm_rooms';
import { openModal } from 'mastodon/actions/modal';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import type { MenuItem } from 'mastodon/models/dropdown_menu';
import { useAppDispatch } from 'mastodon/store';
import { unescapeHTML } from 'mastodon/utils/html';

const messages = defineMessages({
  more: { id: 'status.more', defaultMessage: 'More' },
  copy: { id: 'messages.menu.copy', defaultMessage: 'Copy text' },
  edit: { id: 'messages.menu.edit', defaultMessage: 'Edit' },
  deleteForMe: {
    id: 'messages.menu.delete_for_me',
    defaultMessage: 'Delete for me',
  },
  deleteForEveryone: {
    id: 'messages.menu.delete_for_everyone',
    defaultMessage: 'Delete for everyone',
  },
  redraft: {
    id: 'messages.menu.redraft',
    defaultMessage: 'Delete & re-draft',
  },

  confirmDeleteForMeTitle: {
    id: 'confirmations.messages.delete_for_me.title',
    defaultMessage: 'Delete this message for you?',
  },
  confirmDeleteForMeMessage: {
    id: 'confirmations.messages.delete_for_me.message',
    defaultMessage:
      'This message disappears from your screen only. Other people still see it, and you cannot get it back.',
  },
  confirmDeleteForMeConfirm: {
    id: 'confirmations.messages.delete_for_me.confirm',
    defaultMessage: 'Delete',
  },

  confirmRedraftTitle: {
    id: 'confirmations.messages.redraft.title',
    defaultMessage: 'Delete and re-draft this message?',
  },
  confirmRedraftMessage: {
    id: 'confirmations.messages.redraft.message',
    defaultMessage:
      'The message disappears for everyone and its text comes back to the input box. If the other person already read it, that cannot be undone.',
  },
  confirmRedraftConfirm: {
    id: 'confirmations.messages.redraft.confirm',
    defaultMessage: 'Delete & re-draft',
  },
});

interface Props {
  statusId: string;
  isMine: boolean;

  roomId?: string;

  contentHtml?: string;

  onEdit?: (statusId: string) => void;
  onRedraft?: (statusId: string) => void;
}

export const MessageMenu: React.FC<Props> = ({
  statusId,
  isMine,
  roomId,
  contentHtml,
  onEdit,
  onRedraft,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const handleCopy = useCallback(() => {
    const text = contentHtml ? unescapeHTML(contentHtml) : '';

    if (!text) return;

    void navigator.clipboard.writeText(text).catch(() => undefined);
  }, [contentHtml]);

  const handleDeleteForMe = useCallback(() => {
    if (!roomId) return;

    dispatch(
      openModal({
        modalType: 'CONFIRM',
        modalProps: {
          title: intl.formatMessage(messages.confirmDeleteForMeTitle),
          message: intl.formatMessage(messages.confirmDeleteForMeMessage),
          confirm: intl.formatMessage(messages.confirmDeleteForMeConfirm),
          dangerous: true,
          onConfirm: () => {
            void dispatch(hideDmMessage({ roomId, statusId }));
          },
        },
      }),
    );
  }, [dispatch, intl, roomId, statusId]);

  const handleDeleteForEveryone = useCallback(() => {
    dispatch(
      openModal({
        modalType: 'CONFIRM_DELETE_STATUS',
        modalProps: { statusId, withRedraft: false },
      }),
    );
  }, [dispatch, statusId]);

  const handleEdit = useCallback(() => {
    onEdit?.(statusId);
  }, [onEdit, statusId]);

  const handleRedraft = useCallback(() => {
    dispatch(
      openModal({
        modalType: 'CONFIRM',
        modalProps: {
          title: intl.formatMessage(messages.confirmRedraftTitle),
          message: intl.formatMessage(messages.confirmRedraftMessage),
          confirm: intl.formatMessage(messages.confirmRedraftConfirm),
          dangerous: true,
          onConfirm: () => {
            onRedraft?.(statusId);
          },
        },
      }),
    );
  }, [dispatch, intl, onRedraft, statusId]);

  const items = useMemo(() => {
    const menu: MenuItem[] = [];

    if (isMine) {
      if (onEdit) {
        menu.push({
          text: intl.formatMessage(messages.edit),
          action: handleEdit,
        });
      }

      if (roomId) {
        menu.push({
          text: intl.formatMessage(messages.deleteForMe),
          action: handleDeleteForMe,
          dangerous: true,
        });
      }

      menu.push({
        text: intl.formatMessage(messages.deleteForEveryone),
        action: handleDeleteForEveryone,
        dangerous: true,
      });

      if (onRedraft) {
        menu.push({
          text: intl.formatMessage(messages.redraft),
          action: handleRedraft,
          dangerous: true,
        });
      }
    } else {
      if (contentHtml?.trim()) {
        menu.push({
          text: intl.formatMessage(messages.copy),
          action: handleCopy,
        });
      }

      if (roomId) {
        menu.push({
          text: intl.formatMessage(messages.deleteForMe),
          action: handleDeleteForMe,
          dangerous: true,
        });
      }
    }

    return menu;
  }, [
    contentHtml,
    handleCopy,
    handleDeleteForEveryone,
    handleDeleteForMe,
    handleEdit,
    handleRedraft,
    intl,
    isMine,
    onEdit,
    onRedraft,
    roomId,
  ]);

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
