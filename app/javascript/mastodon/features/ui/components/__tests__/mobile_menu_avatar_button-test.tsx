import { Provider } from 'react-redux';

import { changeLayout } from 'mastodon/actions/app';
import { importAccounts } from 'mastodon/actions/importer/accounts';
import { closeNavigation } from 'mastodon/actions/navigation';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import { store } from 'mastodon/store';
import { fireEvent, render, screen } from 'mastodon/test_helpers';

import { MobileMenuAvatarButton } from '../mobile_menu_avatar_button';

const ACCOUNT_ID = '123';

const importMe = () =>
  store.dispatch(
    importAccounts({
      accounts: [
        {
          id: ACCOUNT_ID,
          username: 'me',
          acct: 'me',
          display_name: 'Me',
          note: '',
          emojis: [],
          fields: [],
          avatar: '/avatar.png',
          avatar_static: '/avatar.png',
          url: 'https://example.com/@me',
        } as unknown as ApiAccountJSON,
      ],
    }),
  );

const renderButton = (
  props: React.ComponentProps<typeof MobileMenuAvatarButton>,
) =>
  render(
    <Provider store={store}>
      <MobileMenuAvatarButton {...props} />
    </Provider>,
  );

describe('<MobileMenuAvatarButton />', () => {
  beforeAll(importMe);

  beforeEach(() => {
    store.dispatch(closeNavigation());
    store.dispatch(changeLayout({ layout: 'mobile' }));
  });

  it('renders only its children outside the mobile layout', () => {
    store.dispatch(changeLayout({ layout: 'single-column' }));

    renderButton({ children: <span>Notifications</span> });

    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.getByText('Notifications')).toBeTruthy();
  });

  it('keeps the title beside the avatar by default', () => {
    renderButton({ children: <span>Notifications</span> });

    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
  });

  it('opens the navigation drawer when tapped', () => {
    renderButton({});

    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);

    expect(store.getState().navigation.open).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });
});
