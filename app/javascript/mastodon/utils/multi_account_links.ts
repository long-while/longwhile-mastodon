import api from 'mastodon/api';
import { MULTI_ACCOUNT_REQUEST_TIMEOUT } from 'mastodon/api/multi_accounts_constants';
import { me } from 'mastodon/initial_state';
import type { MultiAccountEntry } from 'mastodon/types/multi_account';

import { loadAllEntries } from './multi_account_db';

interface LinksResponse {
  account_ids: string[];
}

let linkedIdsPromise: Promise<Set<string> | null> | null = null;

const fetchLinkedAccountIds = async (): Promise<Set<string> | null> => {
  try {
    const response = await api().get<LinksResponse>(
      '/api/v1/multi_accounts/links',
      { timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT },
    );
    return new Set(response.data.account_ids);
  } catch (error) {
    console.warn('[MultiAccount] Could not load linked accounts:', error);
    return null;
  }
};

export const loadLinkedAccountIds = (): Promise<Set<string> | null> => {
  if (!me) {
    return Promise.resolve(null);
  }

  linkedIdsPromise ??= fetchLinkedAccountIds().then((ids) => {
    if (!ids) {
      linkedIdsPromise = null;
    }
    return ids;
  });

  return linkedIdsPromise;
};

export const resetLinkedAccountIdsCache = () => {
  linkedIdsPromise = null;
};

export const filterLinkedEntries = (
  entries: Record<string, MultiAccountEntry>,
  linkedIds: Set<string> | null,
  sessionAccountId: string | null,
): Record<string, MultiAccountEntry> => {
  const allowed = new Set(linkedIds ?? []);

  if (sessionAccountId) {
    allowed.add(sessionAccountId);
  }

  return Object.fromEntries(
    Object.entries(entries).filter(([key, entry]) =>
      allowed.has(entry.id || key),
    ),
  );
};

export interface LinkedEntriesResult {
  entries: Record<string, MultiAccountEntry>;
  droppedCount: number;
  linksFailed: boolean;
}

const emptyResult: LinkedEntriesResult = {
  entries: {},
  droppedCount: 0,
  linksFailed: false,
};

export const loadLinkedEntriesDetailed =
  async (): Promise<LinkedEntriesResult> => {
    if (!me) {
      return emptyResult;
    }

    const [entries, linkedIds] = await Promise.all([
      loadAllEntries(),
      loadLinkedAccountIds(),
    ]);
    const visible = filterLinkedEntries(entries, linkedIds, me);

    return {
      entries: visible,
      droppedCount: Object.keys(entries).length - Object.keys(visible).length,
      linksFailed: linkedIds === null,
    };
  };

export const loadLinkedEntries = async (): Promise<
  Record<string, MultiAccountEntry>
> => (await loadLinkedEntriesDetailed()).entries;
