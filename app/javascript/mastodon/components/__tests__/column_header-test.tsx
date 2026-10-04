import { Provider } from 'react-redux';

import { changeLayout } from 'mastodon/actions/app';
import { importAccounts } from 'mastodon/actions/importer/accounts';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import { store } from 'mastodon/store';
import { render, screen } from 'mastodon/test_helpers';

import { ColumnHeader } from '../column_header';

const fakeIcon = () => <span />;

const renderHeader = (
  props: Partial<React.ComponentProps<typeof ColumnHeader>>,
) =>
  render(
    <Provider store={store}>
      <ColumnHeader
        title='Home'
        icon='home'
        iconComponent={fakeIcon}
        {...props}
      />
    </Provider>,
  );

describe('<ColumnHeader /> menu avatar', () => {
  beforeAll(() => {
    store.dispatch(
      importAccounts({
        accounts: [
          {
            id: '123',
            username: 'me',
            acct: 'me',
            display_name: 'Me',
            note: '',
            emojis: [],
            fields: [],
            avatar: '/avatar.png',
            avatar_static: '/avatar.png',
          } as unknown as ApiAccountJSON,
        ],
      }),
    );
  });

  beforeEach(() => {
    store.dispatch(changeLayout({ layout: 'mobile' }));
  });

  it('puts the avatar beside the title on mobile', () => {
    renderHeader({});

    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
  });

  it('swaps the title for tabs and keeps it for screen readers', () => {
    renderHeader({ tabs: <nav>tabs</nav> });

    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
    expect(screen.getByRole('navigation').textContent).toBe('tabs');
    expect(screen.getByRole('heading').textContent).toContain('Home');
  });

  it('names the heading after the title alone when tabs are present', () => {
    renderHeader({ tabs: <a href='/public'>Live feeds</a> });

    expect(screen.getByRole('heading', { name: 'Home' })).toBeTruthy();
  });

  it('still offers the avatar on a header without a title', () => {
    renderHeader({ title: undefined });

    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
  });

  it('shows only the back arrow on a title-less screen such as compose', () => {
    renderHeader({ title: undefined, showBackButton: true });

    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  });

  it('leaves the spot to the back button', () => {
    renderHeader({ showBackButton: true });

    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
  });

  it('shows no avatar outside the mobile layout', () => {
    store.dispatch(changeLayout({ layout: 'single-column' }));

    renderHeader({});

    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
  });
});
