// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   대화방. /messages/:roomId
//   근거: dm-chat-phase-2.md §4, dm-chat-phase-3.md §2~§6, 기획서 §4.3·§4.5
//
//   **이 파일에서 가장 조심할 것은 스크롤이다** (기획서 §10.1 이 결함 1순위로
//   꼽는다). 규칙은 셋으로 갈린다.
//
//     진입      안 읽은 것이 있으면 구분선이 상단 조금 아래, 없으면 맨 아래
//     새 메시지 하단 근처면 따라 내려가고, 위에 있으면 알약 버튼만
//     과거 로딩 붙이기 전후의 높이 차이만큼 되밀어 **보던 자리를 지킨다**
//
//   보정은 전부 useLayoutEffect 에서 한다. useEffect 로 하면 페인트 뒤에 실행되어
//   화면이 한 번 튄다.

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { Helmet } from 'react-helmet';
import { Redirect, useHistory, useParams } from 'react-router-dom';

import type { List as ImmutableList, Map as ImmutableMap } from 'immutable';

import ExpandMoreIcon from '@/material-icons/400-24px/expand_more.svg?react';
import { saveDmDraft } from 'mastodon/actions/dm_drafts';
import {
  discardDmMessage,
  editDmMessage,
  fetchDmRoom,
  fetchDmRoomStatuses,
  markDmRoomRead,
  redraftDmMessage,
  sendDmMessage,
  setActiveDmRoom,
} from 'mastodon/actions/dm_rooms';
import { apiGetDmMessageSource } from 'mastodon/api/dm_rooms';
import { Icon } from 'mastodon/components/icon';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import { dmChatEnabled, me, reduceMotion } from 'mastodon/initial_state';
import type { Status } from 'mastodon/models/status';
import type { PendingDmMessage } from 'mastodon/reducers/dm_messages';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { Composer } from './components/composer';
import { DateDivider } from './components/date_divider';
import { MessageBubble } from './components/message_bubble';
import { PendingBubble } from './components/pending_bubble';
import { RoomHeader } from './components/room_header';
import { RoomIntro } from './components/room_intro';
import { SystemNotice } from './components/system_notice';
// @_longwhile — 구분선을 잠시 끄면서 같이 주석 처리한다. 파일 아래쪽
//   `unreadDividerId` 를 쓰는 자리의 주석을 참고할 것. 컴포넌트 파일
//   (components/unread_divider.tsx) 은 지우지 않았다.
// import { UnreadDivider } from './components/unread_divider';
import {
  selectDmDrafts,
  selectDmRoom,
  selectDmRooms,
  selectDmRoomMessages,
  selectMaxMediaAttachments,
  selectMessageAccount,
  selectMessageStatuses,
} from './selectors';
import { compareIds } from './util/compare_ids';
import type { GroupableMessage } from './util/group_messages';
import { groupMessages } from './util/group_messages';
import { confirmLeaveRoom } from './util/leave_room';
import { quotesAnotherMessage, replyTargetFor } from './util/reply_target';
import { stripLeadingMentions } from './util/strip_leading_mentions';
import { isSystemEvent } from './util/title_event';
import { useKeyboardInset } from './util/use_keyboard_inset';
import { useUploads } from './util/use_uploads';

// 이만큼 위로 올라가야 "맨 아래로" 버튼을 띄운다. 몇 픽셀 차이로 깜빡이지
// 않도록 한 화면의 절반쯤으로 둔다.
const SCROLL_BUTTON_THRESHOLD = 320;

// 하단에서 이 비율(화면 높이 기준) 안에 있으면 새 메시지를 따라 내려간다.
// (기획서 §4.5.2)
const FOLLOW_RATIO = 0.5;

// 위로 이만큼(화면 높이의 1배) 남았을 때 과거 페이지를 당긴다. (§4.5.3)
const OLDER_TRIGGER_RATIO = 1;

// 맨 아래로 판정할 여유. 브라우저마다 소수점이 남아 정확히 0 이 되지 않는다.
const BOTTOM_EPSILON = 8;

// "여기까지 읽음" 구분선을 화면 상단에서 이만큼 내려 놓는다. 딱 위에 붙이면
// 그 위의 맥락이 하나도 안 보인다.
const UNREAD_TOP_OFFSET = 48;

// 읽음 기록을 묶는 간격. (§5)
const READ_DEBOUNCE_MS = 2000;

// 초안 저장을 묶는 간격. (§4)
const DRAFT_DEBOUNCE_MS = 1000;

const messages = defineMessages({
  title: { id: 'column.messages', defaultMessage: 'Messages' },
  scrollToBottom: {
    id: 'messages.scroll_to_bottom',
    defaultMessage: 'Jump to latest',
  },
  newMessages: {
    id: 'messages.new_messages',
    defaultMessage: '{count, plural, other {# new messages}}',
  },
  received: {
    id: 'messages.received_announcement',
    defaultMessage: 'New message from {name}',
  },
  empty: {
    id: 'messages.room.empty',
    defaultMessage: 'No messages yet. Say something to get started.',
  },
  loadFailed: {
    id: 'messages.room.load_failed',
    defaultMessage: 'Could not load this conversation.',
  },
  editingBanner: {
    id: 'messages.editing.banner',
    defaultMessage: 'Editing a message',
  },
  editingCancel: {
    id: 'messages.editing.cancel',
    defaultMessage: 'Cancel',
  },
  offline: {
    id: 'messages.offline',
    defaultMessage:
      'Connection lost. New messages will not appear until it is back.',
  },
});

interface RoomMessage extends GroupableMessage {
  // 서버에 있는 메시지. 아직 보내는 중인 것에는 없다.
  status?: Status;

  // 낙관적 말풍선. status 와 둘 중 하나만 있다.
  pending?: PendingDmMessage;

  // 방 제목 변경 안내인가 (Phase 5). 말풍선 대신 가운데 정렬 문장으로 그린다.
  isSystemEvent?: boolean;
}

