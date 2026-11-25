import { createContext } from 'react';

import type { BookmarkDetailsState } from 'mastodon/reducers/bookmark_details';

export interface BookmarkContextValue {
  folderId?: string;
  details: BookmarkDetailsState;
  onEditNote: (statusId: string) => void;
  onRemoveFromFolder: (statusId: string) => void;
}

export const BookmarkContext = createContext<BookmarkContextValue | null>(null);
