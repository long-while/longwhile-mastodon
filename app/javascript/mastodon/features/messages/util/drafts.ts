// @_longwhile custom feature

const PREFIX = 'dm_draft:';

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const keyFor = (accountId: string, roomId: string) =>
  `${PREFIX}${accountId}:${roomId}`;

export const readDrafts = (accountId: string | undefined) => {
  const drafts: Record<string, string> = {};
  const store = storage();

  if (!store || !accountId) return drafts;

  const scope = `${PREFIX}${accountId}:`;

  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);

      if (!key?.startsWith(scope)) continue;

      const value = store.getItem(key);

      if (value) drafts[key.slice(scope.length)] = value;
    }
  } catch {
    return drafts;
  }

  return drafts;
};

export const writeDraft = (
  accountId: string | undefined,
  roomId: string,
  text: string,
) => {
  const store = storage();

  if (!store || !accountId) return;

  try {
    if (text.trim() === '') store.removeItem(keyFor(accountId, roomId));
    else store.setItem(keyFor(accountId, roomId), text);
  } catch {
  }
};

export const clearDrafts = () => {
  const store = storage();

  if (!store) return;

  try {
    const keys: string[] = [];

    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);

      if (key?.startsWith(PREFIX)) keys.push(key);
    }

    keys.forEach((key) => {
      store.removeItem(key);
    });
  } catch {
  }
};
