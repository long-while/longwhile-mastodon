import { Map as ImmutableMap } from 'immutable';

import { importStatuses } from '../../actions/importer';
import { me } from '../../initial_state';
import statuses from '../statuses';

vi.mock('../../initial_state', () => ({ me: '1' }));

const reply = { id: '20', account: me, in_reply_to_id: '10', content: '' };

describe('statuses reducer — replied marker', () => {
  it('marks a loaded parent as replied', () => {
    const state = statuses(
      ImmutableMap({ 10: ImmutableMap({ id: '10', account: '2' }) }),
      importStatuses([reply]),
    );

    expect(state.getIn(['10', 'replied'])).toBe(true);
  });

  it('never creates a stub for a parent that is not loaded', () => {
    const state = statuses(ImmutableMap(), importStatuses([reply]));

    expect(state.has('10')).toBe(false);
  });
});
