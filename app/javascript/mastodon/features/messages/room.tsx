// @_longwhile custom feature

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { Helmet } from 'react-helmet';
import { Redirect, useHistory } from 'react-router-dom';

import {
  fetchDmRoom,
  fetchDmRoomStatuses,
  markDmRoomRead,
  sendDmMessage,
} from 'mastodon/actions/dm_rooms';
import { Column } from 'mastodon/components/column';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import { dmChatEnabled, me } from 'mastodon/initial_state';
import type { Status } from 'mastodon/models/status';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { Composer } from './components/composer';
import { DateDivider } from './components/date_divider';
import { MessageBubble } from './components/message_bubble';
import { MessageQuote } from './components/message_quote';
import { RoomHeader } from './components/room_header';
import { UnreadDivider } from './components/unread_divider';
import {
  selectDmRoom,
  selectDmRoomMessages,
  selectMaxMediaAttachments,
  selectMessageAccount,
  selectMessageStatuses,
} from './selectors';
import { compareIds } from './util/compare_ids';
import { opensInChat } from './util/group_fallback';
import type { GroupableMessage } from './util/group_messages';
import { groupMessages } from './util/group_messages';
import { confirmLeaveRoom } from './util/leave_room';
import { useKeyboardInset } from './util/use_keyboard_inset';
import { useUploads } from './util/use_uploads';

const messages = defineMessages({
  title: { id: 'column.messages', defaultMessage: 'Messages' },
  empty: {
    id: 'messages.room.empty',
    defaultMessage: 'No messages yet. Say something to get started.',
  },
  loadFailed: {
    id: 'messages.room.load_failed',
    defaultMessage: 'Could not load this conversation.',
  },
});

interface RoomMessage extends GroupableMessage {
  status: Status;

  quotedId?: string;
}

