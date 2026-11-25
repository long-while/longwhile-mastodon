import { describe, expect, it } from 'vitest';

import { createThunk } from '../typed_functions';

describe('createThunk', () => {
  const failing = createThunk<{ skipAlert?: boolean } | undefined>(
    'test/failing',
    () => {
      throw new Error('offline');
    },
  );

  const run = async (arg?: { skipAlert?: boolean }) => {
    const dispatched: { type: string; payload?: unknown }[] = [];
    const dispatch = (action: { type: string; payload?: unknown }) => {
      dispatched.push(action);
      return action;
    };

    await failing(arg)(dispatch as never, () => ({}) as never, undefined);

    return dispatched.find((action) => action.type === 'test/failing/rejected');
  };

  it('marks the rejection so no alert is shown when the caller asks', async () => {
    const rejected = await run({ skipAlert: true });

    expect(rejected?.payload).toMatchObject({ skipAlert: true });
  });

  it('keeps the alert by default', async () => {
    const rejected = await run();

    expect(rejected?.payload).not.toHaveProperty('skipAlert');
  });
});
