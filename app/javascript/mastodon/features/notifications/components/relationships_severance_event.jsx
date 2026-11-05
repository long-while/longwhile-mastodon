import PropTypes from 'prop-types';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';

import HeartBrokenIcon from '@/material-icons/400-24px/heart_broken-fill.svg?react';
import { Icon }  from 'mastodon/components/icon';
import { domain } from 'mastodon/initial_state';

// This needs to be kept in sync with app/models/relationships_severance_event.rb
const messages = defineMessages({
  account_suspension: { id: 'notification.relationships_severance_event.account_suspension', defaultMessage: 'An admin from {from} has suspended {target}, which means you can no longer receive updates from them or interact with them.' },
  domain_block: { id: 'notification.relationships_severance_event.domain_block', defaultMessage: 'An admin from {from} has blocked {target}, including {followersCount} of your followers and {followingCount, plural, one {# account} other {# accounts}} you follow.' },
  user_domain_block: { id: 'notification.relationships_severance_event.user_domain_block', defaultMessage: 'You have blocked {target}, removing {followersCount} of your followers and {followingCount, plural, one {# account} other {# accounts}} you follow.' },
});

export const RelationshipsSeveranceEvent = ({ type, target, followingCount, followersCount, hidden, unread }) => {
  const intl = useIntl();

  if (hidden) {
    return null;
  }

  return (
    <div role='button' className={classNames('notification-group notification-group--link notification-group--relationships-severance-event focusable', { 'notification-group--unread': unread })} tabIndex='0'>
      <div className='notification-group__icon'><Icon id='heart_broken' icon={HeartBrokenIcon} /></div>

      <div className='notification-group__main'>
        {/* @_longwhile — "자세히" 링크가 가리키던 /severed_relationships 화면을
            걷어냈다. 연합하지 않는 인스턴스라 이 알림 자체가 생기지 않지만,
            죽은 링크를 남겨 두지는 않는다 (settings-phase-3.md). */}
        <p>{intl.formatMessage(messages[type], { from: <strong>{domain}</strong>, target: <strong>{target}</strong>, followingCount, followersCount })}</p>
      </div>
    </div>
  );
};

RelationshipsSeveranceEvent.propTypes = {
  type: PropTypes.oneOf([
    'account_suspension',
    'domain_block',
    'user_domain_block',
  ]).isRequired,
  target: PropTypes.string.isRequired,
  followersCount: PropTypes.number.isRequired,
  followingCount: PropTypes.number.isRequired,
  hidden: PropTypes.bool,
  unread: PropTypes.bool,
};
