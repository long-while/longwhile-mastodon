import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendDmMessage } from '../dm_rooms';

const apiSendDmMessage = vi.fn();

vi.mock('../../api/dm_rooms', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiSendDmMessage: (params: unknown) => apiSendDmMessage(params) as unknown,
}));

vi.mock('../importer', () => ({
  importFetchedAccounts: () => ({ type: 'ACCOUNTS_IMPORT_TEST' }),
  importFetchedStatuses: () => ({ type: 'STATUSES_IMPORT_TEST' }),
}));

const dispatch = (action: unknown): unknown =>
  typeof action === 'function'
    ? (action as (d: unknown, g: unknown) => unknown)(dispatch, () => ({}))
    : action;

let counter = 0;

const send = (overrides: Record<string, unknown> = {}) => {
  counter += 1;

  return dispatch(
    sendDmMessage({
      roomId: 'room',
      text: `message ${counter}`,
      inReplyToId: '10',
      fallbackInReplyToId: '1',
      recipientAccts: ['b'],
      recipientIds: ['2'],
      localId: `local-${counter}`,
      idempotencyKey: `key-${counter}`,
      createdAt: '2026-11-04T00:00:00Z',
      ...overrides,
    }),
  ) as Promise<{ meta: { requestStatus: string } }>;
};

const repliedTo = () =>
  apiSendDmMessage.mock.calls.map(
    ([params]) => (params as { inReplyToId?: string }).inReplyToId,
  );

const notFound = () =>
  Object.assign(new Error('Not Found'), { response: { status: 404 } });

beforeEach(() => {
  apiSendDmMessage.mockReset();
});

describe('sendDmMessage', () => {
  it('replies to the latest message it was given', async () => {
    apiSendDmMessage.mockResolvedValueOnce({ id: '11' });

    await send();

    expect(repliedTo()).toEqual(['10']);
  });

  it('chains messages sent in quick succession', async () => {
    let finishFirst!: (value: { id: string }) => void;
    apiSendDmMessage
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ id: '12' });

    const first = send();
    const second = send();

    await Promise.resolve();
    finishFirst({ id: '11' });

    await Promise.all([first, second]);

    expect(repliedTo()).toEqual(['10', '11']);
  });

  it('falls back to the room root when the target was deleted', async () => {
    apiSendDmMessage
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce({ id: '11' });

    const result = await send();

    expect(result.meta.requestStatus).toBe('fulfilled');
    expect(repliedTo()).toEqual(['10', '1']);
  });

  it('does not retry other failures', async () => {
    apiSendDmMessage.mockRejectedValueOnce(
      Object.assign(new Error('Too Many'), { response: { status: 429 } }),
    );

    const result = await send();

    expect(result.meta.requestStatus).toBe('rejected');
    expect(repliedTo()).toEqual(['10']);
  });

  it('does not retry when the root itself is gone', async () => {
    apiSendDmMessage.mockRejectedValueOnce(notFound());

    const result = await send({ inReplyToId: '1' });

    expect(result.meta.requestStatus).toBe('rejected');
    expect(repliedTo()).toEqual(['1']);
  });
});
