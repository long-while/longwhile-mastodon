import { apiRequestGet } from 'mastodon/api';
import type { ApiStatusJSON } from 'mastodon/api_types/statuses';

// @_longwhile — 타임라인 답글 위에 그릴 "타래의 시작 글".
//   서버 규칙은 `.claude/upgrade/logs/review-2026-10-30/thread-api.md`.
//   응답은 시작 글이 있는 항목만 담는다. 없는 id 는 조용히 빠진다.
export interface ApiThreadHeadJSON {
  status_id: string;
  omitted_count: number;
  head: ApiStatusJSON;
}

// 서버가 한 번에 받는 최대 개수. 넘기면 422 로 거절한다(잘라 주지 않는다).
export const THREAD_HEADS_MAX_IDS = 40;

export const apiGetThreadHeads = (ids: string[]) =>
  apiRequestGet<ApiThreadHeadJSON[]>('v1/statuses/thread_heads', { id: ids });
