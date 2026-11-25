export interface ApiBookmarkFolderJSON {
  id: string;
  name: string;
  position: number;
  statuses_count: number;
}

export interface ApiBookmarkDetailJSON {
  status_id: string;
  note: string;
  folder_ids: string[];
}

export interface BookmarkQuery {
  folderId?: string;
  q?: string;
  onlyMedia?: boolean;
  accountId?: string;
  note?: BookmarkNoteFilter;
}

export type BookmarkNoteFilter = 'with' | 'without';
