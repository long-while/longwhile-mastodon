import { fromJS } from 'immutable';
import { describe, expect, it, vi } from 'vitest';

import { selectMaxCharacters } from '../selectors';

vi.mock('mastodon/initial_state', () => ({ maxCharacters: 1500 }));

const stateWith = (maxCharacters?: number) => ({
  server: fromJS({
    server:
      maxCharacters === undefined
        ? {}
        : { configuration: { statuses: { max_characters: maxCharacters } } },
  }),
});

describe('selectMaxCharacters', () => {
  it('uses the limit from the instance API', () => {
    expect(selectMaxCharacters(stateWith(2000))).toBe(2000);
  });

  it('falls back to the limit rendered into the page before the API answers', () => {
    expect(selectMaxCharacters(stateWith())).toBe(1500);
  });

  it('ignores a nonsensical value', () => {
    expect(selectMaxCharacters(stateWith(0))).toBe(1500);
  });
});
