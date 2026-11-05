import { apiRequestGet } from 'mastodon/api';
import type { ApiStatusJSON } from 'mastodon/api_types/statuses';

export interface ApiThreadHeadJSON {
  status_id: string;
  omitted_count: number;
  head: ApiStatusJSON;
}

export const THREAD_HEADS_MAX_IDS = 40;

export const apiGetThreadHeads = (ids: string[]) =>
  apiRequestGet<ApiThreadHeadJSON[]>('v1/statuses/thread_heads', { id: ids });
