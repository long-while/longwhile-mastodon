import { RESET_ALL } from '../../actions/store';
import { resetStore } from '../reset_store';

describe('resetStore', () => {
  it('dispatches RESET_ALL action', () => {
    const dispatch = vi.fn();
    const store = { dispatch } as unknown as Parameters<typeof resetStore>[0];

    resetStore(store);

    expect(dispatch).toHaveBeenCalledWith({ type: RESET_ALL });
  });
});
