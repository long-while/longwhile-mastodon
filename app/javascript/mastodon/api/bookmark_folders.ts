import api, {
  apiRequestDelete,
  apiRequestGet,
  apiRequestPost,
  apiRequestPut,
  getLinks,
} from 'mastodon/api';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import type {
  ApiBookmarkDetailJSON,
  ApiBookmarkFolderJSON,
  BookmarkQuery,
} from 'mastodon/api_types/bookmark_folders';
import type { ApiStatusJSON } from 'mastodon/api_types/statuses';

export const apiGetBookmarkFolders = () =>
  apiRequestGet<ApiBookmarkFolderJSON[]>('v1/bookmark_folders');

export const apiCreateBookmarkFolder = (name: string) =>
  apiRequestPost<ApiBookmarkFolderJSON>('v1/bookmark_folders', { name });

export const apiRenameBookmarkFolder = (id: string, name: string) =>
  apiRequestPut<ApiBookmarkFolderJSON>(`v1/bookmark_folders/${id}`, { name });

export const apiDeleteBookmarkFolder = (id: string) =>
  apiRequestDelete(`v1/bookmark_folders/${id}`);

export const apiReorderBookmarkFolders = (folderIds: string[]) =>
  apiRequestPut<ApiBookmarkFolderJSON[]>('v1/bookmark_folders/order', {
    folder_ids: folderIds,
  });

export const apiGetStatusBookmarkFolders = (statusId: string) =>
  apiRequestGet<{ folder_ids: string[] }>(
    `v1/statuses/${statusId}/bookmark_folders`,
  );

export const apiSetStatusBookmarkFolders = (
  statusId: string,
  folderIds: string[],
) =>
  apiRequestPut<{ folder_ids: string[]; status: ApiStatusJSON }>(
    `v1/statuses/${statusId}/bookmark_folders`,
    { folder_ids: folderIds },
  );

export const apiGetBookmarkFolderStatuses = async (
  folderId: string,
  url?: string,
) => {
  const response = await api().request<ApiStatusJSON[]>({
    method: 'GET',
    url: url ?? '/api/v1/bookmarks',
    params: url ? undefined : { folder_id: folderId },
  });

  const next = getLinks(response).refs.find((link) => link.rel === 'next');

  return { statuses: response.data, next: next?.uri };
};

const queryParams = (query: BookmarkQuery) => {
  const params: Record<string, string> = {};

  if (query.folderId) params.folder_id = query.folderId;
  if (query.q?.trim()) params.q = query.q.trim();
  if (query.onlyMedia) params.only_media = 'true';
  if (query.accountId) params.account_id = query.accountId;
  if (query.note) params.note = query.note;

  return params;
};

export const apiGetBookmarks = async (query: BookmarkQuery, url?: string) => {
  const response = await api().request<ApiStatusJSON[]>({
    method: 'GET',
    url: url ?? '/api/v1/bookmarks',
    params: url ? undefined : queryParams(query),
  });

  const next = getLinks(response).refs.find((link) => link.rel === 'next');

  return { statuses: response.data, next: next?.uri };
};

export const apiGetBookmarkDetails = (statusIds: string[]) =>
  apiRequestGet<ApiBookmarkDetailJSON[]>('v1/bookmarks/details', {
    status_ids: statusIds,
  });

export const apiSetBookmarkNote = (statusId: string, note: string) =>
  apiRequestPut<ApiBookmarkDetailJSON>(`v1/bookmarks/${statusId}/note`, {
    note,
  });

export const apiGetBookmarkAuthors = () =>
  apiRequestGet<ApiAccountJSON[]>('v1/bookmarks/authors');

export const apiRemoveBookmarks = (statusIds: string[]) =>
  apiRequestPost<{ status_ids: string[] }>('v1/bookmarks/remove', {
    status_ids: statusIds,
  });

export const apiAddStatusesToBookmarkFolder = (
  folderId: string,
  statusIds: string[],
) =>
  apiRequestPost<{ status_ids: string[] }>(
    `v1/bookmark_folders/${folderId}/statuses`,
    { status_ids: statusIds },
  );

export const apiRemoveStatusesFromBookmarkFolder = (
  folderId: string,
  statusIds: string[],
) =>
  apiRequestDelete<{ status_ids: string[] }>(
    `v1/bookmark_folders/${folderId}/statuses`,
    { status_ids: statusIds },
  );
