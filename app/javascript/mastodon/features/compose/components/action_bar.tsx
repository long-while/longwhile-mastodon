import { defineMessages, useIntl } from 'react-intl';

import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { useAccountMoreMenuItems } from 'mastodon/features/ui/components/account_more_menu';

const messages = defineMessages({
  more: { id: 'navigation_panel.more', defaultMessage: 'More' },
});

export const ActionBar: React.FC = () => {
  const intl = useIntl();
  const menu = useAccountMoreMenuItems();

  return (
    <Dropdown
      items={menu}
      icon='bars'
      iconComponent={MoreHorizIcon}
      title={intl.formatMessage(messages.more)}
    />
  );
};
