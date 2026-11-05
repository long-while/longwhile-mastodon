// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   새 대화 시작. 수신자를 골라 방을 만든다.
//   근거: dm-chat-phase-2.md §9, 기획서 §4.2.3
//
//   **화면이 둘이다** (2026-08-12 개편).
//
//     새 쪽지     검색 → "그룹 만들기" 줄 → 사람 목록. 줄을 누르면 **즉시** 1대1
//     그룹 만들기 사용자 추가(칩) → "다음" → 검색 → 사람 목록. 줄을 누르면 토글
//
//   **한 명만 고르는 경로를 느리게 만들지 않았다.** 그게 가장 흔한 동작인데,
//   "고르고 → 시작 버튼" 두 번이 되면 매일 쓰는 자리에 클릭이 하나 는다. 그래서
//   그룹은 별도 화면으로 갈라 두었다.
//
//     처음에 "고른 사람이 없으면 즉시 시작" 규칙을 썼다가 버렸다. 그러면
//     **첫 번째 사람을 고르는 순간 방이 만들어져 그룹을 만들 방법이 아예
//     없어진다.** 빠른 경로를 지키려다 기능 자체를 없앤 셈이었다.
//
//   **아바타 그리드를 버리고 목록으로 되돌렸다.** 4열 그리드는 한 화면에 더 많이
//   들어가지만, 이 서버는 표시 이름이 길고 이모지가 섞여 있어 그리드 칸에서는
//   거의 모두 잘렸다. 이름이 잘리면 얼굴만으로 골라야 하는데 아바타가 비슷한
//   사람이 많다. 참조 구현(인스타그램 DM)도 같은 이유로 목록이다.
//
//   근거: docs/dm-chat/phases/dm-chat-phase-5.md §4.3
//
//   후보를 팔로우 관계로 제한하지 않는다. 참조 구현은 팔로워·팔로잉만 보여주는데,
//   폐쇄형 5~40인 서버(D-02)에서는 막을 남용이 없고, 롤플레잉 서버의 팔로우는
//   캐릭터 관계이지 열람 권한이 아니다. 후보에서 빠진 사람을 못 찾는 것은
//   사용자가 원인을 알 수 없는 형태의 결함이다.
//
//   방 만들기는 find_or_create 다. 이미 있는 조합을 고르면 기존 방으로 간다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

import { isCancel } from 'axios';
import { useDebouncedCallback } from 'use-debounce';

import ArrowBackIcon from '@/material-icons/400-24px/arrow_back.svg?react';
import CheckIcon from '@/material-icons/400-24px/check.svg?react';
import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import GroupIcon from '@/material-icons/400-24px/group.svg?react';
import SearchIcon from '@/material-icons/400-24px/search.svg?react';
import LockIcon from '@/styles/bird-theme-svg/lock-fill.svg?react';
import { addDmRoomMembers, createDmRoom } from 'mastodon/actions/dm_rooms';
import { importFetchedAccounts } from 'mastodon/actions/importer';
import { apiRequest } from 'mastodon/api';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import { Avatar } from 'mastodon/components/avatar';
import { Icon } from 'mastodon/components/icon';
import { IconButton } from 'mastodon/components/icon_button';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import { me } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { selectMessageAccount } from './selectors';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
  search: {
    id: 'messages.new.search',
    defaultMessage: 'Search for someone',
  },
  remove: {
    id: 'messages.new.remove',
    defaultMessage: 'Remove {name}',
  },
  back: { id: 'column_back_button.label', defaultMessage: 'Back' },
  locked: {
    id: 'account.locked_info',
    defaultMessage:
      'This account privacy status is set to locked. The owner manually reviews who can follow them.',
  },
});

// 목록으로 바꾸면서 늘렸다. 그리드는 4열이라 12개(3줄)로 맞췄던 것인데,
// 한 줄짜리 목록에서는 12개가 화면의 절반도 못 채운다.
const SEARCH_LIMIT = 20;

