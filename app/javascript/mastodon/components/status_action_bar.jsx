import PropTypes from 'prop-types';

import { defineMessages, injectIntl } from 'react-intl';

import classNames from 'classnames';
import { withRouter } from 'react-router-dom';

import ImmutablePropTypes from 'react-immutable-proptypes';
import ImmutablePureComponent from 'react-immutable-pure-component';
import { connect } from 'react-redux';

import BookmarkIcon from '@/material-icons/400-24px/bookmark-fill.svg?react';
import BookmarkBorderIcon from '@/material-icons/400-24px/bookmark.svg?react';
import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import RepeatIcon from '@/material-icons/400-24px/repeat.svg?react';
import ReplyIcon from '@/material-icons/400-24px/reply.svg?react';
import ReplyAllIcon from '@/material-icons/400-24px/reply_all.svg?react';
import StarIcon from '@/material-icons/400-24px/star-fill.svg?react';
import StarBorderIcon from '@/material-icons/400-24px/star.svg?react';
import RepeatActiveIcon from '@/svg-icons/repeat_active.svg?react';
import RepeatDisabledIcon from '@/svg-icons/repeat_disabled.svg?react';
import RepeatPrivateIcon from '@/svg-icons/repeat_private.svg?react';
import RepeatPrivateActiveIcon from '@/svg-icons/repeat_private_active.svg?react';
import { identityContextPropShape, withIdentity } from 'mastodon/identity_context';
import { PERMISSION_MANAGE_USERS, PERMISSION_MANAGE_FEDERATION } from 'mastodon/permissions';
import { WithRouterPropTypes } from 'mastodon/utils/react_router';

import { Dropdown } from 'mastodon/components/dropdown_menu';
import { me } from '../initial_state';

import { IconButton } from './icon_button';

const messages = defineMessages({
  delete: { id: 'status.delete', defaultMessage: 'Delete' },
  redraft: { id: 'status.redraft', defaultMessage: 'Delete & re-draft' },
  edit: { id: 'status.edit', defaultMessage: 'Edit' },
  direct: { id: 'status.direct', defaultMessage: 'Privately mention @{name}' },
  mention: { id: 'status.mention', defaultMessage: 'Mention @{name}' },
  mute: { id: 'account.mute', defaultMessage: 'Mute @{name}' },
  block: { id: 'account.block', defaultMessage: 'Block @{name}' },
  reply: { id: 'status.reply', defaultMessage: 'Reply' },
  more: { id: 'status.more', defaultMessage: 'More' },
  replyAll: { id: 'status.replyAll', defaultMessage: 'Reply to thread' },
  reblog: { id: 'status.reblog', defaultMessage: 'Boost' },
  reblog_private: { id: 'status.reblog_private', defaultMessage: 'Boost with original visibility' },
  cancel_reblog_private: { id: 'status.cancel_reblog_private', defaultMessage: 'Unboost' },
  cannot_reblog: { id: 'status.cannot_reblog', defaultMessage: 'This post cannot be boosted' },
  favourite: { id: 'status.favourite', defaultMessage: 'Favorite' },
  removeFavourite: { id: 'status.remove_favourite', defaultMessage: 'Remove from favorites' },
  bookmark: { id: 'status.bookmark', defaultMessage: 'Bookmark' },
  removeBookmark: { id: 'status.remove_bookmark', defaultMessage: 'Remove bookmark' },
  report: { id: 'status.report', defaultMessage: 'Report @{name}' },
  muteConversation: { id: 'status.mute_conversation', defaultMessage: 'Mute conversation' },
  unmuteConversation: { id: 'status.unmute_conversation', defaultMessage: 'Unmute conversation' },
  pin: { id: 'status.pin', defaultMessage: 'Pin on profile' },
  unpin: { id: 'status.unpin', defaultMessage: 'Unpin from profile' },
  admin_account: { id: 'status.admin_account', defaultMessage: 'Open moderation interface for @{name}' },
  admin_status: { id: 'status.admin_status', defaultMessage: 'Open this post in the moderation interface' },
  admin_domain: { id: 'status.admin_domain', defaultMessage: 'Open moderation interface for {domain}' },
  copy: { id: 'status.copy', defaultMessage: 'Copy link to post' },
  blockDomain: { id: 'account.block_domain', defaultMessage: 'Block domain {domain}' },
  unblockDomain: { id: 'account.unblock_domain', defaultMessage: 'Unblock domain {domain}' },
  unmute: { id: 'account.unmute', defaultMessage: 'Unmute @{name}' },
  unblock: { id: 'account.unblock', defaultMessage: 'Unblock @{name}' },
  filter: { id: 'status.filter', defaultMessage: 'Filter this post' },
  openOriginalPage: { id: 'account.open_original_page', defaultMessage: 'Open original page' },
});

