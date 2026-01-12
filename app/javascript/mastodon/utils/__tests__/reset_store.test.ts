import { RESET_ALL } from '../../actions/store';
import { resetStore } from '../reset_store';

describe('resetStore', () => {
  it('dispatches RESET_ALL action', () => {
    const dispatch = jest.fn();
    const store = { dispatch } as any;

    resetStore(store);

    expect(dispatch).toHaveBeenCalledWith({ type: RESET_ALL });
  });
});

