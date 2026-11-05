import { useCallback, useEffect } from 'react';

import { useIntl, defineMessages } from 'react-intl';

import classNames from 'classnames';

import { useIdentity } from '@/mastodon/identity_context';
import { fetchRelationships, followAccount } from 'mastodon/actions/accounts';
import { openModal } from 'mastodon/actions/modal';
import { Button } from 'mastodon/components/button';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import { me } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  unfollow: { id: 'account.unfollow', defaultMessage: 'Unfollow' },
  // @_longwhile — 팔로우 중일 때의 **평소** 라벨. 호버하면 "언팔로우" 로 바뀐다.
  //   예전에는 평소에도 "언팔로우" 라고 적혀 있었는데, 그러면 버튼이 현재 상태가
  //   아니라 **누르면 일어날 일**만 말한다. 관계를 확인하러 온 사람에게는
  //   "지금 팔로우 중이다" 가 먼저 필요하다.
  following: { id: 'account.following', defaultMessage: 'Following' },
  follow: { id: 'account.follow', defaultMessage: 'Follow' },
  followBack: { id: 'account.follow_back', defaultMessage: 'Follow back' },
  editProfile: { id: 'account.edit_profile', defaultMessage: 'Edit profile' },
  // @_longwhile — 승인제 계정에 요청만 보낸 상태. 아직 팔로우가 아니므로
  // "언팔로우" 라고 쓰면 거짓말이 된다.
  pending: { id: 'account.follow_pending', defaultMessage: 'Pending' },
  pendingHint: {
    id: 'account.requested',
    defaultMessage: 'Awaiting approval. Click to cancel follow request',
  },
});

export const FollowButton: React.FC<{
  accountId?: string;
  compact?: boolean;
}> = ({ accountId, compact }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const { signedIn } = useIdentity();
  const account = useAppSelector((state) =>
    accountId ? state.accounts.get(accountId) : undefined,
  );
  const relationship = useAppSelector((state) =>
    accountId ? state.relationships.get(accountId) : undefined,
  );
  // 요청만 걸린 상태(requested)와 실제 팔로우(following)를 가른다. 아래에서
  // 라벨·색·툴팁이 서로 다르게 갈리므로 여기서 한 번만 읽는다.
  const isFollowing = Boolean(relationship?.following);
  const requested = Boolean(relationship?.requested);
  const following = isFollowing || requested;

  useEffect(() => {
    if (accountId && signedIn) {
      dispatch(fetchRelationships([accountId]));
    }
  }, [dispatch, accountId, signedIn]);

  const handleClick = useCallback(() => {
    if (!signedIn) {
      dispatch(
        openModal({
          modalType: 'INTERACTION',
          modalProps: {
            type: 'follow',
            accountId: accountId,
            url: account?.url,
          },
        }),
      );
    }

    if (!relationship || !accountId) return;

    if (accountId === me) {
      return;
    } else if (account && (relationship.following || relationship.requested)) {
      dispatch(
        openModal({ modalType: 'CONFIRM_UNFOLLOW', modalProps: { account } }),
      );
    } else {
      dispatch(followAccount(accountId));
    }
  }, [dispatch, accountId, relationship, account, signedIn]);

  let label;

  if (!signedIn) {
    label = intl.formatMessage(messages.follow);
  } else if (accountId === me) {
    label = intl.formatMessage(messages.editProfile);
  } else if (!relationship) {
    label = <LoadingIndicator />;
  } else if (requested) {
    // 팔로우가 아니라 **요청이 걸려 있는** 상태다. 취소는 여전히 이 버튼으로 한다.
    label = intl.formatMessage(messages.pending);
  } else if (isFollowing) {
    // 평소에는 "팔로잉", 마우스를 올리면 "언팔로우".
    //
    // **두 글자를 다 그리고 CSS 로 갈아 끼운다.** JS 로 호버 상태를 들면
    // 키보드 포커스에서 안 바뀌고, 터치 기기에서 한 번 눌러 hover 가 붙은
    // 채로 남는다. 그리고 두 라벨을 격자 한 칸에 겹쳐 두어 **버튼 폭이 둘 중
    // 넓은 쪽으로 고정된다** — 갈아 끼울 때 버튼이 늘었다 줄지 않는다.
    label = (
      <span className='follow-button__labels'>
        <span className='follow-button__labels__rest'>
          {intl.formatMessage(messages.following)}
        </span>
        <span className='follow-button__labels__hover' aria-hidden='true'>
          {intl.formatMessage(messages.unfollow)}
        </span>
      </span>
    );
  } else if (relationship.followed_by) {
    label = intl.formatMessage(messages.followBack);
  } else {
    label = intl.formatMessage(messages.follow);
  }

  if (accountId === me) {
    return (
      <a
        href='/settings/profile'
        target='_blank'
        rel='noopener'
        className={classNames('button button-secondary', {
          'button--compact': compact,
        })}
      >
        {label}
      </a>
    );
  }

  return (
    <Button
      onClick={handleClick}
      title={requested ? intl.formatMessage(messages.pendingHint) : undefined}
      disabled={
        relationship?.blocked_by ||
        relationship?.blocking ||
        (!(relationship?.following || relationship?.requested) &&
          (account?.suspended || !!account?.moved))
      }
      secondary={following}
      compact={compact}
      // 대기 중에는 붉게 칠하지 않는다. 아직 끊을 관계가 없고, 누르면 요청을
      // 취소하는 것이지 팔로우를 끊는 것이 아니다.
      //
      // `button--destructive` 를 쓰지 않는다. 그것은 **늘** 붉은 단추인데, 우리는
      // 평소에 투명 알약이었다가 **호버에서만** 붉어져야 한다. 상태 넷의 모양을
      // 한자리에 모아 두려고 전용 클래스를 쓴다(components.scss).
      className={
        isFollowing && !requested ? 'follow-button--following' : undefined
      }
    >
      {label}
    </Button>
  );
};
