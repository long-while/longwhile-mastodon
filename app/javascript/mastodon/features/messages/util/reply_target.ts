import { compareIds } from './compare_ids';

export const newerId = (a?: string | null, b?: string | null) => {
  if (!a) return b ?? undefined;
  if (!b) return a;

  return compareIds(a, b) >= 0 ? a : b;
};

export const replyTargetFor = (
  latestStatusId: string | undefined,
  rootStatusId: string | null | undefined,
) => latestStatusId ?? rootStatusId ?? undefined;

export const quotesAnotherMessage = ({
  inReplyToId,
  rootStatusId,
  previousStatusId,
}: {
  inReplyToId: string | null | undefined;
  rootStatusId: string | null | undefined;
  previousStatusId: string | undefined;
}) =>
  Boolean(inReplyToId) &&
  inReplyToId !== rootStatusId &&
  inReplyToId !== previousStatusId;

export const createSendQueue = () => {
  const tails = new Map<string, Promise<string | undefined>>();

  return <T extends { id: string }>(
    roomId: string,
    run: (previousSentId: string | undefined) => Promise<T>,
  ): Promise<T> => {
    const previous = tails.get(roomId) ?? Promise.resolve(undefined);
    const result = previous.then((previousSentId) => run(previousSentId));

    const tail = result.then(
      (status) => status.id,
      () => previous,
    );

    tails.set(roomId, tail);

    void tail.then(() => {
      if (tails.get(roomId) === tail) tails.delete(roomId);
    });

    return result;
  };
};
