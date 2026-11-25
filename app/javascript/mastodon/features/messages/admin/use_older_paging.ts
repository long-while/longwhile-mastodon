import { useCallback, useLayoutEffect, useRef } from 'react';

import { fetchAdminDmRoomStatuses } from 'mastodon/actions/admin_dm_rooms';
import { useAppDispatch } from 'mastodon/store';

const OLDER_TRIGGER_RATIO = 1;

interface PagingState {
  statusIds: string[];
  hasMore: boolean;
  loaded: boolean;
}

export const useAdminOlderPaging = (
  roomId: string | undefined,
  messageState: PagingState | undefined,
  firstEntryId: string | undefined,
) => {
  const dispatch = useAppDispatch();
  const scrollArea = useRef<HTMLDivElement>(null);
  const placedRef = useRef(false);
  const loadingRef = useRef(false);
  const firstRenderedIdRef = useRef<string | undefined>(undefined);
  const restoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    placedRef.current = false;
    restoreRef.current = null;
    loadingRef.current = false;
  }, [roomId]);

  useLayoutEffect(() => {
    const node = scrollArea.current;

    if (placedRef.current || !node || !messageState?.loaded || !firstEntryId)
      return;

    node.scrollTop = node.scrollHeight;
    placedRef.current = true;
    firstRenderedIdRef.current = firstEntryId;
  }, [messageState?.loaded, firstEntryId]);

  useLayoutEffect(() => {
    const node = scrollArea.current;
    const restore = restoreRef.current;

    if (!node || !restore || firstRenderedIdRef.current === firstEntryId)
      return;

    firstRenderedIdRef.current = firstEntryId;
    restoreRef.current = null;
    node.scrollTop =
      node.scrollHeight - restore.scrollHeight + restore.scrollTop;
  }, [firstEntryId]);

  const loadOlder = useCallback(() => {
    const node = scrollArea.current;
    const oldest = messageState?.statusIds[0];

    if (!node || !roomId || !oldest || loadingRef.current) return;
    if (!placedRef.current || !messageState.loaded || !messageState.hasMore)
      return;

    loadingRef.current = true;
    restoreRef.current = {
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    };

    void dispatch(fetchAdminDmRoomStatuses({ roomId, maxId: oldest })).then(
      (action) => {
        loadingRef.current = false;
        if ('error' in action) restoreRef.current = null;
      },
    );
  }, [dispatch, messageState, roomId]);

  const handleScroll = useCallback(() => {
    const node = scrollArea.current;

    if (node && node.scrollTop < node.clientHeight * OLDER_TRIGGER_RATIO)
      loadOlder();
  }, [loadOlder]);

  useLayoutEffect(() => {
    handleScroll();
  }, [firstEntryId, handleScroll]);

  return { scrollArea, handleScroll };
};
