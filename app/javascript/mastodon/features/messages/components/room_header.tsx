// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방 헤더. 한 줄이다.
//   근거: dm-chat-phase-2.md §4.1, 기획서 §4.3.1
//
//   두 줄(돌아가기 한 줄 + 아바타·나가기 한 줄)이었던 것을 합쳤다. 대화방은 세로가
//   곧 읽을 수 있는 메시지 수라, 헤더 한 줄이 그대로 손해다.
//
//   **나가기를 헤더에서 뺐다.** 되돌릴 수 없는 동작은 아니지만(숨김이고 새 메시지가
//   오면 돌아온다) 오조작하기 쉬운 자리에 그냥 놓여 있었다. 더보기 메뉴 안으로
//   넣고 빨간색으로 표시한다.
//
//   뒤로 가기도 조건부다. 3열에서는 목록이 늘 옆에 있어 돌아갈 곳이 없다. 좁은
//   화면에서만 보이도록 CSS 로 감춘다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { Link } from 'react-router-dom';

import ArrowBackIcon from '@/material-icons/400-24px/arrow_back.svg?react';
import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import { setDmRoomTitle } from 'mastodon/actions/dm_rooms';
import { openModal } from 'mastodon/actions/modal';
import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { Icon } from 'mastodon/components/icon';
import type { MenuItem } from 'mastodon/models/dropdown_menu';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { selectMessageAccount } from '../selectors';

import { RoomAvatar } from './room_avatar';

const messages = defineMessages({
  back: { id: 'column_back_button.label', defaultMessage: 'Back' },
  leave: { id: 'messages.leave', defaultMessage: 'Leave conversation' },
  more: { id: 'status.more', defaultMessage: 'More' },
  viewProfile: {
    id: 'messages.intro.view_profile',
    defaultMessage: 'View profile',
  },
  editTitle: {
    id: 'messages.title.edit',
    defaultMessage: 'Change conversation title',
  },
  members: {
    id: 'messages.members.manage',
    defaultMessage: 'Manage members',
  },
  titlePlaceholder: {
    id: 'messages.title.placeholder',
    defaultMessage: 'Conversation title',
  },
});

interface Props {
  room?: ApiDmRoomJSON;
  onLeave: () => void;
}

