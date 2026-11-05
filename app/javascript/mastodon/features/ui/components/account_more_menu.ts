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
      // @_longwhile — "팔로우 요청" 을 뺐다. 내비 패널에 항목이 생겼고(계정 전환
      //   바로 위, 배지 포함) 요청이 있을 때만 나타난다. 두 곳에 두면 같은 화면으로
      //   가는 길이 둘이 되는데, 배지가 붙는 쪽이 훨씬 눈에 띄어 이쪽은 쓰이지
      //   않는다. 문구(navigation_bar.follow_requests)는 내비가 그대로 쓴다.
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
