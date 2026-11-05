import { FormattedMessage } from 'react-intl';

import { createSelector } from '@reduxjs/toolkit';

import { animated, useSpring } from '@react-spring/web';

import { useAppSelector } from 'mastodon/store';
import type { RootState } from 'mastodon/store';
import { HASHTAG_PATTERN_REGEX } from 'mastodon/utils/hashtags';

// 잠금 안내(compose_form.lock_disclaimer)는 뺐다. 모든 툿이 팔로워 전용이고
// 잠금은 팔로우 승인 여부만 정하므로, "누구나 팔로우해 볼 수 있다"는 경고가
// 이제 사실이 아니다.
const selector = createSelector(
  (state: RootState) => state.compose.get('privacy') as string,
  (state: RootState) => state.compose.get('text') as string,
  (privacy, text) => ({
    hashtagWarning: privacy !== 'public' && HASHTAG_PATTERN_REGEX.test(text),
    directMessageWarning: privacy === 'direct',
  }),
);

export const Warning = () => {
  const { hashtagWarning, directMessageWarning } = useAppSelector(selector);

  if (hashtagWarning) {
    return (
      <WarningMessage>
        <FormattedMessage
          id='compose_form.hashtag_warning'
          defaultMessage="This post won't be listed under any hashtag as it is unlisted. Only public posts can be searched by hashtag."
        />
      </WarningMessage>
    );
  }

  if (directMessageWarning) {
    return (
      <WarningMessage>
        <FormattedMessage
          id='compose_form.encryption_warning'
          defaultMessage='Posts on Mastodon are not end-to-end encrypted. Do not share any dangerous information over Mastodon.'
        />
      </WarningMessage>
    );
  }

  return null;
};

export const WarningMessage: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const styles = useSpring({
    from: {
      opacity: 0,
      transform: 'scale(0.85, 0.75)',
    },
    to: {
      opacity: 1,
      transform: 'scale(1, 1)',
    },
  });
  return (
    <animated.div className='compose-form__warning' style={styles}>
      {children}
    </animated.div>
  );
};
