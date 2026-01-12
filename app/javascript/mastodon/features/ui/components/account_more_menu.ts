import { useMemo } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { openModal } from 'mastodon/actions/modal';
import { useAppDispatch } from 'mastodon/store';

export const accountMoreMenuMessages = defineMessages({
  edit_profile: { id: 'account.edit_profile', defaultMessage: 'Edit profile' },
  follow_requests: {
    id: 'navigation_bar.follow_requests',
    defaultMessage: 'Follow requests',
  },
  filters: { id: 'navigation_bar.filters', defaultMessage: 'Muted words' },
  mutes: { id: 'navigation_bar.mutes', defaultMessage: 'Muted users' },
  blocks: { id: 'navigation_bar.blocks', defaultMessage: 'Blocked users' },
  logout: { id: 'navigation_bar.logout', defaultMessage: 'Logout' },
});

export const useAccountMoreMenuItems = () => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  return useMemo(() => {
    const handleLogoutClick = () => {
      dispatch(openModal({ modalType: 'CONFIRM_LOG_OUT', modalProps: {} }));
    };

    return [
      {
        text: intl.formatMessage(accountMoreMenuMessages.edit_profile),
        href: '/settings/profile',
      },
      {
        text: intl.formatMessage(accountMoreMenuMessages.follow_requests),
        to: '/follow_requests',
      },
      {
        text: intl.formatMessage(accountMoreMenuMessages.filters),
        href: '/filters',
      },
      {
        text: intl.formatMessage(accountMoreMenuMessages.mutes),
        to: '/mutes',
      },
      {
        text: intl.formatMessage(accountMoreMenuMessages.blocks),
        to: '/blocks',
      },
      null,
      {
        text: intl.formatMessage(accountMoreMenuMessages.logout),
        action: handleLogoutClick,
      },
    ];
  }, [intl, dispatch]);
};
