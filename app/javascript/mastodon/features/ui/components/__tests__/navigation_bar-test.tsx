import { IntlProvider } from 'react-intl';

import { MemoryRouter } from 'react-router-dom';

import { Provider } from 'react-redux';

import { render, screen } from '@testing-library/react';

import { IdentityContext } from 'mastodon/identity_context';
import { store } from 'mastodon/store';

import { NavigationBar } from '../navigation_bar';

const identity = {
  signedIn: true,
  accountId: '123',
  disabledAccountId: undefined,
  permissions: 0,
};

const renderBar = (path: string) =>
  render(
    <Provider store={store}>
      <IntlProvider locale='en'>
        <IdentityContext.Provider value={identity}>
          <MemoryRouter initialEntries={[path]}>
            <NavigationBar />
          </MemoryRouter>
        </IdentityContext.Provider>
      </IntlProvider>
    </Provider>,
  );

const itemLabels = () =>
  Array.from(document.querySelectorAll('.ui__navigation-bar__item')).map(
    (item) => item.getAttribute('aria-label'),
  );

describe('<NavigationBar />', () => {
  it('shows home, awaiting reply, notifications and messages in that order', () => {
    renderBar('/home');

    expect(itemLabels()).toEqual([
      'Home',
      'Awaiting reply',
      'Notifications',
      'Messages',
    ]);
  });

  it('lights up awaiting reply on its own screen', () => {
    renderBar('/pending-mentions');

    expect(
      screen
        .getByRole('link', { name: 'Awaiting reply' })
        .classList.contains('active'),
    ).toBe(true);
    expect(
      screen.getByRole('link', { name: 'Home' }).classList.contains('active'),
    ).toBe(false);
  });

  it('keeps home lit on the public tab', () => {
    renderBar('/public');

    expect(
      screen.getByRole('link', { name: 'Home' }).classList.contains('active'),
    ).toBe(true);
  });
});
