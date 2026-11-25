import { describe, expect, it } from 'vitest';

import { profilePathOf } from '../util/profile_path';

describe('profilePathOf', () => {
  it('links to the profile by acct', () => {
    expect(profilePathOf({ acct: 'alice' })).toBe('/@alice');
    expect(profilePathOf({ acct: 'bob@remote.example' })).toBe(
      '/@bob@remote.example',
    );
  });

  it('does not link an anonymized (deleted) account', () => {
    expect(profilePathOf({ acct: 'deleted' })).toBeNull();
  });

  it('does not link a suspended account', () => {
    expect(profilePathOf({ acct: 'alice', suspended: true })).toBeNull();
  });

  it('does not link an unknown account', () => {
    expect(profilePathOf(undefined)).toBeNull();
    expect(profilePathOf({ acct: '' })).toBeNull();
  });
});