const mapStateToProps = (state, { status }) => ({
  relationship: state.getIn(['relationships', status.getIn(['account', 'id'])]),
});

// @_longwhile — 0 은 숨긴다. IconButton 은 `typeof counter !== 'undefined'` 로만
//   판단해서 0 을 그대로 넘기면 "0" 이 눈에 보이게 찍힌다. 아무도 안 한
//   동작에 숫자가 붙어 있으면 자리만 차지하고, 세 개가 나란히 0 이면
//   액션 바가 숫자판처럼 보인다.
const countOrNone = (count) => (count > 0 ? count : undefined);

class StatusActionBar extends ImmutablePureComponent {
  static propTypes = {
    identity: identityContextPropShape,
    status: ImmutablePropTypes.map.isRequired,
    relationship: ImmutablePropTypes.record,
    onReply: PropTypes.func,
    onFavourite: PropTypes.func,
    onReblog: PropTypes.func,
    onDelete: PropTypes.func,
    onDirect: PropTypes.func,
    onMention: PropTypes.func,
    onMute: PropTypes.func,
    onUnmute: PropTypes.func,
    onBlock: PropTypes.func,
    onUnblock: PropTypes.func,
    onBlockDomain: PropTypes.func,
    onUnblockDomain: PropTypes.func,
    onReport: PropTypes.func,
    onMuteConversation: PropTypes.func,
    onPin: PropTypes.func,
    onBookmark: PropTypes.func,
    onFilter: PropTypes.func,
    onAddFilter: PropTypes.func,
    onInteractionModal: PropTypes.func,
    withDismiss: PropTypes.bool,
    scrollKey: PropTypes.string,
    intl: PropTypes.object.isRequired,
    ...WithRouterPropTypes,
  };

  // Avoid checking props that are functions (and whose equality will always
  // evaluate to false. See react-immutable-pure-component for usage.
  updateOnProps = [
    'status',
    'relationship',
    'withDismiss',
  ];

  handleReplyClick = () => {
    const { signedIn } = this.props.identity;

    if (signedIn) {
      this.props.onReply(this.props.status);
    } else {
      this.props.onInteractionModal('reply', this.props.status);
    }
  };

  handleFavouriteClick = () => {
    const { signedIn } = this.props.identity;

    if (signedIn) {
      this.props.onFavourite(this.props.status);
    } else {
      this.props.onInteractionModal('favourite', this.props.status);
    }
  };

  handleReblogClick = e => {
    const { signedIn } = this.props.identity;

    if (signedIn) {
      this.props.onReblog(this.props.status, e);
    } else {
      this.props.onInteractionModal('reblog', this.props.status);
    }
  };

  handleBookmarkClick = () => {
    this.props.onBookmark(this.props.status);
  };

  handleDeleteClick = () => {
    this.props.onDelete(this.props.status);
  };

  handleRedraftClick = () => {
    this.props.onDelete(this.props.status, true);
  };

  handleEditClick = () => {
    this.props.onEdit(this.props.status);
  };

  handlePinClick = () => {
    this.props.onPin(this.props.status);
  };

  handleMentionClick = () => {
    this.props.onMention(this.props.status.get('account'));
  };

  handleDirectClick = () => {
    this.props.onDirect(this.props.status.get('account'));
  };

  handleMuteClick = () => {
    const { status, relationship, onMute, onUnmute } = this.props;
    const account = status.get('account');

    if (relationship && relationship.get('muting')) {
      onUnmute(account);
    } else {
      onMute(account);
    }
  };

  handleBlockClick = () => {
    const { status, relationship, onBlock, onUnblock } = this.props;
    const account = status.get('account');

    if (relationship && relationship.get('blocking')) {
      onUnblock(account);
    } else {
      onBlock(status);
    }
  };

  handleBlockDomain = () => {
    const { status, onBlockDomain } = this.props;
    const account = status.get('account');

    onBlockDomain(account);
  };

  handleUnblockDomain = () => {
    const { status, onUnblockDomain } = this.props;
    const account = status.get('account');

    onUnblockDomain(account.get('acct').split('@')[1]);
  };

  handleReport = () => {
    this.props.onReport(this.props.status);
  };

  handleConversationMuteClick = () => {
    this.props.onMuteConversation(this.props.status);
  };

  handleFilterClick = () => {
    this.props.onAddFilter(this.props.status);
  };

  handleCopy = () => {
    const url = this.props.status.get('url');
    navigator.clipboard.writeText(url);
  };

