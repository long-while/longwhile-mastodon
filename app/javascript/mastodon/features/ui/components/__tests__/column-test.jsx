import { Provider } from 'react-redux';

import { store } from 'mastodon/store';
import { render, fireEvent, screen } from 'mastodon/test_helpers';

import Column from '../column';

const fakeIcon = () => <span />;

describe('<Column />', () => {
  describe('<ColumnHeader /> click handler', () => {
    it('runs the scroll animation if the column contains scrollable content', () => {
      const scrollToMock = vi.fn();
      const { container } = render(
        <Provider store={store}>
          <Column heading='notifications' icon='notifications' iconComponent={fakeIcon}>
            <div className='scrollable' />
          </Column>
        </Provider>,
      );
      container.querySelector('.scrollable').scrollTo = scrollToMock;
      fireEvent.click(screen.getByText('notifications'));
      expect(scrollToMock).toHaveBeenCalledWith({ behavior: 'smooth', top: 0 });
    });

    it('does not try to scroll if there is no scrollable content', () => {
      render(
        <Provider store={store}>
          <Column heading='notifications' icon='notifications' iconComponent={fakeIcon} />
        </Provider>,
      );
      fireEvent.click(screen.getByText('notifications'));
    });
  });
});
