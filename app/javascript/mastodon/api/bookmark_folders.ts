import api, {
  apiRequestDelete,
  apiRequestGet,
  apiRequestPost,
  apiRequestPut,
  getLinks,
} from 'mastodon/api';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
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
