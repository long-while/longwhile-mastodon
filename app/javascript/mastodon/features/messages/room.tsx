// @_longwhile custom feature

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
import { stripLeadingMentions } from './util/strip_leading_mentions';
import { isSystemEvent } from './util/title_event';
import { useKeyboardInset } from './util/use_keyboard_inset';
import { useUploads } from './util/use_uploads';

const SCROLL_BUTTON_THRESHOLD = 320;

const FOLLOW_RATIO = 0.5;

const OLDER_TRIGGER_RATIO = 1;

const BOTTOM_EPSILON = 8;

const UNREAD_TOP_OFFSET = 48;

const READ_DEBOUNCE_MS = 2000;

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
  status?: Status;

  pending?: PendingDmMessage;

  isSystemEvent?: boolean;
}

const prefersInstantScroll = () =>
  Boolean(reduceMotion) ||
  (typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const newIdempotencyKey = () => {
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

  const { roomId } = useParams<{ roomId?: string }>();

  const [draft, setDraft] = useState<{ roomId?: string; text: string }>({
    text: '',
  });

  const draftText = draft.roomId === roomId ? draft.text : '';

  const [readSnapshot, setReadSnapshot] = useState<
    { lastReadId: string | null; hadUnread: boolean } | undefined
  >(undefined);

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

  const streamConnected = useAppSelector(
    (state) => selectDmRooms(state).streamConnected,
  );

  const draftsRef = useRef(drafts);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const keyboardInset = useKeyboardInset();

  const maxAttachments = useAppSelector(selectMaxMediaAttachments);
  const uploads = useUploads(maxAttachments);

  const uploadsRef = useRef(uploads);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  const scrollArea = useRef<HTMLDivElement>(null);

  const atBottomRef = useRef(true);

  const placedRef = useRef(false);

  const restoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(
    null,
  );
  const loadingOlderRef = useRef(false);

  const lastRenderedIdRef = useRef<string | undefined>(undefined);

  const firstRenderedIdRef = useRef<string | undefined>(undefined);

  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);

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

  useEffect(() => {
    dispatch(setActiveDmRoom({ roomId }));

    return () => {
      dispatch(setActiveDmRoom({ roomId: undefined }));
    };
  }, [dispatch, roomId]);

  useEffect(() => {
    setReadSnapshot(undefined);
    setIsScrolledUp(false);
    setNewMessageCount(0);
    setAnnouncement('');
    uploadsRef.current.reset();

    setDraft({ roomId, text: roomId ? (draftsRef.current[roomId] ?? '') : '' });

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

  const lastStatusId = room?.last_status?.id;

  useEffect(() => {
    if (!roomId || !lastStatusId) return;

    void dispatch(markDmRoomRead({ roomId, statusId: lastStatusId }));
  }, [dispatch, roomId, lastStatusId]);

  const myAccount = useAppSelector((state) => selectMessageAccount(state, me));

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

  const entries = useMemo<RoomMessage[]>(() => {
    const ids = messageState?.statusIds ?? [];

    return ids
      .map((id: string) => statusesById.get(id))
      .filter((status): status is Status => Boolean(status))
      .map((status) => {
        const inReplyToId = status.get('in_reply_to_id') as string | null;
        const quotes =
          room !== undefined &&
          Boolean(inReplyToId) &&
          inReplyToId !== room.root_status_id;

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

  const pending = messageState?.pending;

  const renderEntries = useMemo<RoomMessage[]>(() => {
    if (!pending || pending.length === 0) return entries;

    return [
      ...entries,
      ...pending.map((entry) => ({
        id: entry.localId,
        accountId: me ?? '',
        createdAt: entry.createdAt,
        quotesAnotherMessage: Boolean(
          entry.inReplyToId && entry.inReplyToId !== room?.root_status_id,
        ),
        pending: entry,
      })),
    ];
  }, [entries, pending, room?.root_status_id]);

  const sections = useMemo(
    () => groupMessages<RoomMessage>(renderEntries),
    [renderEntries],
  );

  const unreadDividerId = useMemo(() => {
    if (!readSnapshot) return undefined;

    if (!readSnapshot.hadUnread) return undefined;

    const { lastReadId } = readSnapshot;

    return entries.find(
      (entry) =>
        entry.accountId !== me &&
        (lastReadId === null || compareIds(entry.id, lastReadId) > 0),
    )?.id;
  }, [entries, readSnapshot]);


  const readStates = room?.participant_read_states;

  const unreadCountFor = useCallback(
    (messageId: string, authorId: string) => {
      if (!readStates || readStates.length === 0) return 0;

      return readStates.filter((state) => {
        if (state.account_id === me) return false;

        if (state.account_id === authorId) return false;

        if (state.last_read_status_id === null) return true;

        return compareIds(state.last_read_status_id, messageId) < 0;
      }).length;
    },
    [readStates],
  );

  const firstEntryId = entries[0]?.id;

  const scrollToBottom = useCallback((smooth: boolean) => {
    const node = scrollArea.current;

    if (!node) return;

    node.scrollTo({
      top: node.scrollHeight,
      behavior: smooth && !prefersInstantScroll() ? 'smooth' : 'auto',
    });
  }, []);

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

  useLayoutEffect(() => {
    if (placedRef.current) return;

    const node = scrollArea.current;

    if (!node || !room || !messageState?.loaded || readSnapshot === undefined) {
      return;
    }

    if (unreadDividerId) {
      const target = document.getElementById(`dm-message-${unreadDividerId}`);

      if (target) {
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

  useLayoutEffect(() => {
    const node = scrollArea.current;
    const restore = restoreRef.current;

    if (!node || !restore || firstRenderedIdRef.current === firstEntryId) return;

    firstRenderedIdRef.current = firstEntryId;
    restoreRef.current = null;
    node.scrollTop = node.scrollHeight - restore.scrollHeight + restore.scrollTop;
  }, [firstEntryId]);

  useLayoutEffect(() => {
    if (!placedRef.current) return;

    const lastId = renderEntries.at(-1)?.id;
    const previous = lastRenderedIdRef.current;

    if (!lastId || lastId === previous) return;

    const previousIndex = previous
      ? renderEntries.findIndex((entry) => entry.id === previous)
      : -1;

    lastRenderedIdRef.current = lastId;

    if (previous && previousIndex === -1) {
      if (atBottomRef.current) scrollToBottom(false);

      return;
    }

    const appended = renderEntries.slice(previousIndex + 1);
    const mine = appended.some((entry) => entry.accountId === me);
    const others = appended.filter((entry) => entry.accountId !== me);

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

  useEffect(() => {
    if (!roomId || draft.roomId !== roomId) return undefined;

    const timer = setTimeout(() => {
      void dispatch(saveDmDraft({ roomId, text: draft.text }));
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [dispatch, draft, roomId]);

  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

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

      void apiGetDmMessageSource(statusId)
        .then((source) => {
          setEditing({ roomId, statusId, mediaIds });
          setDraft({ roomId, text: stripLeadingMentions(source.text) });

          return source;
        })
        .catch(() => undefined);
    },
    [roomId, statusesById],
  );

  const handleCancelEdit = useCallback(() => {
    if (!roomId) return;

    setEditing(undefined);

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

        const text = stripLeadingMentions(result.payload?.text ?? '');

        setEditing(undefined);
        setDraft({ roomId, text });
        void dispatch(saveDmDraft({ roomId, text }));

        return result;
      });
    },
    [dispatch, roomId],
  );

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
          recipientAccts: room.accounts.map((account) => account.acct),
          recipientIds: room.accounts.map((account) => account.id),
          mediaIds: payload.mediaIds,
          localId: payload.localId,
          idempotencyKey: payload.idempotencyKey,
          createdAt: payload.createdAt,
        }),
      ) as unknown as Promise<{ meta: { requestStatus: string } }>;

      void request.then((result) => {
        if (result.meta.requestStatus !== 'fulfilled') return result;

        void dispatch(fetchDmRoom({ roomId: sentFromRoomId }));

        return result;
      });
    },
    [dispatch, room, roomId],
  );

  const pendingCounterRef = useRef(0);

  const handleSubmit = useCallback(() => {
    if (!roomId || !room) return;

    if (uploads.isBusy) return;

    const text = draftText.trimEnd();

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
      inReplyToId: room.root_status_id ?? undefined,
      localId: `dm-pending-${pendingCounterRef.current}`,
      idempotencyKey: newIdempotencyKey(),
      createdAt: new Date().toISOString(),
    });

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
        inReplyToId: entry.inReplyToId,
        localId: entry.localId,
        idempotencyKey: entry.idempotencyKey,
        createdAt: entry.createdAt,
      });
    },
    [pending, send],
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

  const isEmpty =
    messageState?.loaded && !messageState.isLoading && sections.length === 0;
  const isLoading = !messageState || messageState.isLoading;

  return (
    <div
      className='dm-room'
      role='region'
      aria-label={intl.formatMessage(messages.title)}
      style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
    >
      <RoomHeader room={room} onLeave={handleLeave} />

      {!streamConnected && (
        <p className='dm-room__offline' role='status'>
          {intl.formatMessage(messages.offline)}
        </p>
      )}

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
                      {/* {entry.message.id === unreadDividerId && <UnreadDivider />} */}

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

        <div className='dm-room__live-region' aria-live='polite'>
          {announcement}
        </div>

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
