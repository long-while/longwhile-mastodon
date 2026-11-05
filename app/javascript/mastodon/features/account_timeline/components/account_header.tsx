import { useCallback, useMemo } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import classNames from 'classnames';
import { Helmet } from 'react-helmet';
import { NavLink, useHistory } from 'react-router-dom';

// @_longwhile — 프로필 헤더 버튼 줄의 아이콘 넷. 넷 다 원본이
// `styles/bird-theme-svg/` 에 있고 **테마가 그것을 `mask-image` 로 쓰고 있어**
// 옮기지 못한다. 여기 것은 사본이다 — 원본을 고치면 사본도 함께 고쳐야 한다.
//   `action-bar-dots` 만 선(stroke)으로 그린다. 전역 `.icon path { fill:
//   currentColor }` 가 그대로 걸리면 점 세 개가 반지름 1px 로 쪼그라들므로,
//   components.scss 에서 그 줄의 stroke 를 되살린다.
import DotsIcon from '@/images/action-bar-dots.svg?react';
import NotificationsActiveIcon from '@/images/bell-fill.svg?react';
import NotificationsIcon from '@/images/bell.svg?react';
import ChatIcon from '@/images/envelope.svg?react';
import CheckIcon from '@/material-icons/400-24px/check.svg?react';
import LockIcon from '@/styles/bird-theme-svg/lock-fill.svg?react';
import {
  followAccount,
  unblockAccount,
  unmuteAccount,
  removeAccountFromFollowers,
} from 'mastodon/actions/accounts';
import { initBlockModal } from 'mastodon/actions/blocks';
import { mentionCompose } from 'mastodon/actions/compose';
import { createDmRoom } from 'mastodon/actions/dm_rooms';
import {
  initDomainBlockModal,
  unblockDomain,
} from 'mastodon/actions/domain_blocks';
import { openModal } from 'mastodon/actions/modal';
import { initMuteModal } from 'mastodon/actions/mutes';
import { initReport } from 'mastodon/actions/reports';
import { Avatar } from 'mastodon/components/avatar';
import { Badge, AutomatedBadge, GroupBadge } from 'mastodon/components/badge';
import { Button } from 'mastodon/components/button';
import {
  FollowersCounter,
  FollowingCounter,
  StatusesCounter,
} from 'mastodon/components/counters';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { FollowButton } from 'mastodon/components/follow_button';
import { FormattedDateWrapper } from 'mastodon/components/formatted_date';
import { Icon } from 'mastodon/components/icon';
import { IconButton } from 'mastodon/components/icon_button';
import { ShortNumber } from 'mastodon/components/short_number';
import { DomainPill } from 'mastodon/features/account/components/domain_pill';
import AccountNoteContainer from 'mastodon/features/account/containers/account_note_container';
import FollowRequestNoteContainer from 'mastodon/features/account/containers/follow_request_note_container';
import { useLinks } from 'mastodon/hooks/useLinks';
import { useIdentity } from 'mastodon/identity_context';
import {
  autoPlayGif,
  me,
  domain as localDomain,
  dmChatEnabled,
} from 'mastodon/initial_state';
import type { Account } from 'mastodon/models/account';
import type { MenuItem } from 'mastodon/models/dropdown_menu';
import {
  PERMISSION_MANAGE_USERS,
  PERMISSION_MANAGE_FEDERATION,
} from 'mastodon/permissions';
import { getAccountHidden } from 'mastodon/selectors/accounts';
import { useAppSelector, useAppDispatch } from 'mastodon/store';

import { FamiliarFollowers } from './familiar_followers';
import { MemorialNote } from './memorial_note';
import { MovedNote } from './moved_note';