  render () {
    // @_longwhile — 재게시·마음에 들어요도 답글처럼 **항상** 숫자를 띄운다.
    //   상류는 `withCounters` 를 넘긴 화면(프로필·둘러보기)에서만 보여 줬는데,
    //   같은 게시물이 홈에서는 숫자가 없고 프로필에서는 있어 서로 다른 게시물처럼
    //   보였다. 답글 숫자는 원래 조건 없이 나온다 — 거기에 맞춘다.
    const { status, relationship, intl, withDismiss, scrollKey } = this.props;
    const { signedIn, permissions } = this.props.identity;

    const publicStatus       = ['public', 'unlisted'].includes(status.get('visibility'));
    const pinnableStatus     = ['public', 'unlisted', 'private'].includes(status.get('visibility'));
    const mutingConversation = status.get('muted');
    const account            = status.get('account');
    const writtenByMe        = status.getIn(['account', 'id']) === me;
    const isRemote           = status.getIn(['account', 'username']) !== status.getIn(['account', 'acct']);

    let menu = [];

    // @_longwhile — "상세 정보 표시" · "공유" · "임베드 코드 보기" 를 뺐다.
    //
    //   상세 정보 표시  게시물을 누르면 어차피 그리로 간다. 메뉴에 한 번 더 두면
    //                   맨 위 자리를 아무도 안 쓰는 항목이 차지한다.
    //   공유            OS 공유 시트를 여는 항목이다. 연합하지 않는 비공개
    //                   인스턴스라 밖으로 내보낼 링크가 뜻이 없다.
    //   임베드 코드     같은 이유. 바깥 웹에 붙일 일이 없다.
    //
    // 원본 페이지 보기는 남긴다 — 원격 글의 출처를 확인하는 경로다.
    // 같은 항목이 상세 화면(features/status/components/action_bar.jsx)에도
    // 있었고 그쪽도 함께 걷었다.

    if (publicStatus && isRemote) {
      menu.push({ text: intl.formatMessage(messages.openOriginalPage), href: status.get('url') });
    }

    menu.push({ text: intl.formatMessage(messages.copy), action: this.handleCopy });

    if (signedIn) {
      menu.push(null);

      if (writtenByMe && pinnableStatus) {
        menu.push({ text: intl.formatMessage(status.get('pinned') ? messages.unpin : messages.pin), action: this.handlePinClick });
        menu.push(null);
      }

      if (writtenByMe || withDismiss) {
        menu.push({ text: intl.formatMessage(mutingConversation ? messages.unmuteConversation : messages.muteConversation), action: this.handleConversationMuteClick });
        menu.push(null);
      }

      if (writtenByMe) {
        menu.push({ text: intl.formatMessage(messages.edit), action: this.handleEditClick });
        menu.push({ text: intl.formatMessage(messages.delete), action: this.handleDeleteClick, dangerous: true });
        menu.push({ text: intl.formatMessage(messages.redraft), action: this.handleRedraftClick, dangerous: true });
      } else {
        menu.push({ text: intl.formatMessage(messages.mention, { name: account.get('username') }), action: this.handleMentionClick });
        menu.push({ text: intl.formatMessage(messages.direct, { name: account.get('username') }), action: this.handleDirectClick });
        menu.push(null);

        if (relationship && relationship.get('muting')) {
          menu.push({ text: intl.formatMessage(messages.unmute, { name: account.get('username') }), action: this.handleMuteClick });
        } else {
          menu.push({ text: intl.formatMessage(messages.mute, { name: account.get('username') }), action: this.handleMuteClick, dangerous: true });
        }

        if (relationship && relationship.get('blocking')) {
          menu.push({ text: intl.formatMessage(messages.unblock, { name: account.get('username') }), action: this.handleBlockClick });
        } else {
          menu.push({ text: intl.formatMessage(messages.block, { name: account.get('username') }), action: this.handleBlockClick, dangerous: true });
        }

        if (!this.props.onFilter) {
          menu.push(null);
          menu.push({ text: intl.formatMessage(messages.filter), action: this.handleFilterClick, dangerous: true });
          menu.push(null);
        }

        menu.push({ text: intl.formatMessage(messages.report, { name: account.get('username') }), action: this.handleReport, dangerous: true });

        if (account.get('acct') !== account.get('username')) {
          const domain = account.get('acct').split('@')[1];

          menu.push(null);

          if (relationship && relationship.get('domain_blocking')) {
            menu.push({ text: intl.formatMessage(messages.unblockDomain, { domain }), action: this.handleUnblockDomain });
          } else {
            menu.push({ text: intl.formatMessage(messages.blockDomain, { domain }), action: this.handleBlockDomain, dangerous: true });
          }
        }

        if ((permissions & PERMISSION_MANAGE_USERS) === PERMISSION_MANAGE_USERS || (isRemote && (permissions & PERMISSION_MANAGE_FEDERATION) === PERMISSION_MANAGE_FEDERATION)) {
          menu.push(null);
          if ((permissions & PERMISSION_MANAGE_USERS) === PERMISSION_MANAGE_USERS) {
            menu.push({ text: intl.formatMessage(messages.admin_account, { name: account.get('username') }), href: `/admin/accounts/${status.getIn(['account', 'id'])}` });
            menu.push({ text: intl.formatMessage(messages.admin_status), href: `/admin/accounts/${status.getIn(['account', 'id'])}/statuses/${status.get('id')}` });
          }
          if (isRemote && (permissions & PERMISSION_MANAGE_FEDERATION) === PERMISSION_MANAGE_FEDERATION) {
            const domain = account.get('acct').split('@')[1];
            menu.push({ text: intl.formatMessage(messages.admin_domain, { domain: domain }), href: `/admin/instances/${domain}` });
          }
        }
      }
    }

    let replyIcon;
    let replyIconComponent;
    let replyTitle;

    if (status.get('in_reply_to_id', null) === null) {
      replyIcon = 'reply';
      replyIconComponent = ReplyIcon;
      replyTitle = intl.formatMessage(messages.reply);
    } else {
      replyIcon = 'reply-all';
      replyIconComponent = ReplyAllIcon;
      replyTitle = intl.formatMessage(messages.replyAll);
    }

    // upstream 은 "내 private 툿"만 재게시할 수 있어서 작성자를 함께 봤다. 이 인스턴스는
    // 모든 툿이 private 이고 남의 것도 재게시할 수 있으므로 범위만 본다. 작성자 조건을
    // 남겨두면 버튼이 통째로 비활성이 되어 재게시가 아예 불가능해진다.
    // 자물쇠 달린 재게시 아이콘은 그대로 쓴다 — 재게시가 겹팔로워에게만 간다는 표시로 맞다.
    const reblogPrivate = status.get('visibility') === 'private';

    let reblogTitle, reblogIconComponent;

    if (status.get('reblogged')) {
      reblogTitle = intl.formatMessage(messages.cancel_reblog_private);
      reblogIconComponent = publicStatus ? RepeatActiveIcon : RepeatPrivateActiveIcon;
    } else if (publicStatus) {
      reblogTitle = intl.formatMessage(messages.reblog);
      reblogIconComponent = RepeatIcon;
    } else if (reblogPrivate) {
      reblogTitle = intl.formatMessage(messages.reblog_private);
      reblogIconComponent = RepeatPrivateIcon;
    } else {
      reblogTitle = intl.formatMessage(messages.cannot_reblog);
      reblogIconComponent = RepeatDisabledIcon;
    }


    const bookmarkTitle = intl.formatMessage(status.get('bookmarked') ? messages.removeBookmark : messages.bookmark);
    const favouriteTitle = intl.formatMessage(status.get('favourited') ? messages.removeFavourite : messages.favourite);
    const isReply = status.get('in_reply_to_account_id') === status.getIn(['account', 'id']);

    return (
      <div className='status__action-bar'>
        <div className='status__action-bar__button-wrapper'>
          <IconButton className='status__action-bar__button' title={replyTitle} icon={isReply ? 'reply' : replyIcon} iconComponent={isReply ? ReplyIcon : replyIconComponent} onClick={this.handleReplyClick} counter={countOrNone(status.get('replies_count'))} />
        </div>
        <div className='status__action-bar__button-wrapper'>
          <IconButton className={classNames('status__action-bar__button', { reblogPrivate })} disabled={!publicStatus && !reblogPrivate} active={status.get('reblogged')} title={reblogTitle} icon='retweet' iconComponent={reblogIconComponent} onClick={this.handleReblogClick} counter={countOrNone(status.get('reblogs_count'))} />
        </div>
        <div className='status__action-bar__button-wrapper'>
          <IconButton className='status__action-bar__button star-icon' animate active={status.get('favourited')} title={favouriteTitle} icon='star' iconComponent={status.get('favourited') ? StarIcon : StarBorderIcon} onClick={this.handleFavouriteClick} counter={countOrNone(status.get('favourites_count'))} />
        </div>
        <div className='status__action-bar__button-wrapper'>
          <IconButton className='status__action-bar__button bookmark-icon' disabled={!signedIn} active={status.get('bookmarked')} title={bookmarkTitle} icon='bookmark' iconComponent={status.get('bookmarked') ? BookmarkIcon : BookmarkBorderIcon} onClick={this.handleBookmarkClick} />
        </div>
        <div className='status__action-bar__button-wrapper'>
          <Dropdown
            scrollKey={scrollKey}
            status={status}
            items={menu}
            icon='ellipsis-h'
            iconComponent={MoreHorizIcon}
            direction='right'
            title={intl.formatMessage(messages.more)}
          />
        </div>
      </div>
    );
  }

}

export default withRouter(withIdentity(connect(mapStateToProps)(injectIntl(StatusActionBar))));
