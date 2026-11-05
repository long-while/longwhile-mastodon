import {
  createSendQueue,
  newerId,
  quotesAnotherMessage,
  replyTargetFor,
} from '../util/reply_target';

describe('newerId', () => {
  it('compares snowflake ids by length before lexical order', () => {
    expect(newerId('9', '10')).toBe('10');
    expect(newerId('115000000000000002', '115000000000000001')).toBe(
      '115000000000000002',
    );
  });

  it('returns whichever id is present', () => {
    expect(newerId(undefined, '5')).toBe('5');
    expect(newerId('5', undefined)).toBe('5');
    expect(newerId(undefined, undefined)).toBeUndefined();
  });
});

describe('replyTargetFor', () => {
  it('replies to the latest message rather than the room root', () => {
    expect(replyTargetFor('30', '10')).toBe('30');
  });

  it('falls back to the root, then to a new thread', () => {
    expect(replyTargetFor(undefined, '10')).toBe('10');
    expect(replyTargetFor(undefined, null)).toBeUndefined();
  });
});

describe('quotesAnotherMessage', () => {
  const base = { rootStatusId: '1', previousStatusId: '3' };

  it('treats a reply to the previous message as a continuation', () => {
    expect(quotesAnotherMessage({ ...base, inReplyToId: '3' })).toBe(false);
  });

  it('treats a reply to the root as a continuation (older web messages)', () => {
    expect(quotesAnotherMessage({ ...base, inReplyToId: '1' })).toBe(false);
  });

  it('treats a message that starts a thread as a continuation', () => {
    expect(quotesAnotherMessage({ ...base, inReplyToId: null })).toBe(false);
  });

  it('treats a reply to an older message as a quote', () => {
    expect(quotesAnotherMessage({ ...base, inReplyToId: '2' })).toBe(true);
  });
});

describe('createSendQueue', () => {
  const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((_resolve) => {
      resolve = _resolve;
    });

    return { promise, resolve };
  };

  it('waits for the previous send and hands over its id', async () => {
    const enqueue = createSendQueue();
    const first = deferred<{ id: string }>();
    const seen: (string | undefined)[] = [];

    const a = enqueue('room', (previous) => {
      seen.push(previous);
      return first.promise;
    });
    const b = enqueue('room', (previous) => {
      seen.push(previous);
      return Promise.resolve({ id: '21' });
    });

    await Promise.resolve();
    expect(seen).toEqual([undefined]);

    first.resolve({ id: '20' });

    await expect(a).resolves.toEqual({ id: '20' });
    await expect(b).resolves.toEqual({ id: '21' });
    expect(seen).toEqual([undefined, '20']);
  });

  it('still sends after a failure and hands over the last success', async () => {
    const enqueue = createSendQueue();
    const first = deferred<{ id: string }>();
    const seen: (string | undefined)[] = [];

    void enqueue('room', () => first.promise);
    const failed = enqueue('room', () => Promise.reject(new Error('boom')));
    const next = enqueue('room', (previous) => {
      seen.push(previous);
      return Promise.resolve({ id: '22' });
    });

    first.resolve({ id: '20' });

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toEqual({ id: '22' });
    expect(seen).toEqual(['20']);
  });

  it('keeps rooms independent', async () => {
    const enqueue = createSendQueue();
    const blocked = deferred<{ id: string }>();
    const seen: (string | undefined)[] = [];

    void enqueue('a', () => blocked.promise);
    await enqueue('b', (previous) => {
      seen.push(previous);
      return Promise.resolve({ id: '5' });
    });

    expect(seen).toEqual([undefined]);
    blocked.resolve({ id: '4' });
  });
});