const messages = defineMessages({
  unblock: { id: 'account.unblock', defaultMessage: 'Unblock @{name}' },
  edit_profile: { id: 'account.edit_profile', defaultMessage: 'Edit profile' },
  linkVerifiedOn: {
    id: 'account.link_verified_on',
    defaultMessage: 'Ownership of this link was checked on {date}',
  },
  account_locked: {
    id: 'account.locked_info',
    defaultMessage:
      'This account privacy status is set to locked. The owner manually reviews who can follow them.',
  },
  chat: { id: 'account.chat', defaultMessage: 'Message @{name}' },
  mention: { id: 'account.mention', defaultMessage: 'Mention @{name}' },
  unmute: { id: 'account.unmute', defaultMessage: 'Unmute @{name}' },
  block: { id: 'account.block', defaultMessage: 'Block @{name}' },
  mute: { id: 'account.mute', defaultMessage: 'Mute @{name}' },
  report: { id: 'account.report', defaultMessage: 'Report @{name}' },
  media: { id: 'account.media', defaultMessage: 'Media' },
  blockDomain: {
    id: 'account.block_domain',
    defaultMessage: 'Block domain {domain}',
  },
  unblockDomain: {
    id: 'account.unblock_domain',
    defaultMessage: 'Unblock domain {domain}',
  },
  hideReblogs: {
    id: 'account.hide_reblogs',
    defaultMessage: 'Hide boosts from @{name}',
  },
  showReblogs: {
    id: 'account.show_reblogs',
    defaultMessage: 'Show boosts from @{name}',
  },
  enableNotifications: {
    id: 'account.enable_notifications',
    defaultMessage: 'Notify me when @{name} posts',
  },
  disableNotifications: {
    id: 'account.disable_notifications',
    defaultMessage: 'Stop notifying me when @{name} posts',
  },
  preferences: {
    id: 'navigation_bar.preferences',
    defaultMessage: 'Preferences',
  },
  follow_requests: {
    id: 'navigation_bar.follow_requests',
    defaultMessage: 'Follow requests',
  },
  favourites: { id: 'navigation_bar.favourites', defaultMessage: 'Favorites' },
  lists: { id: 'navigation_bar.lists', defaultMessage: 'Lists' },
  followed_tags: {
    id: 'navigation_bar.followed_tags',
    defaultMessage: 'Followed hashtags',
  },
  blocks: { id: 'navigation_bar.blocks', defaultMessage: 'Blocked users' },
  domain_blocks: {
    id: 'navigation_bar.domain_blocks',
    defaultMessage: 'Blocked domains',
  },
  mutes: { id: 'navigation_bar.mutes', defaultMessage: 'Muted users' },
  add_or_remove_from_list: {
    id: 'account.add_or_remove_from_list',
    defaultMessage: 'Add or Remove from lists',
  },
  admin_account: {
    id: 'status.admin_account',
    defaultMessage: 'Open moderation interface for @{name}',
  },
  admin_domain: {
    id: 'status.admin_domain',
    defaultMessage: 'Open moderation interface for {domain}',
  },
  openOriginalPage: {
    id: 'account.open_original_page',
    defaultMessage: 'Open original page',
  },
  removeFromFollowers: {
    id: 'account.remove_from_followers',
    defaultMessage: 'Remove {name} from followers',
  },
  confirmRemoveFromFollowersTitle: {
    id: 'confirmations.remove_from_followers.title',
    defaultMessage: 'Remove follower?',
  },
  confirmRemoveFromFollowersMessage: {
    id: 'confirmations.remove_from_followers.message',
    defaultMessage:
      '{name} will stop following you. Are you sure you want to proceed?',
  },
  confirmRemoveFromFollowersButton: {
    id: 'confirmations.remove_from_followers.confirm',
    defaultMessage: 'Remove follower',
  },
});

const titleFromAccount = (account: Account) => {
  const displayName = account.display_name;
  const acct =
    account.acct === account.username
      ? `${account.username}@${localDomain}`
      : account.acct;
  const prefix =
    displayName.trim().length === 0 ? account.username : displayName;

  return `${prefix} (@${acct})`;
};