const Room: React.FC<{
  params?: { roomId?: string };
  multiColumn?: boolean;
}> = ({ params, multiColumn }) => {
  const intl = useIntl();
  const history = useHistory();
  const dispatch = useAppDispatch();
  const roomId = params?.roomId;

  const [draft, setDraft] = useState('');

  const [replyToId, setReplyToId] = useState<string | null>(null);

  const [readSnapshot, setReadSnapshot] = useState<
    { lastReadId: string | null; hadUnread: boolean } | undefined
  >(undefined);

  const [isSending, setIsSending] = useState(false);

  const [focusToken, setFocusToken] = useState(0);

  const room = useAppSelector((state) => selectDmRoom(state, roomId));
  const messageState = useAppSelector((state) =>
    selectDmRoomMessages(state, roomId),
  );
  const statusesById = useAppSelector(selectMessageStatuses);

  const keyboardInset = useKeyboardInset();

  const maxAttachments = useAppSelector(selectMaxMediaAttachments);
  const uploads = useUploads(maxAttachments);

  const uploadsRef = useRef(uploads);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  const roomIdRef = useRef(roomId);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    void dispatch(fetchDmRoom({ roomId }));
    void dispatch(fetchDmRoomStatuses({ roomId }));
  }, [dispatch, roomId]);

  useEffect(() => {
    setReplyToId(null);
    setReadSnapshot(undefined);
    setIsSending(false);
    setDraft('');
    uploadsRef.current.reset();
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

  const entries = useMemo(() => {
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

        return {
          id: status.get('id') as string,
          accountId: status.get('account') as string,
          createdAt: status.get('created_at') as string,
          quotesAnotherMessage: quotes,
          quotedId: quotes && inReplyToId ? inReplyToId : undefined,
          status,
        };
      });
  }, [messageState?.statusIds, statusesById, room]);

  const sections = useMemo(
    () => groupMessages<RoomMessage>(entries),
    [entries],
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

  const loadedStatusIds = messageState?.statusIds;

  useEffect(() => {
    if (!replyToId || !loadedStatusIds) return;
    if (loadedStatusIds.includes(replyToId)) return;

    setReplyToId(null);
  }, [loadedStatusIds, replyToId]);

  const handleReply = useCallback((statusId: string) => {
    setReplyToId(statusId);
    setFocusToken((token) => token + 1);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyToId(null);
    setFocusToken((token) => token + 1);
  }, []);

  const handleNavigateToQuoted = useCallback((statusId: string) => {
    const target = document.getElementById(`dm-message-${statusId}`);

    if (!target) return;

    target.scrollIntoView({ block: 'center', behavior: 'smooth' });

    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!roomId || !room) return;

    if (uploads.isBusy) return;

    if (isSending) return;

    const text = draft;
    const repliedTo = replyToId;
    const mediaIds = uploads.mediaIds;
    const sentFromRoomId = roomId;

    if (text.trim() === '' && mediaIds.length === 0) return;

    setIsSending(true);
    setDraft('');
    setReplyToId(null);

    const pending = dispatch(
      sendDmMessage({
        roomId,
        text,
        inReplyToId: repliedTo ?? room.root_status_id ?? undefined,
        recipientAccts: room.accounts.map((account) => account.acct),
        recipientIds: room.accounts.map((account) => account.id),
        mediaIds,
      }),
    ) as unknown as Promise<{ meta: { requestStatus: string } }>;

    void pending.then((result) => {
      if (roomIdRef.current !== sentFromRoomId) return result;

      setIsSending(false);

      if (result.meta.requestStatus === 'rejected') {
        setDraft((current) => {
          if (current === '') return text;
          if (text === '') return current;

          return `${text}\n${current}`;
        });
        setReplyToId((current) => current ?? repliedTo);
      } else {
        uploads.reset();

        void dispatch(fetchDmRoom({ roomId: sentFromRoomId }));
      }

      return result;
    });
  }, [dispatch, draft, isSending, replyToId, room, roomId, uploads]);

  if (!dmChatEnabled) return <Redirect to='/conversations' />;
  if (!roomId) return null;

  if (room && !opensInChat(room)) return <Redirect to='/conversations' />;

  const isEmpty =
    messageState?.loaded && !messageState.isLoading && sections.length === 0;
  const isLoading = !messageState || messageState.isLoading;

  return (
    <Column bindToDocument={!multiColumn} label={intl.formatMessage(messages.title)}>
      <RoomHeader room={room} onLeave={handleLeave} />

      <div
        className='dm-room'
        style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
      >
        <div className='dm-room__scroll'>
          {isLoading && sections.length === 0 && <LoadingIndicator />}

          {messageState?.hasError && (
            <p className='dm-room__empty'>
              {intl.formatMessage(messages.loadFailed)}
            </p>
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
                      {entry.message.id === unreadDividerId && <UnreadDivider />}

                      <MessageBubble
                        status={entry.message.status}
                        memberUrls={memberUrls}
                        isMine={entry.message.accountId === me}
                        isFirstInGroup={entry.isFirstInGroup}
                        isLastInGroup={entry.isLastInGroup}
                        showTimestamp={entry.showTimestamp}
                        showSenderName={Boolean(room?.is_group)}
                        quotedId={entry.message.quotedId}
                        quoted={
                          entry.message.quotedId
                            ? statusesById.get(entry.message.quotedId)
                            : undefined
                        }
                        onReply={handleReply}
                        onNavigateToQuoted={handleNavigateToQuoted}
                      />
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={handleSubmit}
          reservedCharacters={mentionPrefixLength}
          uploads={uploads.uploads}
          canAttach={uploads.canAddMore}
          isUploading={uploads.isBusy}
          onAttach={uploads.addFiles}
          onRemoveAttachment={uploads.remove}
          focusToken={focusToken}
          isSending={isSending}
          onCancelReply={replyToId ? handleCancelReply : undefined}
          replyPreview={
            replyToId ? (
              <MessageQuote
                quotedId={replyToId}
                quoted={statusesById.get(replyToId)}
                memberUrls={memberUrls}
                onNavigate={handleNavigateToQuoted}
              />
            ) : undefined
          }
        />
      </div>

      <Helmet>
        <title>{intl.formatMessage(messages.title)}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default Room;