export const RoomHeader: React.FC<Props> = ({ room, onLeave }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const otherId = room?.accounts[0]?.id;
  const account = useAppSelector((state) =>
    selectMessageAccount(state, otherId),
  );

  const memberIds = useMemo(
    () => room?.accounts.map((entry) => entry.id) ?? [],
    [room?.accounts],
  );

  // 제목 편집. 인라인으로 바뀐다 — 모달을 띄우면 방이 가려져, 무엇에 이름을
  // 붙이는지 보이지 않는다.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const roomId = room?.id;

  // 방을 옮기면 편집을 닫는다. 남겨두면 **이전 방의 제목이 새 방 입력칸에**
  // 남는다 — Phase 3 의 초안 문제(A-16)와 같은 형태다.
  useEffect(() => {
    setEditing(false);
  }, [roomId]);

  useEffect(() => {
    if (editing) titleInput.current?.focus();
  }, [editing]);

  // 멤버 관리 모달. 방 id 만 넘긴다 — 모달이 스토어에서 방을 직접 읽어야
  // 자기가 일으킨 변화(초대·별명·내보내기)를 곧바로 반영한다.
  const handleOpenMembers = useCallback(() => {
    if (!roomId) return;

    dispatch(
      openModal({ modalType: 'DM_MEMBERS', modalProps: { roomId } }),
    );
  }, [dispatch, roomId]);

  const handleStartEdit = useCallback(() => {
    setDraft(room?.title ?? '');
    committedRef.current = false;
    setEditing(true);
  }, [room?.title]);

  // Enter 로 저장하면 입력칸이 사라지면서 blur 도 함께 난다. 둘 다 저장이라
  // **같은 값으로 두 번 요청이 나간다.** 첫 응답이 오기 전이면 서버 쪽 "바뀌었을
  // 때만" 판정도 통과해 안내문이 두 번 남을 수 있다. 한 번만 나가게 잠근다.
  const committedRef = useRef(false);

  const handleCommit = useCallback(() => {
    if (committedRef.current) return;

    committedRef.current = true;
    setEditing(false);

    if (!roomId) return;

    const next = draft.trim();

    // 바뀌지 않았으면 요청하지 않는다. 서버도 같은 값이면 아무 일을 하지 않지만,
    // 왕복 한 번과 그 사이의 깜빡임이 남는다.
    if (next === (room?.title ?? '')) return;

    void dispatch(setDmRoomTitle({ roomId, title: next }));
  }, [dispatch, draft, room?.title, roomId]);

  const handleTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // 조합 중 Enter 는 한글을 확정하는 키다. 가로채면 마지막 글자가 확정되기
      // 전에 저장된다 — 이 프로젝트가 반복해서 밟은 함정이다.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      if (event.which === 229 || event.nativeEvent.isComposing) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        handleCommit();
        return;
      }

      // Esc 는 버리고 닫는다. blur 가 저장이므로 취소 경로가 따로 있어야 한다.
      if (event.key === 'Escape') {
        event.preventDefault();
        committedRef.current = true;
        setEditing(false);
      }
    },
    [handleCommit],
  );

  const handleDraftChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(event.target.value);
    },
    [],
  );

  const handleLeave = useCallback(() => {
    onLeave();
  }, [onLeave]);

  const title =
    room?.title ??
    room?.accounts.map((entry) => entry.display_name || entry.username).join(', ');

  const items = useMemo(() => {
    const menu: MenuItem[] = [];

    if (account && !room?.is_group) {
      menu.push({
        text: intl.formatMessage(messages.viewProfile),
        to: `/@${account.acct}`,
      });
      menu.push(null);
    }

    // 멤버 관리. 그룹에만 둔다 — 1대1 에는 초대할 자리도 내보낼 사람도 없다.
    // (1대1 에 사람을 더하는 것은 이 방을 그룹으로 바꾸는 일인데, 그러면 상대가
    // 모르는 사이에 둘만의 대화가 여럿의 대화가 된다.)
    if (roomId && room.is_group) {
      menu.push({
        text: intl.formatMessage(messages.members),
        action: handleOpenMembers,
      });
      menu.push(null);
    }

    // 제목 바꾸기. **그룹에 둔다** — 1대1 방의 이름은 상대의 이름이고, 거기에
    // 내가 붙인 별칭이 뜨면 누구와의 대화인지 알 수 없게 된다. 그리고 그 제목은
    // 상대에게도 보인다(방 단위 값이라 내 것만 바꿀 수 없다).
    //
    // **제목이 이미 있으면 1대1 에서도 연다.** API 는 방 종류를 가리지 않으므로
    // 외부 클라이언트가 1대1 방에 제목을 붙일 수 있는데, 그때 지울 방법이 없으면
    // 상대의 이름이 영영 가려진다.
    if (room?.is_group || room?.title) {
      menu.push({
        text: intl.formatMessage(messages.editTitle),
        action: handleStartEdit,
      });
      menu.push(null);
    }

    menu.push({
      text: intl.formatMessage(messages.leave),
      action: handleLeave,
      dangerous: true,
    });

    return menu;
  }, [
    account,
    handleLeave,
    handleOpenMembers,
    handleStartEdit,
    intl,
    room?.is_group,
    room?.title,
    roomId,
  ]);

  return (
    <div className='dm-room-header'>
      {/* 3열에서는 목록이 늘 옆에 있어 돌아갈 곳이 없다. 좁은 화면에서만 보인다.
          상류의 ColumnBackButton 을 쓰지 않는다 — 그것은 ButtonInTabsBar 로
          감싸여 단일 칼럼에서 탭바로 **포털**되므로, 여기 있는 것처럼 보이지만
          실제로는 셸 바깥 위쪽에 전폭 바로 붙고 이 자리는 빈 채로 남는다.
          그러면 감추는 CSS 도 통하지 않는다.
          돌아갈 곳은 history 가 아니라 목록이다 — 방을 URL 로 바로 열었을 때
          goBack() 은 앱 밖으로 나간다. */}
      {/* 화살표만 남긴다. "돌아가기" 글자는 화살표가 이미 말하는 것을 한 번 더
          말할 뿐이고, 그만큼 헤더의 가로를 먹는다.
          **글자를 지우되 이름은 남긴다.** `aria-label` 이 없으면 스크린 리더에는
          목적지 없는 링크로만 읽혀 어디로 가는 링크인지 알 수 없다. */}
      <Link
        className='dm-room-header__back'
        to='/messages'
        aria-label={intl.formatMessage(messages.back)}
        title={intl.formatMessage(messages.back)}
      >
        <Icon id='chevron-left' icon={ArrowBackIcon} />
      </Link>

      <div className='dm-room-header__identity'>
        {/* 그룹이면 합성 아바타다. 예전에는 `accounts[0]` 하나만 그려, 세 명
            중 한 명의 얼굴만 나왔다. */}
        <RoomAvatar accountIds={memberIds} size={40} />

        <div className='dm-room-header__names'>
          {/* 편집 중에는 제목 자리가 입력칸으로 바뀐다. 모달을 띄우지 않는 이유는
              방이 가려지면 무엇에 이름을 붙이는지 보이지 않기 때문이다.
              Enter 저장 · Esc 취소 · 포커스가 떠나면 저장. blur 저장이라 취소
              경로(Esc)가 반드시 있어야 한다. */}
          {editing ? (
            <input
              ref={titleInput}
              type='text'
              className='dm-room-header__title-input'
              value={draft}
              maxLength={100}
              placeholder={intl.formatMessage(messages.titlePlaceholder)}
              aria-label={intl.formatMessage(messages.editTitle)}
              onChange={handleDraftChange}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleCommit}
            />
          ) : account && !room?.is_group ? (
            <Link to={`/@${account.acct}`} className='dm-room-header__title'>
              {title}
            </Link>
          ) : (
            <span className='dm-room-header__title'>{title}</span>
          )}

          {room?.is_group && (
            <span className='dm-room-header__subtitle'>
              <FormattedMessage
                id='messages.member_count'
                defaultMessage='{count} people'
                values={{ count: room.accounts.length + 1 }}
              />
            </span>
          )}
        </div>
      </div>

      <Dropdown
        items={items}
        icon='ellipsis-h'
        iconComponent={MoreHorizIcon}
        title={intl.formatMessage(messages.more)}
      />
    </div>
  );
};
