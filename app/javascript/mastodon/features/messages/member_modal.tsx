// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   멤버 관리. 초대 · 별명 · 내보내기.
//   근거: 2026-08-12 결정, 마이그레이션 20260812100000·20260812100100
//
//   **방을 유지하고 참여자 조합만 바꾼다.** 서버가 `participant_key` 를 다시
//   계산해 같은 행에 쓰므로 방 id 도 URL 도 이력도 그대로다. 새로 들어온 사람은
//   들어오기 전 메시지를 볼 수 없다 — 따로 막은 것이 아니라, 옛 글에 그 사람이
//   멘션되어 있지 않아 저절로 그렇게 된다.
//
//   권한이 셋으로 갈린다.
//
//     초대     멤버 누구나
//     내보내기 **방장만**. 누구나 할 수 있으면 말다툼이 곧 강퇴가 된다.
//              `creator_id` 가 null 인 옛 방에서는 아무도 못 한다
//     별명     누구나. 지정한 본인에게만 보이는 값이라 방에 알리지 않는다
//
//   초대는 새 사람을 **검색해서** 고른다. 그 검색·선택 UI 는 이미
//   `recipient_modal.tsx` 에 있으므로 다시 만들지 않고, "멤버 추가하기" 를
//   누르면 그 모달을 초대 모드로 연다.

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
  // 이름을 함께 넘긴다. 별명 입력창의 문구가 "@계정id" 가 아니라 사람 이름이어야
  // 누구에게 붙이는지 알 수 있다.
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

  // 1대1 방을 찾거나 만들어 그리로 간다. `find_or_create` 라 이미 있으면 그 방이
  // 열린다 — 같은 사람과의 대화가 새로 쪼개지지 않는다.
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

    // 1대1 로 말 거는 경로. 이미 그 방이 있으면 서버가 그 방을 돌려주므로
    // (find_or_create) 대화가 새로 쪼개지지 않는다.
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
        {/* 별명이 있으면 그것을 앞세우고 본래 이름을 뒤에 작게 남긴다. 본래
            이름을 지우면 별명을 붙여 놓고 누구인지 잊었을 때 알 방법이 없다. */}
        <span className='dm-members__row__name'>{nickname ?? name}</span>

        <span className='dm-members__row__handle'>
          {nickname ? `${name} · @${account.acct}` : `@${account.acct}`}
        </span>
      </span>

      {/* 내 줄에도 메뉴가 붙는다. 별명은 남에게만 다는 것 같지만, 방장이
          아닌 사람에게는 "내보내기" 가 없어 메뉴가 비지 않는다. */}
      <Dropdown
        items={items}
        // 이 모달은 `.modal-root`(z-index 9998) 안에 있는데 메뉴는 body 로
        // 포탈된다. 아무 것도 안 걸면 메뉴가 **모달 뒤로** 깔려 눌리지 않는다.
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

  // 스토어에서 직접 읽는다. 초대·내보내기·별명이 전부 방을 갱신하므로, prop 으로
  // 받아두면 모달이 자기가 일으킨 변화를 못 본다.
  const room = useAppSelector((state) => selectDmRoom(state, roomId));

  const [busy, setBusy] = useState(false);

  // `useMemo` 로 감싼다. 매 렌더마다 새 `{}` 를 만들면 아래 useCallback 의 의존성이
  // 늘 바뀌어, 별명 핸들러가 렌더마다 새로 만들어지고 Dropdown 이 다시 그려진다.
  const nicknames = useMemo(() => room?.nicknames ?? {}, [room?.nicknames]);

  // 방장만 내보낼 수 있다. `creator_id` 가 null 인 옛 방에서는 아무도 못 한다 —
  // 모르는 것을 아무에게나 주지 않는다.
  const isCreator = Boolean(room?.creator_id && room.creator_id === me);

  // `me` 는 로그인하지 않았으면 undefined 다. 이 화면은 로그인 뒤에만 열리지만
  // 타입에는 그것이 적혀 있지 않으므로 여기서 걸러 낸다.
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
        // 이미 방에 있는 사람은 기본 목록(팔로잉)에서 뺀다. 서버는 조용히
        // 건너뛰지만, 목록에 남아 있으면 눌러도 아무 일이 없는 줄이 된다.
        modalProps: { inviteToRoomId: roomId, excludeIds: memberIds },
      }),
    );
  }, [dispatch, memberIds, roomId]);

  // `prompt` 를 쓴다. 별명 하나를 받자고 전용 모달을 하나 더 만들면, 그 모달이
  // 이 모달 위에 겹쳐 열려야 하는데 상류의 모달 스택은 한 번에 하나다.
  const handleEditNickname = useCallback(
    (accountId: string, name: string) => {
      const current = nicknames[accountId] ?? '';
      const label = intl.formatMessage(messages.nicknamePrompt, { name });

      const next = window.prompt(label, current);

      // 취소(null)와 빈 문자열은 다르다. 빈 문자열은 "지우기" 다.
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

  // 나를 포함한 전원. 서버의 `accounts` 는 나를 뺀 목록이라 앞에 붙인다 —
  // 내 별명을 내가 못 보는 것이 이상하고, 인원수도 화면과 맞아야 한다.

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
              // 나 자신은 이 경로로 뺄 수 없다. 그것은 "대화 나가기" 이고,
              // 그쪽은 목록에서만 감춰 새 메시지가 오면 되돌아온다.
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
