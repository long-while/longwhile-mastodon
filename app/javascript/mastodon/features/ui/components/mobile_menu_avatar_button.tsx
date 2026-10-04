import { useCallback } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { openNavigation } from 'mastodon/actions/navigation';
import { Avatar } from 'mastodon/components/avatar';
import { useIdentity } from 'mastodon/identity_context';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  menu: { id: 'tabs_bar.menu', defaultMessage: 'Menu' },
});

interface Props {
  children?: React.ReactNode;
}

export const MobileMenuAvatarButton: React.FC<Props> = ({ children }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const { signedIn, accountId } = useIdentity();
  const isMobileLayout = useAppSelector(
    (state) => state.meta.get('layout') === 'mobile',
  );
  const account = useAppSelector((state) =>
    accountId ? state.accounts.get(accountId) : undefined,
  );
  const navigationOpen = useAppSelector((state) => state.navigation.open);

  const handleClick = useCallback(() => {
    dispatch(openNavigation());
  }, [dispatch]);

  if (!signedIn || !isMobileLayout || !account) return children ?? null;

  const label = intl.formatMessage(messages.menu);

  return (
    <>
      <button
        type='button'
        className='column-header__avatar-menu'
        aria-label={label}
        title={label}
        aria-expanded={navigationOpen}
        onClick={handleClick}
      >
        <Avatar account={account} size={32} />
      </button>

      {children}
    </>
  );
};