const dateFormatOptions: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export const AccountHeader: React.FC<{
  accountId: string;
  hideTabs?: boolean;
}> = ({ accountId, hideTabs }) => {
  const dispatch = useAppDispatch();
  const history = useHistory();
  const intl = useIntl();
  const { signedIn, permissions } = useIdentity();
  const account = useAppSelector((state) => state.accounts.get(accountId));
  const relationship = useAppSelector((state) =>
    state.relationships.get(accountId),
  );
  const hidden = useAppSelector((state) => getAccountHidden(state, accountId));
  const handleLinkClick = useLinks();

  const handleBlock = useCallback(() => {
    if (!account) {
      return;
    }

    if (relationship?.blocking) {
      dispatch(unblockAccount(account.id));
    } else {
      dispatch(initBlockModal(account));
    }
  }, [dispatch, account, relationship]);

  const handleMention = useCallback(() => {
    if (!account) {
      return;
    }

    dispatch(mentionCompose(account));
  }, [dispatch, account]);

  const handleReport = useCallback(() => {
    if (!account) {
      return;
    }

    dispatch(initReport(account));
  }, [dispatch, account]);

  const handleReblogToggle = useCallback(() => {
    if (!account) {
      return;
    }

    if (relationship?.showing_reblogs) {
      dispatch(followAccount(account.id, { reblogs: false }));
    } else {
      dispatch(followAccount(account.id, { reblogs: true }));
    }
  }, [dispatch, account, relationship]);

  // @_longwhile — 프로필에서 바로 대화방으로. 서버가 find_or_create 라 이미 있는
  // 방이면 그 방이 그대로 온다.
  //   dispatch 의 반환 타입이 살아 있지 않다(이 저장소의 rootReducer 가 any 다).
  //   recipient_modal.tsx 와 같은 방식으로 형태만 다시 붙인다.
  //   `account.id` 가 아니라 prop 인 `accountId` 를 쓴다. 이 파일에서 `account` 는
  //   타입이 풀리지 않아(파일 전체가 그렇다) 거기서 꺼낸 값은 any 로 샌다.
  const handleChat = useCallback(() => {
    const pending = dispatch(
      createDmRoom({ accountIds: [accountId] }),
    ) as unknown as Promise<{
      meta: { requestStatus: string };
      payload?: { id: string };
    }>;

    void pending.then((result) => {
      // 실패 알림은 errorsMiddleware 가 이미 띄운다. 여기서 또 띄우면 두 번 뜬다.
      if (result.meta.requestStatus === 'fulfilled' && result.payload) {
        history.push(`/messages/${result.payload.id}`);
      }

      return result;
    });
  }, [accountId, dispatch, history]);

  const handleNotifyToggle = useCallback(() => {
    if (!account) {
      return;
    }

    if (relationship?.notifying) {
      dispatch(followAccount(account.id, { notify: false }));
    } else {
      dispatch(followAccount(account.id, { notify: true }));
    }
  }, [dispatch, account, relationship]);

  const handleMute = useCallback(() => {
    if (!account) {
      return;
    }

    if (relationship?.muting) {
      dispatch(unmuteAccount(account.id));
    } else {
      dispatch(initMuteModal(account));
    }
  }, [dispatch, account, relationship]);

  const handleBlockDomain = useCallback(() => {
    if (!account) {
      return;
    }

    dispatch(initDomainBlockModal(account));
  }, [dispatch, account]);

  const handleUnblockDomain = useCallback(() => {
    if (!account) {
      return;
    }

    const domain = account.acct.split('@')[1];

    if (!domain) {
      return;
    }

    dispatch(unblockDomain(domain));
  }, [dispatch, account]);

  const handleAddToList = useCallback(() => {
    if (!account) {
      return;
    }

    dispatch(
      openModal({
        modalType: 'LIST_ADDER',
        modalProps: {
          accountId: account.id,
        },
      }),
    );
  }, [dispatch, account]);

  const handleOpenAvatar = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey) {
        return;
      }

      e.preventDefault();

      if (!account) {
        return;
      }

      dispatch(
        openModal({
          modalType: 'IMAGE',
          modalProps: {
            src: account.avatar,
            alt: '',
          },
        }),
      );
    },
    [dispatch, account],
  );


  const handleMouseEnter = useCallback(
    ({ currentTarget }: React.MouseEvent) => {
      if (autoPlayGif) {
        return;
      }

      currentTarget
        .querySelectorAll<HTMLImageElement>('.custom-emoji')
        .forEach((emoji) => {
          emoji.src = emoji.getAttribute('data-original') ?? '';
        });
    },
    [],
  );

  const handleMouseLeave = useCallback(
    ({ currentTarget }: React.MouseEvent) => {
      if (autoPlayGif) {
        return;
      }

      currentTarget
        .querySelectorAll<HTMLImageElement>('.custom-emoji')
        .forEach((emoji) => {
          emoji.src = emoji.getAttribute('data-static') ?? '';
        });
    },
    [],
  );

  const suspended = account?.suspended;
  const isRemote = account?.acct !== account?.username;
  const remoteDomain = isRemote ? account?.acct.split('@')[1] : null;

  const menu = useMemo(() => {
    const arr: MenuItem[] = [];

    if (!account) {
      return arr;
    }

    if (signedIn && account.id !== me && !account.suspended) {
      arr.push({
        text: intl.formatMessage(messages.mention, {
          name: account.username,
        }),
        action: handleMention,
      });
      // @_longwhile — "다이렉트 메시지" 를 뺐다. 이 서버에는 채팅이 있고, 같은
      // 줄의 채팅 버튼이 그 자리를 대신한다. 둘을 함께 두면 어느 쪽이 진짜
      // 대화인지 알 수 없다(하나는 공개 범위가 달린 툿 작성창으로 간다).
      arr.push(null);
    }

    if (isRemote) {
      arr.push({
        text: intl.formatMessage(messages.openOriginalPage),
        href: account.url,
      });
      arr.push(null);
    }

    if (account.id === me) {
      arr.push({
        text: intl.formatMessage(messages.edit_profile),
        href: '/settings/profile',
      });
      arr.push({
        text: intl.formatMessage(messages.preferences),
        href: '/settings/preferences',
      });
      arr.push(null);
      arr.push({
        text: intl.formatMessage(messages.follow_requests),
        to: '/follow_requests',
      });
      arr.push({
        text: intl.formatMessage(messages.favourites),
        to: '/favourites',
      });
      arr.push({ text: intl.formatMessage(messages.lists), to: '/lists' });
      arr.push({
        text: intl.formatMessage(messages.followed_tags),
        to: '/followed_tags',
      });
      arr.push(null);
      arr.push({ text: intl.formatMessage(messages.mutes), to: '/mutes' });
      arr.push({ text: intl.formatMessage(messages.blocks), to: '/blocks' });
      arr.push({
        text: intl.formatMessage(messages.domain_blocks),
        to: '/domain_blocks',
      });
    } else if (signedIn) {
      if (relationship?.following) {
        if (!relationship.muting) {
          if (relationship.showing_reblogs) {
            arr.push({
              text: intl.formatMessage(messages.hideReblogs, {
                name: account.username,
              }),
              action: handleReblogToggle,
            });
          } else {
            arr.push({
              text: intl.formatMessage(messages.showReblogs, {
                name: account.username,
              }),
              action: handleReblogToggle,
            });
          }

          // @_longwhile — "구독한 언어 변경" 을 뺐다. 이 서버는 연합하지 않아
          // 다른 언어의 글이 들어올 일이 없다.
          arr.push(null);
        }

        // @_longwhile — "프로필에 추천하기" 를 뺐다.
        arr.push({
          text: intl.formatMessage(messages.add_or_remove_from_list),
          action: handleAddToList,
        });
        arr.push(null);
      }

      if (relationship?.followed_by) {
        const handleRemoveFromFollowers = () => {
          dispatch(
            openModal({
              modalType: 'CONFIRM',
              modalProps: {
                title: intl.formatMessage(
                  messages.confirmRemoveFromFollowersTitle,
                ),
                message: intl.formatMessage(
                  messages.confirmRemoveFromFollowersMessage,
                  { name: <strong>{account.acct}</strong> },
                ),
                confirm: intl.formatMessage(
                  messages.confirmRemoveFromFollowersButton,
                ),
                onConfirm: () => {
                  void dispatch(removeAccountFromFollowers({ accountId }));
                },
              },
            }),
          );
        };

        arr.push({
          text: intl.formatMessage(messages.removeFromFollowers, {
            name: account.username,
          }),
          action: handleRemoveFromFollowers,
          dangerous: true,
        });
      }

      if (relationship?.muting) {
        arr.push({
          text: intl.formatMessage(messages.unmute, {
            name: account.username,
          }),
          action: handleMute,
        });
      } else {
        arr.push({
          text: intl.formatMessage(messages.mute, {
            name: account.username,
          }),
          action: handleMute,
          dangerous: true,
        });
      }

      if (relationship?.blocking) {
        arr.push({
          text: intl.formatMessage(messages.unblock, {
            name: account.username,
          }),
          action: handleBlock,
        });
      } else {
        arr.push({
          text: intl.formatMessage(messages.block, {
            name: account.username,
          }),
          action: handleBlock,
          dangerous: true,
        });
      }

      if (!account.suspended) {
        arr.push({
          text: intl.formatMessage(messages.report, {
            name: account.username,
          }),
          action: handleReport,
          dangerous: true,
        });
      }
    }

    if (signedIn && isRemote) {
      arr.push(null);

      if (relationship?.domain_blocking) {
        arr.push({
          text: intl.formatMessage(messages.unblockDomain, {
            domain: remoteDomain,
          }),
          action: handleUnblockDomain,
        });
      } else {
        arr.push({
          text: intl.formatMessage(messages.blockDomain, {
            domain: remoteDomain,
          }),
          action: handleBlockDomain,
          dangerous: true,
        });
      }
    }

    if (
      (account.id !== me &&
        (permissions & PERMISSION_MANAGE_USERS) === PERMISSION_MANAGE_USERS) ||
      (isRemote &&
        (permissions & PERMISSION_MANAGE_FEDERATION) ===
          PERMISSION_MANAGE_FEDERATION)
    ) {
      arr.push(null);
      if ((permissions & PERMISSION_MANAGE_USERS) === PERMISSION_MANAGE_USERS) {
        arr.push({
          text: intl.formatMessage(messages.admin_account, {
            name: account.username,
          }),
          href: `/admin/accounts/${account.id}`,
        });
      }
      if (
        isRemote &&
        (permissions & PERMISSION_MANAGE_FEDERATION) ===
          PERMISSION_MANAGE_FEDERATION
      ) {
        arr.push({
          text: intl.formatMessage(messages.admin_domain, {
            domain: remoteDomain,
          }),
          href: `/admin/instances/${remoteDomain}`,
        });
      }
    }

    return arr;
  }, [
    dispatch,
    accountId,
    account,
    relationship,
    permissions,
    isRemote,
    remoteDomain,
    intl,
    signedIn,
    handleAddToList,
    handleBlock,
    handleBlockDomain,
    handleMention,
    handleMute,
    handleReblogToggle,
    handleReport,
    handleUnblockDomain,
  ]);

  if (!account) {
    return null;
  }

  let actionBtn: React.ReactNode,
    bellBtn: React.ReactNode,
    lockedIcon: React.ReactNode;

  const info: React.ReactNode[] = [];

  if (me !== account.id && relationship) {
    if (
      relationship.followed_by &&
      (relationship.following || relationship.requested)
    ) {
      info.push(
        <span key='mutual' className='relationship-tag'>
          <FormattedMessage
            id='account.mutual'
            defaultMessage='You follow each other'
          />
        </span>,
      );
    } else if (relationship.followed_by) {
      info.push(
        <span key='followed_by' className='relationship-tag'>
          <FormattedMessage
            id='account.follows_you'
            defaultMessage='Follows you'
          />
        </span>,
      );
    } else if (relationship.requested_by) {
      info.push(
        <span key='requested_by' className='relationship-tag'>
          <FormattedMessage
            id='account.requests_to_follow_you'
            defaultMessage='Requests to follow you'
          />
        </span>,
      );
    }

    if (relationship.blocking) {
      info.push(
        <span key='blocking' className='relationship-tag'>
          <FormattedMessage id='account.blocking' defaultMessage='Blocking' />
        </span>,
      );
    }

    if (relationship.muting) {
      info.push(
        <span key='muting' className='relationship-tag'>
          <FormattedMessage id='account.muting' defaultMessage='Muting' />
        </span>,
      );
    }

    if (relationship.domain_blocking) {
      info.push(
        <span key='domain_blocking' className='relationship-tag'>
          <FormattedMessage
            id='account.domain_blocking'
            defaultMessage='Blocking domain'
          />
        </span>,
      );
    }
  }

  // @_longwhile — 채팅. 남의 프로필에서만, 로그인했을 때만, 기능이 켜져 있을 때만.
  // 내 프로필에 나에게 말 거는 버튼을 두지 않는다.
  let chatBtn: React.ReactNode;

  if (dmChatEnabled && signedIn && accountId !== me) {
    chatBtn = (
      <IconButton
        icon='envelope'
        iconComponent={ChatIcon}
        title={intl.formatMessage(messages.chat, { name: account.username })}
        onClick={handleChat}
      />
    );
  }

  if (relationship?.requested || relationship?.following) {
    bellBtn = (
      <IconButton
        icon={relationship.notifying ? 'bell' : 'bell-o'}
        iconComponent={
          relationship.notifying ? NotificationsActiveIcon : NotificationsIcon
        }
        active={relationship.notifying}
        title={intl.formatMessage(
          relationship.notifying
            ? messages.disableNotifications
            : messages.enableNotifications,
          { name: account.username },
        )}
        onClick={handleNotifyToggle}
      />
    );
  }

  if (relationship?.blocking) {
    actionBtn = (
      <Button
        text={intl.formatMessage(messages.unblock, {
          name: account.username,
        })}
        onClick={handleBlock}
      />
    );
  } else {
    actionBtn = <FollowButton accountId={accountId} />;
  }

  if (account.moved && !relationship?.following) {
    actionBtn = '';
  }

  if (account.locked) {
    lockedIcon = (
      <Icon
        id='lock'
        icon={LockIcon}
        // 계정 줄(components/account.tsx)과 같은 클래스를 붙인다. 아래 SCSS 가
        // 이 클래스 하나로 두 자리의 "보호 경로" 를 함께 처리한다.
        className='account__locked-icon'
        title={intl.formatMessage(messages.account_locked)}
      />
    );
  }

  const content = { __html: account.note_emojified };
  const displayNameHtml = { __html: account.display_name_html };
  const fields = account.fields;
  const isLocal = !account.acct.includes('@');
  const username = account.acct.split('@')[0];
  const domain = isLocal ? localDomain : account.acct.split('@')[1];
  const isIndexable = !account.noindex;

  const badges = [];

  if (account.bot) {
    badges.push(<AutomatedBadge key='bot-badge' />);
  } else if (account.group) {
    badges.push(<GroupBadge key='group-badge' />);
  }

  account.roles.forEach((role) => {
    badges.push(
      <Badge
        key={`role-badge-${role.get('id')}`}
        label={<span>{role.get('name')}</span>}
        domain={domain}
        roleId={role.get('id')}
      />,
    );
  });

  return (
    <div className='account-timeline__header'>
      {!hidden && account.memorial && <MemorialNote />}
      {!hidden && account.moved && (
        <MovedNote accountId={account.id} targetAccountId={account.moved} />
      )}

      <div
        className={classNames('account__header', {
          inactive: !!account.moved,
        })}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {!(suspended || hidden || account.moved) &&
          relationship?.requested_by && (
            <FollowRequestNoteContainer account={account} />
          )}

        {/* @_longwhile — 관계 태그("맞팔로우 중입니다" 등)를 헤더 이미지 위에서
            뺐다. 핸들 옆으로 옮겼다(아래 `account__header__tabs__name`).
            배너 위에 떠 있으면 배너 그림에 따라 읽히기도 안 읽히기도 하고,
            "누구인가"(이름·핸들)와 "나와 무슨 사이인가"가 화면 양 끝으로
            갈라져 있었다. */}
        <div className='account__header__image'>

          {!(suspended || hidden) && (
            <img
              src={autoPlayGif ? account.header : account.header_static}
              alt=''
              className='parallax'
            />
          )}
        </div>

        <div className='account__header__bar'>
          <div className='account__header__tabs'>
            <a
              className='avatar'
              href={account.avatar}
              rel='noopener'
              target='_blank'
              onClick={handleOpenAvatar}
            >
              <Avatar
                account={suspended || hidden ? undefined : account}
                size={90}
              />
            </a>

            {/* @_longwhile — 순서는 더보기 · 채팅 · 알림 · 팔로우다.
                오른쪽 끝의 팔로우/언팔로우가 이 줄에서 가장 자주 눌리는 것이라
                제자리를 지키고, 그 앞을 자주 쓰는 순서로 채운다. */}
            <div className='account__header__tabs__buttons'>
              <Dropdown
                disabled={menu.length === 0}
                items={menu}
                icon='ellipsis-v'
                iconComponent={DotsIcon}
              />
              {!hidden && chatBtn}
              {!hidden && bellBtn}
              {!hidden && actionBtn}
            </div>
          </div>

          <div className='account__header__tabs__name'>
            <h1>
              {/* @_longwhile — 자물쇠는 **닉네임 옆**이다. 핸들 옆이 아니다.
                  잠금은 그 사람의 성질이지 핸들의 성질이 아니고, 핸들 줄에는
                  이미 도메인 알약과 관계 태그가 있어 하나 더 붙으면 무엇이
                  무엇에 걸린 표시인지 읽히지 않는다. */}
              <span dangerouslySetInnerHTML={displayNameHtml} />
              {lockedIcon}
              <small>
                <span>
                  @{username}
                  <span className='invisible'>@{domain}</span>
                </span>
                <DomainPill
                  username={username ?? ''}
                  domain={domain ?? ''}
                  isSelf={me === account.id}
                />

                {/* 관계 태그가 핸들 바로 옆에 온다. 배너 위가 아니라 여기가
                    맞는 자리다 — "누구인가" 와 "나와 무슨 사이인가" 는 함께
                    읽히는 정보다. 간격은 SCSS 가 준다. */}
                {info}
              </small>
            </h1>
          </div>

          {badges.length > 0 && (
            <div className='account__header__badges'>{badges}</div>
          )}

          {account.id !== me && signedIn && (
            <FamiliarFollowers accountId={accountId} />
          )}

          {!(suspended || hidden) && (
            <div className='account__header__extra'>
              <div
                className='account__header__bio'
                onClickCapture={handleLinkClick}
              >
                {account.id !== me && signedIn && (
                  <AccountNoteContainer accountId={accountId} />
                )}

                {account.note.length > 0 && account.note !== '<p></p>' && (
                  <div
                    className='account__header__content translate'
                    dangerouslySetInnerHTML={content}
                  />
                )}

                <div className='account__header__fields'>
                  <dl>
                    <dt>
                      <FormattedMessage
                        id='account.joined_short'
                        defaultMessage='Joined'
                      />
                    </dt>
                    <dd>
                      <FormattedDateWrapper
                        value={account.created_at}
                        year='numeric'
                        month='short'
                        day='2-digit'
                      />
                    </dd>
                  </dl>

                  {fields.map((pair, i) => (
                    <dl
                      key={i}
                      className={classNames({
                        verified: pair.verified_at,
                      })}
                    >
                      <dt
                        dangerouslySetInnerHTML={{
                          __html: pair.name_emojified,
                        }}
                        title={pair.name}
                        className='translate'
                      />

                      <dd className='translate' title={pair.value_plain ?? ''}>
                        {pair.verified_at && (
                          <span
                            title={intl.formatMessage(messages.linkVerifiedOn, {
                              date: intl.formatDate(
                                pair.verified_at,
                                dateFormatOptions,
                              ),
                            })}
                          >
                            <Icon
                              id='check'
                              icon={CheckIcon}
                              className='verified__mark'
                            />
                          </span>
                        )}{' '}
                        <span
                          dangerouslySetInnerHTML={{
                            __html: pair.value_emojified,
                          }}
                        />
                      </dd>
                    </dl>
                  ))}
                </div>
              </div>

              <div className='account__header__extra__links'>
                <NavLink
                  to={`/@${account.acct}`}
                  title={intl.formatNumber(account.statuses_count)}
                >
                  <ShortNumber
                    value={account.statuses_count}
                    renderer={StatusesCounter}
                  />
                </NavLink>

                <NavLink
                  exact
                  to={`/@${account.acct}/following`}
                  title={intl.formatNumber(account.following_count)}
                >
                  <ShortNumber
                    value={account.following_count}
                    renderer={FollowingCounter}
                  />
                </NavLink>

                <NavLink
                  exact
                  to={`/@${account.acct}/followers`}
                  title={intl.formatNumber(account.followers_count)}
                >
                  <ShortNumber
                    value={account.followers_count}
                    renderer={FollowersCounter}
                  />
                </NavLink>
              </div>
            </div>
          )}
        </div>
      </div>

      {!(hideTabs || hidden) && (
        <div className='account__section-headline'>
          {/* Featured 탭 제거 */}
          {/*
          <NavLink exact to={`/@${account.acct}/featured`}>
            <FormattedMessage id='account.featured' defaultMessage='Featured' />
          </NavLink>
          */}
          <NavLink exact to={`/@${account.acct}`}>
            <FormattedMessage id='account.posts' defaultMessage='Posts' />
          </NavLink>
          <NavLink exact to={`/@${account.acct}/with_replies`}>
            <FormattedMessage
              id='account.posts_with_replies'
              defaultMessage='Posts and replies'
            />
          </NavLink>
          <NavLink exact to={`/@${account.acct}/media`}>
            <FormattedMessage id='account.media' defaultMessage='Media' />
          </NavLink>
          {/* Own profile only: favourites are private, and the API has no way
              to ask for anyone else's. */}
          {account.id === me && (
            <NavLink exact to={`/@${account.acct}/favourites`}>
              <FormattedMessage
                id='account.favourites'
                defaultMessage='Likes'
              />
            </NavLink>
          )}
        </div>
      )}

      <Helmet>
        <title>{titleFromAccount(account)}</title>
        <meta
          name='robots'
          content={isLocal && isIndexable ? 'all' : 'noindex'}
        />
        <link rel='canonical' href={account.url} />
      </Helmet>
    </div>
  );
};