// 동작 줄이기. 사용자 설정과 OS 설정을 모두 본다 — 설정 화면을 모르는 사람도
// OS 쪽은 켜 두는 경우가 많다. (기획서 §4.7)
const prefersInstantScroll = () =>
  Boolean(reduceMotion) ||
  (typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// 멱등성 키. **예측 가능한 값을 쓰면 안 된다** — 순차 값이나 타임스탬프는 다른
// 세션의 키와 겹칠 수 있고, 겹치면 남의 글이 내 전송의 응답으로 돌아온다.
// (기획서 §11.4)
const newIdempotencyKey = () => {
  // randomUUID 는 보안 컨텍스트(https·localhost)에서만 있다. 없는 곳에서는 같은
  // 난수원인 getRandomValues 로 만든다 — 둘 다 암호학적 난수다.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
};

const Room: React.FC = () => {
  const intl = useIntl();
  const history = useHistory();
  const dispatch = useAppDispatch();

  // 셸(index.tsx)의 자식 Route 로 렌더되므로 URL 에서 직접 읽는다.
  const { roomId } = useParams<{ roomId?: string }>();

  // 초안은 방과 함께 든다. 방 id 를 빼고 문자열만 들면, 방을 옮긴 직후의 한
  // 프레임 동안 **이전 방의 글이 새 방 입력창에 보인다.** 그 상태에서 보내면
  // 다른 사람에게 간다 — 서버가 막아주지 못한다(전용 전송 엔드포인트 없이
  // POST /api/v1/statuses 를 쓰므로 어느 방인지는 전부 클라이언트 판단이다).
  const [draft, setDraft] = useState<{ roomId?: string; text: string }>({
    text: '',
  });

  const draftText = draft.roomId === roomId ? draft.text : '';

  // 방에 들어온 순간의 읽음 상태. 커서(last_read_status_id)와 안 읽은 수를 함께
  // 잡는다. 커서만 보면 안 되는 이유가 있다 — 기존 /conversations 에서 이미 읽은
  // 사용자는 커서가 null 인데 서버는 unread_count 를 0 으로 준다(ADR-005 화해).
  // 커서가 null 이라고 "한 번도 읽지 않음" 으로 단정하면, 다 읽은 대화 맨 위에
  // 구분선이 뜬다. 이 기능이 켜지기 전부터 쓰던 사람 전원이 그 경우다.
  const [readSnapshot, setReadSnapshot] = useState<
    { lastReadId: string | null; hadUnread: boolean } | undefined
  >(undefined);

  // 수정 중인 메시지. 있으면 입력창이 편집 모드가 된다. (컨텍스트 메뉴의 "수정")
  //
  // 초안과 같은 이유로 **방 id 를 함께 든다.** 방을 옮긴 직후의 한 프레임 동안
  // 이전 방의 편집 상태가 남으면, 그 방의 입력창에서 저 방의 글이 고쳐진다.
  //
  // mediaIds 는 수정 시점에 붙어 있던 첨부다. 그대로 다시 보내야 한다 — 빼고
  // 보내면 서버가 첨부를 뗀다(글자만 고쳤는데 사진이 사라진다).
  const [editing, setEditing] = useState<
    { roomId: string; statusId: string; mediaIds: string[] } | undefined
  >(undefined);

  const editingMessage = editing?.roomId === roomId ? editing : undefined;

  const room = useAppSelector((state) => selectDmRoom(state, roomId));
  const messageState = useAppSelector((state) =>
    selectDmRoomMessages(state, roomId),
  );
  const statusesById = useAppSelector(selectMessageStatuses);
  const drafts = useAppSelector(selectDmDrafts);

  // 실시간 수신이 끊겼는지. 끊긴 채로 두면 상대가 답을 안 하는 것처럼 보인다. (§7)
  const streamConnected = useAppSelector(
    (state) => selectDmRooms(state).streamConnected,
  );

  // 초안 복원은 방을 옮길 때 **한 번만** 읽는다. 의존성으로 넣으면 다른 방의
  // 초안이 저장될 때마다 이 방 입력창이 되감긴다.
  const draftsRef = useRef(drafts);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // 가상 키보드가 가린 높이. 데스크톱에서는 항상 0 이다.
  const keyboardInset = useKeyboardInset();

  const maxAttachments = useAppSelector(selectMaxMediaAttachments);
  const uploads = useUploads(maxAttachments);

  // 초기화 이펙트가 최신 uploads 를 잡되, uploads 가 바뀔 때마다 초기화가 다시
  // 돌지는 않게 한다. 의존성에 uploads 를 넣으면 첨부를 붙이는 순간 초기화된다.
  const uploadsRef = useRef(uploads);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  const scrollArea = useRef<HTMLDivElement>(null);

  // 하단 근처인지. 새 메시지를 따라갈지 정한다. 렌더와 무관하므로 ref 다 —
  // state 로 두면 스크롤 한 번에 리렌더가 수십 번 일어난다.
  const atBottomRef = useRef(true);

  // 진입 배치를 마쳤는지. 이걸 하기 전에는 따라가기 로직이 돌면 안 된다.
  const placedRef = useRef(false);

  // 과거 페이지를 붙이기 직전의 높이. 붙인 뒤 그만큼 되민다.
  const restoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(
    null,
  );
  const loadingOlderRef = useRef(false);

  // 마지막으로 화면에 있던 메시지. 새로 붙은 것만 골라내는 기준이다.
  const lastRenderedIdRef = useRef<string | undefined>(undefined);

  // 가장 위에 있던 메시지. **앞에 붙었는지**를 이것으로 판정한다. entries 는
  // 공용 statuses 스토어를 물고 있어 DM 과 무관한 글 하나가 들어와도 새 배열이
  // 되므로, 배열이 바뀌었다는 사실만으로는 과거 페이지가 붙었는지 알 수 없다.
  const firstRenderedIdRef = useRef<string | undefined>(undefined);

  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);

  // 스크린 리더용 알림. 목록 전체에 aria-live 를 걸지 않는 이유는 방을 열 때마다
  // 대화 전체가 낭독되기 때문이다. 도착한 것만 여기서 알린다. (§6)
  const [announcement, setAnnouncement] = useState('');

  const readTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pendingReadRef = useRef(false);
  const latestStatusIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!roomId) return;

    void dispatch(fetchDmRoom({ roomId }));
    void dispatch(fetchDmRoomStatuses({ roomId }));
  }, [dispatch, roomId]);

  // 메시지가 목록에서 빠지면(모두에게서 삭제 · 지우고 다시 쓰기 · 다른 기기에서
  // 삭제) 방을 다시 읽는다. 지운 글이 루트였으면 서버는 루트를 바꿨는데, 화면이
  // 옛 root_status_id 를 들고 있으면 다음 메시지를 지워진 글이나 남의 스레드에
  // 단다 — 지우고 다시 보내도 같은 오류가 나던 것이 이것이다.
  const statusIds = messageState?.statusIds;
  const previousStatusIdsRef = useRef<
    { roomId: string; ids: string[] } | undefined
  >(undefined);

  useEffect(() => {
    const previous = previousStatusIdsRef.current;

    previousStatusIdsRef.current =
      roomId && statusIds ? { roomId, ids: statusIds } : undefined;

    if (!roomId || !statusIds || previous?.roomId !== roomId) return;

    const current = new Set(statusIds);

    if (previous.ids.some((id) => !current.has(id))) {
      void dispatch(fetchDmRoom({ roomId }));
    }
  }, [dispatch, roomId, statusIds]);

  // 열려 있는 방을 스토어에 알린다. 스트림 처리기가 **어느 방을 다시 읽을지**
  // 이 값으로 판단한다 (dm-chat-phase-3.md §1.2 의 C 안).
  useEffect(() => {
    dispatch(setActiveDmRoom({ roomId }));

    return () => {
      dispatch(setActiveDmRoom({ roomId: undefined }));
    };
  }, [dispatch, roomId]);

  // 방을 옮기면 화면에 남아 있던 것을 전부 되돌린다.
  //
  // 3열 레이아웃에서는 목록이 늘 옆에 있어 **방에서 방으로 바로 가는 것이 기본
  // 경로**다. 그때 이 컴포넌트는 언마운트되지 않고 roomId 만 바뀐다.
  useEffect(() => {
    setReadSnapshot(undefined);
    setIsScrolledUp(false);
    setNewMessageCount(0);
    setAnnouncement('');
    uploadsRef.current.reset();

    // 초안은 지우지 않고 **그 방의 것으로 갈아 끼운다.** (§4)
    setDraft({ roomId, text: roomId ? (draftsRef.current[roomId] ?? '') : '' });

    // 편집 모드는 방을 넘기지 않는다. 초안과 달리 보관할 값이 아니다 — 돌아왔을
    // 때 그 글이 이미 지워졌을 수도 있다.
    setEditing(undefined);

    placedRef.current = false;
    restoreRef.current = null;
    loadingOlderRef.current = false;
    lastRenderedIdRef.current = undefined;
    firstRenderedIdRef.current = undefined;
    atBottomRef.current = true;

    if (readTimerRef.current) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = undefined;
    }
    pendingReadRef.current = false;
  }, [roomId]);

  // 방을 열자마자 읽음으로 기록되므로(아래 markDmRoomRead), 서버 값을 계속 따라가면
  // 구분선이 그려지자마자 사라진다. 처음 받은 값만 잡아 둔다.
  useEffect(() => {
    if (!room) return;

    setReadSnapshot(
      (current) =>
        current ?? {
          lastReadId: room.last_read_status_id,
          hadUnread: room.unread_count > 0,
        },
    );
  }, [room]);

  // 방을 열면 읽음으로 기록한다. 이게 없으면 읽지 않음 배지가 영원히 남는다.
  const lastStatusId = room?.last_status?.id;

  useEffect(() => {
    if (!roomId || !lastStatusId) return;

    void dispatch(markDmRoomRead({ roomId, statusId: lastStatusId }));
  }, [dispatch, roomId, lastStatusId]);

  // 본문 앞의 수신자 핸들을 지우는 기준. 방 참여자의 프로필 URL 이다.
  //
  // **내 URL 을 반드시 함께 넣는다.** 서버가 주는 room.accounts 는
  // other_accounts, 즉 나를 뺀 목록이다(REST::DmRoomSerializer#other_accounts).
  // 나를 빼면 상대가 보낸 메시지 앞의 `@내핸들` 이 안 지워진다. 답장에는
  // StatusContent 안의 자동 처리가 걸려 화면에서는 사라지지만, 방의 첫 메시지는
  // 답장이 아니라 그것도 안 걸려 화면에 그대로 남고, 복사하면 어느 경우든 딸려온다.
  const myAccount = useAppSelector((state) => selectMessageAccount(state, me));

  // 대화 시작 지점의 프로필 블록에 쓸 상대. 1대1 만 이 화면으로 열리므로
  // accounts 의 첫 번째가 곧 상대다.
  const otherAccount = useAppSelector((state) =>
    selectMessageAccount(state, room?.accounts[0]?.id),
  );

  const memberUrls = useMemo(
    () =>
      new Set(
        [...(room?.accounts ?? []).map((account) => account.url), myAccount?.url]
          .filter((url): url is string => Boolean(url)),
      ),
    [room?.accounts, myAccount?.url],
  );

  // 전송 시 본문 앞에 붙는 핸들의 길이. 카운터가 이것까지 세야 서버 제한과 맞는다.
  const mentionPrefixLength = useMemo(() => {
    const accounts = room?.accounts ?? [];

    if (accounts.length === 0) return 0;

    return accounts.map((account) => `@${account.acct}`).join(' ').length + 1;
  }, [room?.accounts]);

  const handleLeave = useCallback(() => {
    if (!roomId) return;

    confirmLeaveRoom(dispatch, intl, roomId, () => {
      history.push('/messages');
    });
  }, [dispatch, history, intl, roomId]);

  // 묶기는 전체 목록에 대한 순수 함수로 한 번에 계산한다. 부분 갱신을 하지 않는
  // 이유는 과거 페이지를 붙일 때의 스크롤 보정과 짝을 이루기 때문이다. (§6.4)
  const entries = useMemo<RoomMessage[]>(() => {
    const ids = messageState?.statusIds ?? [];

    return ids
      .map((id: string) => statusesById.get(id))
      .filter((status): status is Status => Boolean(status))
      .map((status, index, statuses) => {
        // 루트나 바로 앞 메시지에 단 답장은 인용이 아니다 — 이어서 말한 것이다.
        // (reply_target.ts)
        //
        // 방 정보가 아직 없으면 판단을 미룬다. undefined 와 비교해 전부 인용으로
        // 잡으면 첫 페인트에서 묶기가 통째로 풀렸다가 방이 도착할 때 다시 접힌다.
        const quotes =
          room !== undefined &&
          quotesAnotherMessage({
            inReplyToId: status.get('in_reply_to_id') as string | null,
            rootStatusId: room.root_status_id,
            previousStatusId: statuses[index - 1]?.get('id') as
              | string
              | undefined,
          });

        // 시스템 안내(제목 변경 · 멤버 변경). 표식은 spoiler_text 에 있다.
        // 덩어리에 섞이지 않게 standalone 으로 표시한다 — 가운데 정렬 문장이
        // 덩어리 한가운데 끼면 위아래 말풍선이 한 덩어리인 채로 갈라진다.
        const systemEvent = isSystemEvent(
          status.get('spoiler_text') as string | undefined,
        );

        return {
          id: status.get('id') as string,
          accountId: status.get('account') as string,
          createdAt: status.get('created_at') as string,
          quotesAnotherMessage: quotes,
          standalone: systemEvent,
          isSystemEvent: systemEvent,
          status,
        };
      });
  }, [messageState?.statusIds, statusesById, room]);

  useEffect(() => {
    latestStatusIdRef.current = entries.at(-1)?.id;
  }, [entries]);

  // 낙관적 말풍선은 **묶기에 함께 넣는다.** 따로 그리면 방금 보낸 메시지만
  // 덩어리에서 떨어져 나와 여백과 모서리가 달라진다.
  const pending = messageState?.pending;

  const renderEntries = useMemo<RoomMessage[]>(() => {
    if (!pending || pending.length === 0) return entries;

    return [
      ...entries,
      ...pending.map((entry) => ({
        id: entry.localId,
        accountId: me ?? '',
        createdAt: entry.createdAt,
        // 보내는 중인 메시지는 늘 그때의 최근 메시지에 단다 — 인용이 아니다.
        quotesAnotherMessage: false,
        pending: entry,
      })),
    ];
  }, [entries, pending]);

  const sections = useMemo(
    () => groupMessages<RoomMessage>(renderEntries),
    [renderEntries],
  );

  // "여기까지 읽음" 을 놓을 자리. 커서보다 뒤에 온 **남의** 메시지 중 첫 번째다.
  // 내가 쓴 것 앞에 두면 내가 보낸 순간 구분선이 내 메시지 위로 올라가 버린다.
  const unreadDividerId = useMemo(() => {
    if (!readSnapshot) return undefined;

    // 들어올 때 안 읽은 것이 없었으면 그을 자리도 없다. 커서가 null 이어도
    // 마찬가지다 — 기존 화면에서 읽은 경우가 정확히 그 모양이다.
    if (!readSnapshot.hadUnread) return undefined;

    const { lastReadId } = readSnapshot;

    return entries.find(
      (entry) =>
        entry.accountId !== me &&
        (lastReadId === null || compareIds(entry.id, lastReadId) > 0),
    )?.id;
  }, [entries, readSnapshot]);


  // 안 읽은 사람 수. (FR-16, docs/dm-chat/phases/dm-chat-phase-4.md §3.3)
  //
  // **내 메시지 전부에 붙는다.** 카카오톡과 같은 방식이다 — 1대1 이면 상대가
  // 읽기 전까지 1 이 떠 있다가 읽으면 사라지고, 3인 방이면 2 → 1 → 없음으로
  // 줄어든다. "읽음" 한 줄보다 정보가 많고, 어느 메시지까지 읽혔는지가 숫자가
  // 사라지는 경계로 그대로 보인다.
  //
  // 세는 대상은 **읽음 표시를 켜 둔 다른 멤버**다. 서버가 그들만 목록에 넣고,
  // 아직 안 읽은 사람은 `last_read_status_id: null` 로 들어온다. 끈 사람은
  // 빠지므로 세지 않는다 — 알 수 없는 것을 "안 읽음" 으로 세면 숫자가 영영
  // 0 이 되지 않는다.
  //
  // 상호주의로 내가 막히면 서버가 빈 배열을 주므로 어디에도 숫자가 안 나온다.
  const readStates = room?.participant_read_states;

  const unreadCountFor = useCallback(
    (messageId: string, authorId: string) => {
      if (!readStates || readStates.length === 0) return 0;

      return readStates.filter((state) => {
        // 내 커서는 서버가 이미 빼고 주지만 여기서도 거른다. 들어오면 나를
        // "안 읽은 사람" 으로 세어 숫자가 하나 더 크게 나온다.
        if (state.account_id === me) return false;

        // **글쓴이는 세지 않는다.** 자기가 쓴 글을 안 읽었다고 할 수 없다.
        //
        // 이 한 줄이 "1대1 에는 숫자를 안 붙인다" 를 자동으로 만든다. 1대1 에서
        // 상대의 메시지를 보면 세는 대상이 {상대} 인데 그가 곧 글쓴이라 빠지고,
        // 남는 것이 없어 0 이 된다. 그룹에서는 나머지 참여자가 남으므로 "누가
        // 여기까지 읽었는지" 가 그대로 보인다. 방 종류로 분기할 필요가 없다.
        if (state.account_id === authorId) return false;

        // 한 번도 안 읽은 사람. 어떤 메시지보다도 뒤에 있다.
        if (state.last_read_status_id === null) return true;

        // 커서가 이 메시지보다 앞이면 아직 못 읽은 것이다. 커서는 "여기까지
        // 읽었다" 이므로 같은 id 는 읽은 쪽이다.
        return compareIds(state.last_read_status_id, messageId) < 0;
      }).length;
    },
    [readStates],
  );

  // 맨 위에 있는 메시지. 과거 페이지가 앞에 붙었는지 판정하는 기준이다.
  const firstEntryId = entries[0]?.id;

  const scrollToBottom = useCallback((smooth: boolean) => {
    const node = scrollArea.current;

    if (!node) return;

    node.scrollTo({
      top: node.scrollHeight,
      behavior: smooth && !prefersInstantScroll() ? 'smooth' : 'auto',
    });
  }, []);

  // 읽음 기록. 2초로 묶고, **백그라운드 탭에서는 기록하지 않는다** — 화면에
  // 있다고 사용자가 보고 있는 것은 아니다. 돌아오면 그때 기록한다. (§5)
  const scheduleRead = useCallback(() => {
    if (!roomId) return;

    if (document.hidden) {
      pendingReadRef.current = true;
      return;
    }

    if (readTimerRef.current) return;

    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = undefined;

      const statusId = latestStatusIdRef.current;

      if (!statusId) return;

      void dispatch(markDmRoomRead({ roomId, statusId }));
    }, READ_DEBOUNCE_MS);
  }, [dispatch, roomId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden || !pendingReadRef.current) return;

      pendingReadRef.current = false;
      scheduleRead();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [scheduleRead]);

  const loadOlder = useCallback(() => {
    const node = scrollArea.current;

    if (!node || !roomId || loadingOlderRef.current) return;
    if (!messageState?.loaded || !messageState.hasMore) return;

    const oldest = messageState.statusIds[0];

    if (!oldest) return;

    loadingOlderRef.current = true;

    // **붙이기 직전의 높이를 여기서 잡는다.** 응답이 온 뒤에 재면 이미 늘어난
    // 값이라 보정이 0 이 된다.
    restoreRef.current = {
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    };

    const request = dispatch(
      fetchDmRoomStatuses({ roomId, maxId: oldest }),
    ) as unknown as Promise<unknown>;

    void request.then(
      (result) => {
        loadingOlderRef.current = false;

        return result;
      },
      () => {
        // 실패하면 보정할 것도 없다. 남겨두면 다음에 붙는 메시지가 엉뚱하게
        // 되밀린다.
        loadingOlderRef.current = false;
        restoreRef.current = null;
      },
    );
  }, [dispatch, messageState, roomId]);

  const handleScroll = useCallback(() => {
    const node = scrollArea.current;

    if (!node) return;

    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;

    atBottomRef.current = distance <= node.clientHeight * FOLLOW_RATIO;
    setIsScrolledUp(distance > SCROLL_BUTTON_THRESHOLD);

    if (distance <= BOTTOM_EPSILON) {
      setNewMessageCount(0);
      scheduleRead();
    }

    if (node.scrollTop < node.clientHeight * OLDER_TRIGGER_RATIO) loadOlder();
  }, [loadOlder, scheduleRead]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom(true);
    atBottomRef.current = true;
    setNewMessageCount(0);
    scheduleRead();
  }, [scheduleRead, scrollToBottom]);

  // ── 진입 위치 (§2.1) ───────────────────────────────────────────────
  //
  // 방과 첫 페이지를 **둘 다** 받은 뒤에 배치한다. readSnapshot 을 기다리는 것이
  // 요점이다 — 그 값이 없으면 구분선 위치를 모르는데, 모른 채로 맨 아래에
  // 붙여두면 안 읽은 메시지가 있어도 그 자리를 영영 못 찾는다.
  useLayoutEffect(() => {
    if (placedRef.current) return;

    const node = scrollArea.current;

    if (!node || !room || !messageState?.loaded || readSnapshot === undefined) {
      return;
    }

    if (unreadDividerId) {
      const target = document.getElementById(`dm-message-${unreadDividerId}`);

      if (target) {
        // offsetTop 을 쓰지 않는다. 스크롤 컨테이너가 offsetParent 라는 보장이
        // 없어, 조상 어딘가에 position 이 붙으면 값이 통째로 어긋난다.
        const targetTop = target.getBoundingClientRect().top;
        const areaTop = node.getBoundingClientRect().top;

        node.scrollTop += targetTop - areaTop - UNREAD_TOP_OFFSET;
        atBottomRef.current = false;
      } else {
        node.scrollTop = node.scrollHeight;
      }
    } else {
      node.scrollTop = node.scrollHeight;
    }

    placedRef.current = true;
    lastRenderedIdRef.current = renderEntries.at(-1)?.id;
    firstRenderedIdRef.current = firstEntryId;

    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;

    setIsScrolledUp(distance > SCROLL_BUTTON_THRESHOLD);
  }, [
    firstEntryId,
    messageState?.loaded,
    readSnapshot,
    renderEntries,
    room,
    unreadDividerId,
  ]);

  // ── 과거 페이지 보정 (§2.3) ────────────────────────────────────────
  //
  // 앞에 붙인 만큼 정확히 되민다. 묶기는 전체 목록 순수 함수라 기존 첫 메시지의
  // 묶임 상태 변화까지 이미 반영된 높이가 나온다(§6.4). **이 계산은 페인트
  // 전에 끝나야 한다** — useEffect 로 옮기면 한 프레임 동안 위로 튄다.
  useLayoutEffect(() => {
    const node = scrollArea.current;
    const restore = restoreRef.current;

    // 맨 위가 그대로면 앞에 붙은 것이 없다. 여기서 그냥 보정하면, 요청을
    // 기다리는 사이에 들어온 **다른** 갱신에 보정이 걸려 화면이 위로 튄다.
    if (!node || !restore || firstRenderedIdRef.current === firstEntryId) return;

    firstRenderedIdRef.current = firstEntryId;
    restoreRef.current = null;
    node.scrollTop = node.scrollHeight - restore.scrollHeight + restore.scrollTop;
  }, [firstEntryId]);

  // ── 새 메시지 도착 (§2.2) ──────────────────────────────────────────
  useLayoutEffect(() => {
    if (!placedRef.current) return;

    const lastId = renderEntries.at(-1)?.id;
    const previous = lastRenderedIdRef.current;

    if (!lastId || lastId === previous) return;

    const previousIndex = previous
      ? renderEntries.findIndex((entry) => entry.id === previous)
      : -1;

    lastRenderedIdRef.current = lastId;

    // 기준으로 삼던 메시지가 사라졌다. 둘 중 하나다 — 전송이 끝나 낙관적
    // 말풍선이 진짜 메시지로 바뀌었거나, 그 메시지가 삭제됐다. 무엇이 새것인지는
    // 알 수 없으므로 세지도, 알리지도 않는다. 다만 **하단에 있었으면 하단에
    // 남아야 한다** — 사진처럼 진짜 메시지가 낙관적 말풍선보다 훨씬 높은 경우가
    // 있어서, 여기서 놓치면 방금 보낸 것이 화면 밖으로 밀린다.
    if (previous && previousIndex === -1) {
      // 애니메이션을 쓰지 않는다. 말풍선이 바뀌는 순간이라 부드럽게 움직이면
      // 오히려 흔들려 보인다.
      if (atBottomRef.current) scrollToBottom(false);

      return;
    }

    const appended = renderEntries.slice(previousIndex + 1);
    const mine = appended.some((entry) => entry.accountId === me);
    const others = appended.filter((entry) => entry.accountId !== me);

    // **내가 보낸 것은 위치와 무관하게 따라 내려간다.** (§2.2)
    if (mine || atBottomRef.current) {
      scrollToBottom(true);
      atBottomRef.current = true;
      setNewMessageCount(0);
      setIsScrolledUp(false);

      if (others.length > 0) scheduleRead();
    } else if (others.length > 0) {
      setNewMessageCount((count) => count + others.length);
    }

    if (others.length > 0) {
      setAnnouncement(
        intl.formatMessage(messages.received, {
          name: otherAccount?.display_name ?? otherAccount?.username ?? '',
        }),
      );
    }
  }, [renderEntries, intl, otherAccount, scheduleRead, scrollToBottom]);

  // 초안 저장. 입력이 멎고 1초 뒤에 한 번만 쓴다. (§4)
  useEffect(() => {
    if (!roomId || draft.roomId !== roomId) return undefined;

    const timer = setTimeout(() => {
      void dispatch(saveDmDraft({ roomId, text: draft.text }));
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [dispatch, draft, roomId]);

  // 마지막으로 친 초안. 아래 정리자가 읽는다 — 정리자는 그때의 state 가 아니라
  // **가장 최근 값**을 봐야 한다.
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // 화면을 떠나거나 방을 옮길 때 **디바운스를 기다리지 않고 즉시 쓴다.**
  //
  // 위 효과의 정리자는 타이머를 지우기만 한다. 그래서 한 글자 치고 1초 안에
  // 나가면 그 초안이 통째로 날아갔다 — 나갔다 오면 사라져 있던 원인이 이것이다.
  // 여기서 마지막 값을 한 번 더 쓴다. 같은 값을 두 번 써도 해가 없다.
  //
  // 의존성에 `draft` 를 넣으면 안 된다. 넣으면 **글자마다** 정리자가 돌아
  // 디바운스가 통째로 무의미해진다. 그래서 값은 ref 로 읽는다.
  //
  // 저장하는 방은 `roomId` 가 아니라 `draftRef.current.roomId` 다. 방을 옮기는
  // 순간 정리자는 새 roomId 를 갖고 도는데, 그때 손에 든 글은 **떠나는 방의**
  // 것이다. roomId 로 쓰면 방금 연 방에 남의 초안이 붙는다.
  useEffect(() => {
    return () => {
      const pending = draftRef.current;

      if (!pending.roomId) return;

      void dispatch(
        saveDmDraft({ roomId: pending.roomId, text: pending.text }),
      );
    };
  }, [dispatch, roomId]);

  const handleDraftChange = useCallback(
    (text: string) => {
      setDraft({ roomId, text });
    },
    [roomId],
  );

  // ── 컨텍스트 메뉴: 수정 / 지우고 다시 쓰기 ─────────────────────────────
  //
  // 둘 다 **입력창을 건드린다.** 그래서 메뉴가 직접 하지 않고 방이 받는다 —
  // 초안(draft)과 편집 상태(editing)를 들고 있는 곳이 여기뿐이다.
  //
  // 전역 `editStatus` / `deleteStatus(id, true)` 는 쓸 수 없다. 그것들은 툿
  // 작성창에 글을 넣는데, 이 화면은 그 패널을 감춰 두므로 눌러도 보이지 않는
  // 곳에 글이 들어갈 뿐이다.

  const handleEdit = useCallback(
    (statusId: string) => {
      if (!roomId) return;

      const attachments = statusesById
        .get(statusId)
        ?.get('media_attachments') as
        | ImmutableList<ImmutableMap<string, unknown>>
        | undefined;

      const mediaIds =
        attachments?.toArray().map((item) => item.get('id') as string) ?? [];

      // 화면의 HTML 이 아니라 **작성 당시의 원문**을 받아온다. HTML 을 되돌려
      // 만들면 줄바꿈과 이모지 단축코드가 사라진다.
      void apiGetDmMessageSource(statusId)
        .then((source) => {
          setEditing({ roomId, statusId, mediaIds });
          setDraft({ roomId, text: stripLeadingMentions(source.text) });

          return source;
        })
        // 실패하면 편집 모드로 들어가지 않는다. 원문 없이 편집 모드만 켜면
        // 빈 입력창이 뜨고, 그대로 저장하면 메시지가 통째로 비워진다.
        .catch(() => undefined);
    },
    [roomId, statusesById],
  );

  const handleCancelEdit = useCallback(() => {
    if (!roomId) return;

    setEditing(undefined);

    // 편집을 취소하면 입력창도 비운다. 고치던 글이 남아 있으면 그것을 새
    // 메시지로 보내게 된다 — 같은 말이 두 번 있는 방이 만들어진다.
    setDraft({ roomId, text: '' });
    void dispatch(saveDmDraft({ roomId, text: '' }));
  }, [dispatch, roomId]);

  const handleRedraft = useCallback(
    (statusId: string) => {
      if (!roomId) return;

      const request = dispatch(
        redraftDmMessage({ roomId, statusId }),
      ) as unknown as Promise<{
        meta: { requestStatus: string };
        payload?: { roomId: string; text: string };
      }>;

      void request.then((result) => {
        if (result.meta.requestStatus !== 'fulfilled') return result;

        // 지운 뒤에 돌아온 원문을 입력창에 넣는다. **편집 모드가 아니다** —
        // 원본은 이미 없으므로 다음 전송은 새 메시지다.
        const text = stripLeadingMentions(result.payload?.text ?? '');

        setEditing(undefined);
        setDraft({ roomId, text });
        void dispatch(saveDmDraft({ roomId, text }));

        return result;
      });
    },
    [dispatch, roomId],
  );

  // 전송. 방이 무엇이든 이 함수 하나를 거친다 — 첫 전송과 재시도가 같은 경로여야
  // 멱등성 키를 다루는 곳이 하나로 유지된다.
  const send = useCallback(
    (payload: {
      text: string;
      mediaIds: string[];
      inReplyToId?: string;
      localId: string;
      idempotencyKey: string;
      createdAt: string;
    }) => {
      if (!roomId || !room) return;

      const sentFromRoomId = roomId;

      const request = dispatch(
        sendDmMessage({
          roomId,
          text: payload.text,
          inReplyToId: payload.inReplyToId,
          fallbackInReplyToId: room.root_status_id ?? undefined,
          // 공개 범위 선택을 노출하지 않는다. 실수로 공개 글이 나가는 사고를
          // 원천 차단한다. (FR-12)
          recipientAccts: room.accounts.map((account) => account.acct),
          recipientIds: room.accounts.map((account) => account.id),
          mediaIds: payload.mediaIds,
          localId: payload.localId,
          idempotencyKey: payload.idempotencyKey,
          createdAt: payload.createdAt,
        }),
      ) as unknown as Promise<{ meta: { requestStatus: string } }>;

      void request.then((result) => {
        // 실패는 리듀서가 말풍선에 남긴다. 입력창으로 되돌리지 않는다 — 화면과
        // 입력창 양쪽에 같은 글이 있으면 어느 것이 진짜인지 알 수 없다. (§3.3)
        if (result.meta.requestStatus !== 'fulfilled') return result;

        // 첫 메시지였다면 서버가 그것을 방의 루트로 잡는다. 방을 다시 읽어야
        // 다음 메시지가 같은 스레드에 붙는다.
        void dispatch(fetchDmRoom({ roomId: sentFromRoomId }));

        return result;
      });
    },
    [dispatch, room, roomId],
  );

  const pendingCounterRef = useRef(0);

  const handleSubmit = useCallback(() => {
    if (!roomId || !room) return;

    // 아직 올라가는 중인 첨부가 있으면 보내지 않는다. 준비되지 않은 media_id 는
    // 서버가 422 로 거절하고, 그러면 첨부만 사라지고 글은 안 나간다.
    if (uploads.isBusy) return;

    // 끝에 붙은 빈 줄과 공백을 떼고 보낸다.
    //
    //   "안녕\n\n\n"      →  "안녕"        끝의 엔터만 사라진다
    //   "안녕\n\n\n오오"  →  그대로        중간의 엔터는 뜻이 있으므로 건드리지 않는다
    //
    // 채팅에서는 Enter 가 전송이라(PC 뷰, A-17) 줄을 바꾸려다 만 흔적이 끝에
    // 남기 쉽다. 그대로 보내면 말풍선 아래에 이유 없는 빈 자리가 생긴다.
    //
    // **여기서 자른다.** 낙관적 말풍선도 재시도도 이 payload 를 그대로 쓰므로,
    // 화면에 보이는 것과 서버로 간 것이 어긋나지 않는다. API 층에서 자르면
    // 말풍선에는 빈 줄이 남고 서버에는 없는 상태가 된다.
    const text = draftText.trimEnd();

    // 편집 모드면 새 메시지를 보내지 않고 그 글을 고친다.
    //
    // 첨부는 **수정 시점의 것을 그대로** 다시 보낸다. 입력창의 uploads 는 쓰지
    // 않는다 — 편집 중에 새 파일을 붙이는 경로를 열지 않았고, 빈 배열을 보내면
    // 서버가 붙어 있던 첨부를 뗀다.
    //
    // 본문이 비면 저장하지 않는다. 첨부만 남기는 편집은 상류의 PUT 으로도
    // 되지만, 여기서는 "빈 메시지" 를 만드는 실수 쪽이 훨씬 흔하다.
    if (editingMessage) {
      if (text === '') return;

      void dispatch(
        editDmMessage({
          roomId,
          statusId: editingMessage.statusId,
          text,
          recipientAccts: room.accounts.map((account) => account.acct),
          mediaIds: editingMessage.mediaIds,
        }),
      );

      setEditing(undefined);
      setDraft({ roomId, text: '' });
      void dispatch(saveDmDraft({ roomId, text: '' }));

      return;
    }

    const mediaIds = uploads.mediaIds;

    if (text === '' && mediaIds.length === 0) return;

    pendingCounterRef.current += 1;

    send({
      text,
      mediaIds,
      // 방의 최근 메시지에 단다. 불러온 메시지가 없으면 서버가 준 루트(D-03),
      // 그것도 없으면 메시지가 없는 새 방이라 새 스레드를 시작한다.
      // (reply_target.ts)
      inReplyToId: replyTargetFor(
        latestStatusIdRef.current,
        room.root_status_id,
      ),
      localId: `dm-pending-${pendingCounterRef.current}`,
      idempotencyKey: newIdempotencyKey(),
      createdAt: new Date().toISOString(),
    });

    // 입력창은 **즉시** 비운다. 내용은 이제 말풍선이 들고 있다. 비우지 않으면
    // 연달아 보낼 때 같은 글이 두 번 나간다.
    setDraft({ roomId, text: '' });
    void dispatch(saveDmDraft({ roomId, text: '' }));
    uploads.reset();
  }, [dispatch, draftText, editingMessage, room, roomId, send, uploads]);

  const handleRetry = useCallback(
    (localId: string) => {
      const entry = pending?.find((item) => item.localId === localId);

      if (!entry) return;

      send({
        text: entry.text,
        mediaIds: entry.mediaIds ?? [],
        // 실패한 말풍선은 목록 맨 아래에 있으므로 **지금의** 최근 메시지에 단다.
        inReplyToId: replyTargetFor(
          latestStatusIdRef.current,
          room?.root_status_id,
        ),
        localId: entry.localId,
        // **같은 키를 다시 쓴다.** 새 키로 보내면 첫 요청이 사실은 성공했던
        // 경우 같은 메시지가 두 번 나간다. (§3.4)
        idempotencyKey: entry.idempotencyKey,
        createdAt: entry.createdAt,
      });
    },
    [pending, room?.root_status_id, send],
  );

  const handleDiscard = useCallback(
    (localId: string) => {
      if (!roomId) return;

      dispatch(discardDmMessage({ roomId, localId }));
    },
    [dispatch, roomId],
  );

  if (!dmChatEnabled) return <Redirect to='/conversations' />;
  if (!roomId) return null;

  // FR-23 폴백은 Phase 5 에서 걷었다. 그룹 방도 여기서 연다.
  //
  // 무단 합류를 막는 것은 UI 가 아니라 participant_key 다 — 멘션을 더해 보낸
  // 글은 참여자 조합이 달라 **정의상 다른 방**이 되고, 기존 방은 오염되지
  // 않는다(docs/dm-chat/phases/dm-chat-phase-5.md §2.1). 그 구조가 1차부터 있었기 때문에
  // 폴백을 걷는 것이 한 줄이 됐다.

  const isEmpty =
    messageState?.loaded && !messageState.isLoading && sections.length === 0;
  const isLoading = !messageState || messageState.isLoading;

  // Column 을 쓰지 않는다. 그 컴포넌트는 문서 스크롤에 묶이는 칼럼 크롬을
  // 얹는데, 여기서는 셸이 준 높이 안에서 헤더/스크롤/입력창 3단으로 나눠야 한다.
  return (
    <div
      className='dm-room'
      role='region'
      aria-label={intl.formatMessage(messages.title)}
      style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
    >
      <RoomHeader room={room} onLeave={handleLeave} />

      {/* 연결이 끊기면 알린다. 복구되면 스스로 사라진다 — 사용자가 닫을 것이
          아니라 상태를 비추는 줄이다. (§7) */}
      {!streamConnected && (
        <p className='dm-room__offline' role='status'>
          {intl.formatMessage(messages.offline)}
        </p>
      )}

        {/* 목록 자체에 role='log'(= aria-live)을 걸지 않는다. 이 영역은 로딩 중에
            먼저 그려지고 응답이 온 뒤 채워지므로, 걸어두면 방을 열 때마다 대화
            전체가 "새로 추가된 내용" 으로 낭독된다. 도착한 것만 아래 live region
            으로 알린다. (dm-chat-phase-3.md §0.2·§6) */}
        <div
          className='dm-room__scroll'
          ref={scrollArea}
          onScroll={handleScroll}
        >
          {isLoading && sections.length === 0 && <LoadingIndicator />}

          {messageState?.hasError && (
            <p className='dm-room__empty'>
              {intl.formatMessage(messages.loadFailed)}
            </p>
          )}

          {/* 과거 페이지를 다 받았을 때만 그린다. 아직 더 있는데 그리면 "여기가
              대화의 시작" 이라는 거짓말이 된다. */}
          {messageState?.loaded && !messageState.hasMore && (
            <RoomIntro />
          )}

          {isEmpty && !messageState.hasError && (
            <p className='dm-room__empty'>
              {intl.formatMessage(messages.empty)}
            </p>
          )}

          {sections.map((section) => (
            <div key={section.key}>
              <DateDivider date={section.date} />

              {section.groups.map((group) => (
                <div key={group.key} className='dm-room__group'>
                  {group.messages.map((entry) => (
                    <Fragment key={entry.message.id}>
                      {/* @_longwhile — "여기까지 읽음" 구분선을 **잠시 끈다**
                          (2026-08-12). 지우지 않고 주석으로 남긴다.

                          안 읽은 개수가 말풍선마다 숫자로 뜨게 된 뒤로
                          (unreadCountFor) 경계가 이미 보인다. 구분선까지
                          있으면 같은 말을 두 번 하는 셈이다.

                          `unreadDividerId` 자체는 계산도 하고 쓰기도 한다 —
                          위의 useLayoutEffect 가 **첫 안 읽은 메시지로 스크롤을
                          맞추는** 데 그 값을 쓴다. 그건 구분선과 별개로 쓸모가
                          있으니 그대로 둔다. 되살릴 때는 아래 한 줄과 파일 위쪽
                          UnreadDivider import 의 주석을 함께 풀면 된다. */}
                      {/* {entry.message.id === unreadDividerId && <UnreadDivider />} */}

                      {/* 방 제목 변경 안내는 말풍선이 아니라 가운데 정렬
                          문장이다. 누가 보낸 말이 아니라 방에 일어난 일이라,
                          좌우로 치우치면 누군가의 발언으로 읽힌다. */}
                      {entry.message.isSystemEvent ? (
                        <SystemNotice
                          contentHtml={
                            entry.message.status?.get('content') as
                              | string
                              | undefined
                          }
                        />
                      ) : entry.message.pending ? (
                        <PendingBubble
                          pending={entry.message.pending}
                          isFirstInGroup={entry.isFirstInGroup}
                          isLastInGroup={entry.isLastInGroup}
                          isSenderChanged={entry.isSenderChanged}
                          onRetry={handleRetry}
                          onDiscard={handleDiscard}
                        />
                      ) : (
                        entry.message.status && (
                          <MessageBubble
                            status={entry.message.status}
                            memberUrls={memberUrls}
                            isMine={entry.message.accountId === me}
                            isFirstInGroup={entry.isFirstInGroup}
                            isLastInGroup={entry.isLastInGroup}
                            isSenderChanged={entry.isSenderChanged}
                            showTimestamp={entry.showTimestamp}
                            showSenderName={Boolean(room?.is_group)}
                            roomId={roomId}
                            onEdit={handleEdit}
                            onRedraft={handleRedraft}
                            // 내 메시지든 남의 메시지든 붙는다. 글쓴이를 빼고
                            // 세므로 1대1 에서는 남의 메시지가 저절로 0 이 된다.
                            unreadBy={unreadCountFor(
                              entry.message.id,
                              entry.message.accountId,
                            )}
                          />
                        )
                      )}
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 새 메시지 알약 (FR-20). 개수가 있으면 개수를 말하고, 그냥 위로 올라가
            있을 뿐이면 화살표만 둔다. */}
        {newMessageCount > 0 ? (
          <button
            type='button'
            className='dm-room__to-bottom dm-room__to-bottom--pill'
            onClick={handleScrollToBottom}
          >
            <Icon id='chevron-down' icon={ExpandMoreIcon} />
            {intl.formatMessage(messages.newMessages, {
              count: newMessageCount,
            })}
          </button>
        ) : (
          isScrolledUp && (
            <button
              type='button'
              className='dm-room__to-bottom'
              title={intl.formatMessage(messages.scrollToBottom)}
              aria-label={intl.formatMessage(messages.scrollToBottom)}
              onClick={handleScrollToBottom}
            >
              <Icon id='chevron-down' icon={ExpandMoreIcon} />
            </button>
          )
        )}

        {/* 방이 열려 있는 동안 도착한 것만 읽힌다. 초기 적재는 지나간 뒤라
            낭독되지 않는다. */}
        <div className='dm-room__live-region' aria-live='polite'>
          {announcement}
        </div>

        {/* 편집 중이라는 것을 입력창 바로 위에서 알린다. 이 표시가 없으면
            Enter 를 눌렀을 때 새 메시지가 나갈 줄 알고 있다가 기존 글이
            바뀐다. 취소도 여기서만 할 수 있다. */}
        {editingMessage && (
          <div className='dm-room__editing'>
            <span>{intl.formatMessage(messages.editingBanner)}</span>

            <button type='button' onClick={handleCancelEdit}>
              {intl.formatMessage(messages.editingCancel)}
            </button>
          </div>
        )}

        <Composer
          value={draftText}
          onChange={handleDraftChange}
          onSubmit={handleSubmit}
          isEditing={Boolean(editingMessage)}
          reservedCharacters={mentionPrefixLength}
          uploads={uploads.uploads}
          canAttach={uploads.canAddMore}
          isUploading={uploads.isBusy}
          onAttach={uploads.addFiles}
          onRemoveAttachment={uploads.remove}
        />

      <Helmet>
        <title>{intl.formatMessage(messages.title)}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default Room;
