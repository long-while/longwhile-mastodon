// @_longwhile custom feature

import type { ApiAccountJSON } from './accounts';
import type { ApiStatusJSON } from './statuses';

export interface ApiDmRoomJSON {
  id: string;
  accounts: ApiAccountJSON[];
  last_status?: ApiStatusJSON | null;
  unread_count: number;

  root_status_id: string | null;

  last_read_status_id: string | null;

  is_group: boolean;
  is_local: boolean;
  title: string | null;
}
