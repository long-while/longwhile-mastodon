import { useCallback } from 'react';

import { useIntl, defineMessages } from 'react-intl';

import { useSelector, useDispatch } from 'react-redux';

// @_longwhile — 답장 취소. 상류의 material-icons/close 대신 테마 SVG 를 쓴다.
// 채운(fill) 아이콘이라 전역 `.icon path { fill: currentColor }` 가 그대로
// 맞는다 — 선(stroke)으로 그린 것이었다면 fill 을 되돌려야 했다.
import CloseIcon from '@/styles/bird-theme-svg/cross-small.svg?react';
import { cancelReplyCompose } from 'mastodon/actions/compose';
import { Account } from 'mastodon/components/account';
import { IconButton } from 'mastodon/components/icon_button';
import { me } from 'mastodon/initial_state';

import { ActionBar } from './action_bar';


const messages = defineMessages({
  cancel: { id: 'reply_indicator.cancel', defaultMessage: 'Cancel' },
});

export const NavigationBar = () => {
  const dispatch = useDispatch();
  const intl = useIntl();
  const isReplying = useSelector(state => !!state.getIn(['compose', 'in_reply_to']));

  const handleCancelClick = useCallback(() => {
    dispatch(cancelReplyCompose());
  }, [dispatch]);

  return (
    <div className='navigation-bar'>
      <Account id={me} minimal />
      {/* `icon` 을 준다. 없으면 클래스가 `icon-undefined` 가 되어 테마·우리 규칙이
          이 아이콘을 짚을 수 없다 — 그림은 나오지만 이름이 없는 상태였다. */}
      {isReplying ? <IconButton icon='times' title={intl.formatMessage(messages.cancel)} iconComponent={CloseIcon} onClick={handleCancelClick} /> : <ActionBar />}
    </div>
  );
};