// 검색하기 전에 깔아둘 기본 목록 — **내가 팔로우하는 사람들**.
//
// 예전에는 검색해야만 목록이 나왔다. 이 서버 규모(5~40인, D-02)에서는 대부분
// 이미 아는 사람에게 보내므로, 이름을 치기 전에 고를 수 있는 편이 훨씬 빠르다.
//
// **검색은 여전히 팔로우 관계로 제한하지 않는다**(파일 머리말). 기본 목록만
// 팔로잉이고, 검색창에 치면 서버 전체에서 찾는다.
//
// 페이지를 넘기지 않는다. 이 규모에서는 한 번에 다 들어오고, 안 들어오는 사람은
// 검색으로 찾으면 된다.
const FOLLOWING_LIMIT = 80;

const RecipientRow: React.FC<{
  accountId: string;
  disabled: boolean;

  // 고르는 화면인가(그룹 만들기), 바로 시작하는 화면인가(새 쪽지).
  // 체크 자리를 그릴지와 `aria-pressed` 를 붙일지가 여기서 갈린다 — 누를 때마다
  // 방이 만들어지는 줄에 "선택됨/해제됨" 을 읽어주면 거짓말이 된다.
  selectable: boolean;
  selected: boolean;
  onSelect: (accountId: string) => void;
}> = ({ accountId, disabled, selectable, selected, onSelect }) => {
  const intl = useIntl();
  // 스토어를 직접 읽지 않고 selectors 를 거친다. 이 저장소의 rootReducer 는
  // any 로 선언되어 있어 state.accounts 를 바로 읽으면 그 타입이 번진다.
  const account = useAppSelector((state) =>
    selectMessageAccount(state, accountId),
  );

  const handleClick = useCallback(() => {
    onSelect(accountId);
  }, [accountId, onSelect]);

  if (!account) return null;

  return (
    <button
      type='button'
      className={classNames('dm-recipient__row', {
        'dm-recipient__row--selected': selectable && selected,
      })}
      // 선택 상태를 스크린 리더에도 알린다. 색과 체크만으로는 읽히지 않는다.
      // 새 쪽지 화면에서는 붙이지 않는다 — 거기서 이 줄은 토글이 아니다.
      aria-pressed={selectable ? selected : undefined}
      disabled={disabled}
      onClick={handleClick}
    >
      <Avatar account={account} size={44} />

      <span className='dm-recipient__row__text'>
        <span className='dm-recipient__row__name'>
          {account.display_name.length > 0
            ? account.display_name
            : account.username}

          {/* 잠금 계정 표시. 이 서버는 대부분이 잠금이라 없는 쪽이 오히려
              눈에 띈다. 이름 옆이어야 그 사람의 성질로 읽힌다(A-35). */}
          {account.locked && (
            <Icon
              id='lock'
              icon={LockIcon}
              className='dm-recipient__row__lock'
              title={intl.formatMessage(messages.locked)}
            />
          )}
        </span>

        <span className='dm-recipient__row__handle'>@{account.acct}</span>
      </span>

      {/* 고르는 화면에서만 그린다. **선택을 색만으로 구분하지 않는다**
          (기획서 §4.7) — 빈 동그라미와 체크로 모양 자체가 갈린다. */}
      {selectable && (
        <span
          className={classNames('dm-recipient__row__check', {
            'dm-recipient__row__check--on': selected,
          })}
          aria-hidden='true'
        >
          {selected && <Icon id='check' icon={CheckIcon} />}
        </span>
      )}
    </button>
  );
};

// 고른 사람 하나. 눌러서 뺀다.
const RecipientChip: React.FC<{
  accountId: string;
  disabled: boolean;
  onRemove: (accountId: string) => void;
}> = ({ accountId, disabled, onRemove }) => {
  const intl = useIntl();
  const account = useAppSelector((state) =>
    selectMessageAccount(state, accountId),
  );

  const handleClick = useCallback(() => {
    onRemove(accountId);
  }, [accountId, onRemove]);

  if (!account) return null;

  const name =
    account.display_name.length > 0 ? account.display_name : account.username;

  return (
    <button
      type='button'
      className='dm-recipient__chip'
      disabled={disabled}
      // 무엇을 빼는지 이름과 함께 읽혀야 한다. X 하나만 있으면 스크린 리더에는
      // 똑같은 버튼이 여러 개로 읽힌다.
      aria-label={intl.formatMessage(messages.remove, { name })}
      onClick={handleClick}
    >
      <Avatar account={account} size={20} />
      <span className='dm-recipient__chip__name'>{name}</span>
      <Icon id='times' icon={CloseIcon} />
    </button>
  );
};

