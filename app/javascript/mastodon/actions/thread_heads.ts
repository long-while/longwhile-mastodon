import { createAction } from '@reduxjs/toolkit';

import {
  apiGetThreadHeads,
  THREAD_HEADS_MAX_IDS,
} from 'mastodon/api/thread_heads';
import type { AppDispatch, RootState } from 'mastodon/store';

import { importFetchedStatuses } from './importer';

// @_longwhile — 홈·퍼블릭 타임라인 답글 위의 "타래 시작 글" (X 처럼).
//
//   타임라인 한 페이지를 받을 때, 스트리밍으로 글이 들어올 때 그 답글들의 id 를 모아
//   한 번에 묻는다. 이미 물어본 id(답을 받았든, 묻는 중이든, 실패했든)는 다시 묻지 않는다.
//   실패해도 알림을 띄우지 않는다 — 미리보기가 없으면 예전처럼 "~님에게" 줄이 남을 뿐이다.

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

// 타임라인 이름에서 미리보기를 붙일 곳만 고른다. `public:media` 같은 변형도 포함.
const PREVIEW_TIMELINES = ['home', 'public', 'community'];

export const timelineHasThreadPreview = (timelineId: string) =>
  PREVIEW_TIMELINES.includes(timelineId.split(':')[0] ?? '');

interface StatusLike {
  id: string;
  in_reply_to_id?: string | null;
  visibility?: string;
  reblog?: StatusLike | null;
}

// 부스트는 감싼 글이 아니라 부스트된 글로 묻는다. DM 은 서버가 어차피 빼지만 묻지도 않는다.
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

// 타임라인 액션에서 부른다. 로그인하지 않았거나 미리보기를 쓰지 않는 타임라인이면 아무것도 안 한다.
export const fetchThreadHeadsForTimeline =
  (timelineId: string, statuses: StatusLike[]) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    if (!timelineHasThreadPreview(timelineId)) return;
    if (!getState().getIn(['meta', 'me'])) return;

    const ids = threadHeadTargetIds(statuses);
    if (ids.length === 0) return;

    return dispatch(fetchThreadHeads(ids));
  };
