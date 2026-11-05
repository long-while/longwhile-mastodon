import { FormattedMessage } from 'react-intl';

import { isEqual } from 'lodash';

import AlternateEmailIcon from '@/material-icons/400-24px/mail.svg?react';
import ReplyIcon from '@/material-icons/400-24px/reply-fill.svg?react';
import { me } from 'mastodon/initial_state';
import type { NotificationGroupMention } from 'mastodon/models/notification_group';
import { useAppSelector } from 'mastodon/store';

import type { LabelRenderer } from './notification_group_with_status';
import { NotificationWithStatus } from './notification_with_status';

const mentionLabelRenderer: LabelRenderer = () => (
  <FormattedMessage id='notification.label.mention' defaultMessage='Mention' />
);

const privateMentionLabelRenderer: LabelRenderer = () => (
  <FormattedMessage
    id='notification.label.private_mention'
    defaultMessage='Private mention'
  />
);

const replyLabelRenderer: LabelRenderer = () => (
  <FormattedMessage id='notification.label.reply' defaultMessage='Reply' />
);

const privateReplyLabelRenderer: LabelRenderer = () => (
  <FormattedMessage
    id='notification.label.private_reply'
    defaultMessage='Private reply'
  />
);

export const NotificationMention: React.FC<{
  notification: NotificationGroupMention;
  unread: boolean;
}> = ({ notification, unread }) => {
  const [isDirect, isReply] = useAppSelector((state) => {
    const status = notification.statusId
      ? state.statuses.get(notification.statusId)
      : undefined;

    if (!status) return [false, false] as const;

    return [
      status.get('visibility') === 'direct',
      status.get('in_reply_to_account_id') === me,
    ] as const;
  }, isEqual);

  let labelRenderer = mentionLabelRenderer;

  if (isReply && isDirect) labelRenderer = privateReplyLabelRenderer;
  else if (isReply) labelRenderer = replyLabelRenderer;
  else if (isDirect) labelRenderer = privateMentionLabelRenderer;

  return (
    <NotificationWithStatus
      type='mention'
      icon={isReply ? ReplyIcon : AlternateEmailIcon}
      // @_longwhile — 멘션과 답글의 id 를 가른다. 상류는 둘 다 'reply' 라
      //   클래스가 `icon-reply` 하나로 굳어, 테마에서 두 알림에 서로 다른 그림을
      //   깔 방법이 없었다. 그림은 이미 위에서 갈라 놓고 있다.
      iconId={isReply ? 'reply' : 'at'}
      accountIds={notification.sampleAccountIds}
      count={notification.notifications_count}
      statusId={notification.statusId}
      labelRenderer={labelRenderer}
      unread={unread}
    />
  );
};