const DmRecipientModal: React.FC<{
  // 방이 만들어진 뒤 어디로 갈지는 부르는 쪽이 정한다. 모달이 라우터를 직접
  // 건드리지 않게 해서, 목록 화면 밖에서도 이 모달을 쓸 수 있게 둔다.
  onCreated?: (roomId: string) => void;

  // **초대 모드.** 값이 있으면 새 방을 만들지 않고 그 방에 멤버를 더한다.
  //
  // 검색·선택 UI 를 멤버 관리 모달에 다시 만들지 않으려고 이 모달을 다시 쓴다.
  // 두 벌이 되면 한쪽에만 들어가는 개선이 반드시 생긴다 — 잠금 표시와 Enter 처리가
  // 이미 그런 종류다.
  inviteToRoomId?: string;

  // 기본 목록에서 뺄 계정. 초대 화면에서 **이미 방에 있는 사람**을 지운다.
  // 서버는 이미 있는 사람을 조용히 건너뛰지만, 목록에 남아 있으면 눌러도
  // 아무 일이 없는 줄이 된다.
  excludeIds?: string[];
  onClose: () => void;
}> = ({ onCreated, inviteToRoomId, excludeIds, onClose }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const [query, setQuery] = useState('');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hasError, setHasError] = useState(false);

  // 검색 전에 보여줄 팔로잉 목록. 검색 결과와 따로 든다 — 검색어를 지웠을 때
  // 곧바로 되돌아와야 하고, 그때 왕복을 한 번 더 하지 않기 위해서다.
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(true);

  // 고른 사람들. 순서를 유지한다 — 칩이 누를 때마다 자리를 바꾸면 지우려던 것을
  // 잘못 지운다.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // 어느 화면인가. 기본은 새 쪽지 — 1대1 이 가장 흔한 경로이고, 거기서는 줄을
  // 누르는 순간 시작되는 편이 빠르다.
  //
  // **초대 모드는 처음부터 고르기 화면이다.** 멤버를 하나 누르는 순간 방이
  // 바뀌면 실수를 되돌릴 수 없다(내보내기는 방장만 할 수 있다).
  const [mode, setMode] = useState<'single' | 'group'>(
    inviteToRoomId ? 'group' : 'single',
  );

  const isInvite = Boolean(inviteToRoomId);
  const isGroup = mode === 'group' || isInvite;

  const requestRef = useRef<AbortController | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // 화면을 벗어난 뒤 도착한 응답이 상태를 건드리지 않게 한다.
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    searchInput.current?.focus();
  }, []);

  // 팔로잉 목록. 열릴 때 한 번만 읽는다.
  //
  // 전용 요청이 아니라 상류의 `GET /accounts/:id/following` 을 그대로 쓴다.
  // 그러면 차단·뮤트 처리가 그쪽 규칙을 그대로 따르고, 우리가 다시 구현할
  // 것이 없다.
  useEffect(() => {
    if (!me) {
      setIsLoadingFollowing(false);
      return;
    }

    void apiRequest<ApiAccountJSON[]>('GET', `v1/accounts/${me}/following`, {
      params: { limit: FOLLOWING_LIMIT },
    })
      .then((data) => {
        if (!mountedRef.current) return '';

        dispatch(importFetchedAccounts(data));
        setFollowingIds(data.map((account) => account.id));
        setIsLoadingFollowing(false);

        return '';
      })
      // 실패해도 배너를 띄우지 않는다. 검색은 그대로 되므로 화면이 못 쓰게
      // 되지 않고, 여기서 알려봐야 사용자가 할 수 있는 일이 없다.
      .catch(() => {
        if (mountedRef.current) setIsLoadingFollowing(false);
      });
  }, [dispatch]);

  const runSearch = useDebouncedCallback(
    (value: string) => {
      requestRef.current?.abort();

      if (value.trim().length === 0) {
        setAccountIds([]);
        setSearched(false);
        setHasError(false);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setHasError(false);
      requestRef.current = new AbortController();

      void apiRequest<ApiAccountJSON[]>('GET', 'v1/accounts/search', {
        signal: requestRef.current.signal,
        params: {
          q: value,
          limit: SEARCH_LIMIT,

          // 연합하지 않는 인스턴스다. resolve 는 원격 조회를 시도하게 만들 뿐이라
          // 켜 두면 검색이 느려지기만 한다. (dm-chat-decisions.md D-02)
          resolve: false,
        },
      })
        .then((data) => {
          if (!mountedRef.current) return '';

          dispatch(importFetchedAccounts(data));
          // 자기 자신에게 보내는 방은 만들 수 없다. 서버도 거르지만
          // (requested_account_ids 가 본인 id 를 뺀다), 고를 수 있게 두면
          // 눌렀을 때 "수신자가 없습니다" 가 떠서 이유를 알 수 없다.
          setAccountIds(data.map((a) => a.id).filter((id) => id !== me));
          setSearched(true);
          setIsSearching(false);
          return '';
        })
        .catch((err: unknown) => {
          if (!mountedRef.current) return;

          // 중단은 실패가 아니다. 다음 글자를 칠 때마다 앞의 요청을 끊으므로
          // 그것까지 알리면 검색 내내 "찾지 못했습니다" 가 깜빡인다.
          //
          // axios 는 AbortSignal 로 끊어도 DOMException('AbortError') 이 아니라
          // 자기 CanceledError 를 던진다. 이름으로만 보면 중단을 못 걸러낸다.
          if (isCancel(err)) return;

          // 실패와 "없음" 은 다르다. 오류를 "찾지 못했습니다" 로 보여주면
          // 사용자는 상대가 없다고 믿고 포기한다.
          setHasError(true);
          setSearched(true);
          setIsSearching(false);
        });
    },
    500,
    { leading: false, trailing: true },
  );

  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      runSearch(event.target.value);
    },
    [runSearch],
  );

  // 실제로 방을 만들거나(새 대화) 멤버를 더한다(초대). 고른 사람이 없으면
  // 부르지 않는다.
  const createRoom = useCallback(
    (ids: string[]) => {
      // 연타를 막는다. 같은 조합으로 두 번 부르면 find_or_create 라 방은 하나지만,
      // 두 번째 응답이 첫 번째 이동을 덮어 화면이 튄다.
      if (isCreating || ids.length === 0) return;

      setIsCreating(true);

      // dispatch 의 반환 타입이 살아 있지 않다(이 저장소의 rootReducer 가 any 로
      // 선언되어 있다). room.tsx 와 같은 방식으로 형태만 다시 붙인다.
      const pending = dispatch(
        inviteToRoomId
          ? addDmRoomMembers({ roomId: inviteToRoomId, accountIds: ids })
          : createDmRoom({ accountIds: ids }),
      ) as unknown as Promise<{
        meta: { requestStatus: string };
        payload?: ApiDmRoomJSON;
      }>;

      void pending.then((result) => {
        if (!mountedRef.current) return result;

        // 실패 알림은 errorsMiddleware 가 이미 띄운다. 여기서 또 띄우면 두 번 뜬다.
        if (result.meta.requestStatus === 'fulfilled' && result.payload) {
          // 초대는 이미 열려 있는 방을 바꾼 것이라 어디로도 가지 않는다.
          if (!inviteToRoomId) onCreated?.(result.payload.id);
          onClose();
        } else {
          setIsCreating(false);
        }

        return result;
      });
    },
    [dispatch, inviteToRoomId, isCreating, onClose, onCreated],
  );

  // 아바타를 누른 것. 모드에 따라 갈린다 — 평소에는 그 한 명으로 바로 시작하고,
  // 여러 명 모드에서는 선택만 토글한다.
  const handleSelect = useCallback(
    (accountId: string) => {
      if (isCreating) return;

      if (!isGroup) {
        createRoom([accountId]);
        return;
      }

      setSelectedIds((current) =>
        current.includes(accountId)
          ? current.filter((id) => id !== accountId)
          : [...current, accountId],
      );
    },
    [createRoom, isCreating, isGroup],
  );

  // 그룹 만들기로 들어간다. 검색어는 지운다 — 1대1 상대를 찾다가 마음을 바꾼
  // 경우가 대부분이라, 그 검색어가 그대로 남아 있으면 첫 화면이 이미 한 사람으로
  // 좁혀진 채 열린다.
  const handleOpenGroup = useCallback(() => {
    setMode('group');
    setQuery('');
    setAccountIds([]);
    setSearched(false);
    setHasError(false);
    searchInput.current?.focus();
  }, []);

  // 돌아가면 골라둔 것도 지운다. 남겨두면 화면에는 아무 표시가 없는데 다시
  // 들어왔을 때 예전 선택이 되살아난다.
  const handleBack = useCallback(() => {
    setMode('single');
    setSelectedIds([]);
    setQuery('');
    setAccountIds([]);
    setSearched(false);
    setHasError(false);
  }, []);

  // 칩을 눌러 뺀다. 여기서는 방을 만들지 않는다 — 빼려다 대화가 시작되면 안 된다.
  const handleDeselect = useCallback((accountId: string) => {
    setSelectedIds((current) => current.filter((id) => id !== accountId));
  }, []);

  const handleStart = useCallback(() => {
    createRoom(selectedIds);
  }, [createRoom, selectedIds]);

  // 검색어가 있으면 검색 결과, 없으면 팔로잉이다.
  const hasQuery = query.trim() !== '';

  const visibleIds = useMemo(() => {
    const source = hasQuery ? accountIds : followingIds;

    if (!excludeIds?.length) return source;

    return source.filter((id) => !excludeIds.includes(id));
  }, [accountIds, excludeIds, followingIds, hasQuery]);

  const isEmpty = hasQuery
    ? searched && !isSearching && !hasError && visibleIds.length === 0
    : !isLoadingFollowing && visibleIds.length === 0;

  const isLoadingList = hasQuery
    ? isSearching && visibleIds.length === 0
    : isLoadingFollowing;

  // Enter 로 첫 결과를 고른다. 없으면 Tab 으로 목록까지 내려가야 하는데, 검색
  // 결과가 열 개면 그만큼 눌러야 한다.
  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // 조합 중 Enter 는 한글을 확정하는 키다. 여기서 가로채면 마지막 글자가
      // 확정되기 전에 방이 만들어진다.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      if (event.which === 229 || event.nativeEvent.isComposing) return;

      if (event.key !== 'Enter') return;

      event.preventDefault();

      // 여러 명 모드에서 이미 고른 사람이 있으면 Enter 는 "시작" 이다. 검색 결과의
      // 첫 사람을 덤으로 넣어버리면 의도하지 않은 사람이 대화에 들어간다.
      if (isGroup && selectedIds.length > 0) {
        handleStart();
        return;
      }

      const first = visibleIds[0];

      if (!first) return;

      handleSelect(first);
    },
    [handleSelect, handleStart, isGroup, selectedIds.length, visibleIds],
  );


  return (
    <div
      className={classNames('modal-root__modal dialog-modal dm-recipient', {
        'dm-recipient--group': isGroup,
      })}
    >
      <div className='dialog-modal__header dm-recipient__header'>
        {/* 그룹 화면에서는 왼쪽에 돌아가기가 선다. X 로만 나갈 수 있으면 잘못
            들어온 사람은 모달을 닫고 처음부터 다시 열어야 한다. */}
        {isGroup && !isInvite && (
          <IconButton
            className='dm-recipient__header__back'
            title={intl.formatMessage(messages.back)}
            icon='chevron-left'
            iconComponent={ArrowBackIcon}
            disabled={isCreating}
            onClick={handleBack}
          />
        )}

        <span className='dialog-modal__header__title'>
          {isInvite ? (
            <FormattedMessage
              id='messages.members.add'
              defaultMessage='Add people'
            />
          ) : isGroup ? (
            <FormattedMessage
              id='messages.new.group_title'
              defaultMessage='Create a group'
            />
          ) : (
            <FormattedMessage
              id='messages.new.title'
              defaultMessage='New message'
            />
          )}
        </span>

        <IconButton
          className='dialog-modal__header__close'
          title={intl.formatMessage(messages.close)}
          icon='times'
          iconComponent={CloseIcon}
          onClick={onClose}
        />
      </div>

      <div className='dialog-modal__content dm-recipient__content'>
        {/* ── 그룹: "다음" ─────────────────────────────────────────────── */}
        {/* 고른 사람이 없어도 **자리를 지킨다**(disabled). 조건부로 나타나게
            하면 첫 사람을 고르는 순간 아래가 통째로 밀린다. */}
        {isGroup && (
          <div className='dm-recipient__picked'>
            <button
              type='button'
              className='button dm-recipient__next'
              disabled={isCreating || selectedIds.length === 0}
              onClick={handleStart}
            >
              {selectedIds.length > 0 && isInvite ? (
                <FormattedMessage
                  id='messages.members.invite_count'
                  defaultMessage='Add ({count})'
                  values={{ count: selectedIds.length }}
                />
              ) : selectedIds.length > 0 ? (
                <FormattedMessage
                  id='messages.new.start'
                  defaultMessage='Start conversation ({count})'
                  values={{ count: selectedIds.length }}
                />
              ) : (
                <FormattedMessage
                  id='messages.new.next'
                  defaultMessage='Next'
                />
              )}
            </button>
          </div>
        )}

        {/* ── 검색 ──────────────────────────────────────────────────── */}
        <div className='dm-recipient__search'>
          <Icon
            id='search'
            icon={SearchIcon}
            className='dm-recipient__search__icon'
          />

          {/* autoFocus 속성 대신 ref 로 잡는다. 이 화면은 사용자가 "새 메시지" 를
              눌러서 연 것이므로 검색창에 커서가 가 있는 것이 맞다. */}
          <input
            ref={searchInput}
            type='text'
            value={query}
            placeholder={intl.formatMessage(messages.search)}
            aria-label={intl.formatMessage(messages.search)}
            onChange={handleQueryChange}
            onKeyDown={handleSearchKeyDown}
          />
        </div>

        {/* ── 그룹: 고른 사람 ─────────────────────────────────────────── */}
        {/* 검색창 **아래**다. 검색 결과가 바뀌어도 여기 남는다 — 세 명을
            고르려면 검색을 세 번 해야 하는데, 그때마다 앞의 선택이 사라지면
            만들 수 없다. */}
        {isGroup && selectedIds.length > 0 && (
          <div className='dm-recipient__chips'>
            {selectedIds.map((accountId) => (
              <RecipientChip
                key={accountId}
                accountId={accountId}
                disabled={isCreating}
                onRemove={handleDeselect}
              />
            ))}
          </div>
        )}

        {/* ── 새 쪽지: 그룹으로 넘어가는 줄 ───────────────────────────── */}
        {/* **이것이 없으면 그룹을 만들 방법이 없다** — 줄을 누르는 순간 1대1 이
            시작되기 때문이다. 목록의 첫 줄처럼 생겨서, 사람을 고르러 내려가다
            자연스럽게 눈에 걸린다. */}
        {!isGroup && (
          <button
            type='button'
            className='dm-recipient__group-entry'
            disabled={isCreating}
            onClick={handleOpenGroup}
          >
            <span className='dm-recipient__group-entry__icon'>
              <Icon id='group' icon={GroupIcon} />
            </span>

            <FormattedMessage
              id='messages.new.create_group'
              defaultMessage='Create a group'
            />
          </button>
        )}

        {/* ── 사람 목록 ──────────────────────────────────────────────── */}
        {/* 결과가 바뀐 것을 소리로도 알린다. 포커스는 검색창에 있으므로 이게
            없으면 500ms 뒤에 결과가 왔는지 알 방법이 없다. */}
        <div className='dm-recipient__results' role='status'>
          {(isLoadingList || (isCreating && visibleIds.length === 0)) && (
            <LoadingIndicator />
          )}

          {hasQuery && hasError && (
            <p className='dm-recipient__empty'>
              <FormattedMessage
                id='messages.new.search_failed'
                defaultMessage='Search failed. Try again.'
              />
            </p>
          )}

          {/* 검색 결과가 없는 것과 팔로우한 사람이 없는 것은 다른 상황이라
              문구를 나눈다. 뒤엣것에 "찾지 못했습니다" 를 띄우면 검색이
              고장난 것처럼 읽힌다. */}
          {isEmpty && (
            <p className='dm-recipient__empty'>
              {hasQuery ? (
                <FormattedMessage
                  id='messages.new.no_results'
                  defaultMessage='No one found.'
                />
              ) : (
                <FormattedMessage
                  id='messages.new.no_following'
                  defaultMessage='Search for someone by name or handle.'
                />
              )}
            </p>
          )}

          {visibleIds.length > 0 && (
            <div className='dm-recipient__list'>
              {visibleIds.map((accountId) => (
                <RecipientRow
                  key={accountId}
                  accountId={accountId}
                  disabled={isCreating}
                  selectable={isGroup}
                  selected={selectedIds.includes(accountId)}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default DmRecipientModal;
