import { createAction } from '@reduxjs/toolkit';

import {
  apiGetThreadHeads,
  THREAD_HEADS_MAX_IDS,
} from 'mastodon/api/thread_heads';
import type { AppDispatch, RootState } from 'mastodon/store';

import { importFetchedStatuses } from './importer';

export interface ThreadHeadEntry {
  statusId: string;
  headId: string;
  omitted: number;
}

export const threadHeadsRequested = createAction<{ ids: string[] }>(
  'thread_heads/requested',
);
export const threadHeadsLoaded = createAction<{
  ids: string[];
  entries: ThreadHeadEntry[];
}>('thread_heads/loaded');
export const threadHeadsFailed = createAction<{ ids: string[] }>(
  'thread_heads/failed',
);

const PREVIEW_TIMELINES = ['home', 'public', 'community'];

export const timelineHasThreadPreview = (timelineId: string) =>
  PREVIEW_TIMELINES.includes(timelineId.split(':')[0] ?? '');

interface StatusLike {
  id: string;
  in_reply_to_id?: string | null;
  visibility?: string;
  reblog?: StatusLike | null;
}

export const threadHeadTargetIds = (statuses: StatusLike[]) =>
  statuses
    .map((status) => status.reblog ?? status)
    .filter(
      (status) => !!status.in_reply_to_id && status.visibility !== 'direct',
    )
    .map((status) => status.id);

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const fetchThreadHeads =
  (ids: string[]) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const asked = getState().get('thread_heads');
    const fresh = Array.from(new Set(ids)).filter((id) => !(id in asked));

    if (fresh.length === 0) return;

    dispatch(threadHeadsRequested({ ids: fresh }));

    await Promise.all(
      chunk(fresh, THREAD_HEADS_MAX_IDS).map(async (batch) => {
        try {
          const data = await apiGetThreadHeads(batch);

          dispatch(
            importFetchedStatuses(data.map((item) => item.head)) as never,
          );
          dispatch(
            threadHeadsLoaded({
              ids: batch,
              entries: data.map((item) => ({
                statusId: item.status_id,
                headId: item.head.id,
                omitted: item.omitted_count,
              })),
            }),
          );
        } catch {
          dispatch(threadHeadsFailed({ ids: batch }));
        }
      }),
    );
  };

export const fetchThreadHeadsForTimeline =
  (timelineId: string, statuses: StatusLike[]) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    if (!timelineHasThreadPreview(timelineId)) return;
    if (!getState().getIn(['meta', 'me'])) return;

    const ids = threadHeadTargetIds(statuses);
    if (ids.length === 0) return;

    return dispatch(fetchThreadHeads(ids));
  };
