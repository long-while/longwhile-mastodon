// @_longwhile custom feature

import { useCallback, useMemo, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { useHistory } from 'react-router-dom';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import PersonAddIcon from '@/material-icons/400-24px/person_add.svg?react';
import {
  createDmRoom,
  removeDmRoomMember,
  setDmRoomNickname,
} from 'mastodon/actions/dm_rooms';
import { openModal } from 'mastodon/actions/modal';
import { Avatar } from 'mastodon/components/avatar';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { Icon } from 'mastodon/components/icon';
import { IconButton } from 'mastodon/components/icon_button';
import { me } from 'mastodon/initial_state';
import type { MenuItem } from 'mastodon/models/dropdown_menu';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { selectDmRoom, selectMessageAccount } from './selectors';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
  more: { id: 'status.more', defaultMessage: 'More' },
  message: {
    id: 'messages.members.message',
    defaultMessage: 'Message this person',
  },
  setNickname: {
    id: 'messages.members.set_nickname',
    defaultMessage: 'Set a nickname',
  },
  remove: {
    id: 'messages.members.remove',
    defaultMessage: 'Remove from group',
  },
  nicknamePrompt: {
    id: 'messages.members.nickname_prompt',
    defaultMessage: 'Nickname for {name} (leave empty to clear)',
  },
  confirmRemoveTitle: {
    id: 'confirmations.messages.remove_member.title',
    defaultMessage: 'Remove {name} from this group?',
  },
  confirmRemoveMessage: {
    id: 'confirmations.messages.remove_member.message',
    defaultMessage:
      'They lose access to this conversation and cannot come back on their own. Everyone in the group is told.',
  },
  confirmRemoveConfirm: {
    id: 'confirmations.messages.remove_member.confirm',
    defaultMessage: 'Remove',
  },
});

const MemberRow: React.FC<{
  roomId: string;
  accountId: string;
  nickname?: string;
  canRemove: boolean;
  busy: boolean;
  onEditNickname: (accountId: string, name: string) => void;
  onRemove: (accountId: string, name: string) => void;
}> = ({
  roomId,
  accountId,
  nickname,
  canRemove,
  busy,
  onEditNickname,
  onRemove,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const history = useHistory();
  const account = useAppSelector((state) =>
    selectMessageAccount(state, accountId),
  );

  const displayName =
    account && account.display_name.length > 0
      ? account.display_name
      : (account?.username ?? '');

  const handleEditNickname = useCallback(() => {
    onEditNickname(accountId, displayName);
  }, [accountId, displayName, onEditNickname]);

  const handleMessage = useCallback(() => {
    const pending = dispatch(
      createDmRoom({ accountIds: [accountId] }),
    ) as unknown as Promise<{
      meta: { requestStatus: string };
      payload?: { id: string };
    }>;

    void pending.then((result) => {
      if (result.meta.requestStatus === 'fulfilled' && result.payload) {
        history.push(`/messages/${result.payload.id}`);
      }

      return result;
    });
  }, [accountId, dispatch, history]);

  const handleRemove = useCallback(() => {
    onRemove(accountId, displayName);
  }, [accountId, displayName, onRemove]);

  const items = useMemo(() => {
    const menu: MenuItem[] = [];

    if (account && accountId !== me) {
      menu.push({
        text: intl.formatMessage(messages.message),
        action: handleMessage,
      });
    }

    menu.push({
      text: intl.formatMessage(messages.setNickname),
      action: handleEditNickname,
    });

    if (canRemove) {
      menu.push(null);
      menu.push({
        text: intl.formatMessage(messages.remove),
        action: handleRemove,
        dangerous: true,
      });
    }

    return menu;
  }, [
    account,
    accountId,
    canRemove,
    handleEditNickname,
    handleMessage,
    handleRemove,
    intl,
  ]);

  if (!account) return null;

  const name = displayName;

  return (
    <div className='dm-members__row' key={roomId}>
      <Avatar account={account} size={40} />

      <span className='dm-members__row__text'>
        <span className='dm-members__row__name'>{nickname ?? name}</span>

        <span className='dm-members__row__handle'>
          {nickname ? `${name} · @${account.acct}` : `@${account.acct}`}
        </span>
      </span>

      <Dropdown
        items={items}
        overlayClassName='dm-members__row__menu'
        icon='ellipsis-h'
        iconComponent={MoreHorizIcon}
        title={intl.formatMessage(messages.more)}
        disabled={busy}
      />
    </div>
  );
};

const DmMemberModal: React.FC<{
  roomId: string;
  onClose: () => void;
}> = ({ roomId, onClose }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const room = useAppSelector((state) => selectDmRoom(state, roomId));

  const [busy, setBusy] = useState(false);

  const nicknames = useMemo(() => room?.nicknames ?? {}, [room?.nicknames]);

  const isCreator = Boolean(room?.creator_id && room.creator_id === me);

  const memberIds = useMemo(
    () =>
      [me, ...(room?.accounts ?? []).map((account) => account.id)].filter(
        (id): id is string => Boolean(id),
      ),
    [room?.accounts],
  );

  const handleAdd = useCallback(() => {
    dispatch(
      openModal({
        modalType: 'DM_RECIPIENT',
        modalProps: { inviteToRoomId: roomId, excludeIds: memberIds },
      }),
    );
  }, [dispatch, memberIds, roomId]);

  const handleEditNickname = useCallback(
    (accountId: string, name: string) => {
      const current = nicknames[accountId] ?? '';
      const label = intl.formatMessage(messages.nicknamePrompt, { name });

      const next = window.prompt(label, current);

      if (next === null) return;

      setBusy(true);
      void (
        dispatch(
          setDmRoomNickname({ roomId, accountId, nickname: next }),
        ) as unknown as Promise<unknown>
      ).then(() => {
        setBusy(false);
        return null;
      });
    },
    [dispatch, intl, nicknames, roomId],
  );

  const handleRemove = useCallback(
    (accountId: string, name: string) => {
      dispatch(
        openModal({
          modalType: 'CONFIRM',
          modalProps: {
            title: intl.formatMessage(messages.confirmRemoveTitle, { name }),
            message: intl.formatMessage(messages.confirmRemoveMessage),
            confirm: intl.formatMessage(messages.confirmRemoveConfirm),
            dangerous: true,
            onConfirm: () => {
              setBusy(true);
              void (
                dispatch(
                  removeDmRoomMember({ roomId, accountId }),
                ) as unknown as Promise<unknown>
              ).then(() => {
                setBusy(false);
                return null;
              });
            },
          },
        }),
      );
    },
    [dispatch, intl, roomId],
  );

  return (
    <div className='modal-root__modal dialog-modal dm-members'>
      <div className='dialog-modal__header'>
        <span className='dialog-modal__header__title'>
          <FormattedMessage
            id='messages.members.title'
            defaultMessage='Members'
          />
        </span>

        <IconButton
          className='dialog-modal__header__close'
          title={intl.formatMessage(messages.close)}
          icon='times'
          iconComponent={CloseIcon}
          onClick={onClose}
        />
      </div>

      <div className='dialog-modal__content dm-members__content'>
        <p className='dm-members__count'>
          <FormattedMessage
            id='messages.members.count'
            defaultMessage='{count, plural, other {# members}}'
            values={{ count: memberIds.length }}
          />
        </p>

        <button
          type='button'
          className='dm-members__add'
          disabled={busy}
          onClick={handleAdd}
        >
          <span className='dm-members__add__icon'>
            <Icon id='user-plus' icon={PersonAddIcon} />
          </span>

          <FormattedMessage id='messages.members.add' defaultMessage='Add people' />
        </button>

        <div className='dm-members__list'>
          {memberIds.map((accountId) => (
            <MemberRow
              key={accountId}
              roomId={roomId}
              accountId={accountId}
              nickname={nicknames[accountId]}
              canRemove={isCreator && accountId !== me}
              busy={busy}
              onEditNickname={handleEditNickname}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default DmMemberModal;
