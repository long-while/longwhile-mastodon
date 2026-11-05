import { useCallback } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { openNavigation } from 'mastodon/actions/navigation';
import { Avatar } from 'mastodon/components/avatar';
import { useIdentity } from 'mastodon/identity_context';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  menu: { id: 'tabs_bar.menu', defaultMessage: 'Menu' },
});

interface Props {
  // 단추 오른쪽에 그대로 둘 제목. 모바일이 아니면 이것만 그린다.
  children?: React.ReactNode;
}

// @_longwhile — 모바일 헤더 왼쪽 위의 내 프로필 사진. 누르면 서랍을 연다.
//
//   하단 막대의 ☰ 칸을 없앴으므로 **서랍으로 가는 길은 이것뿐이다.** 그래서
//   칼럼 헤더(`ColumnHeader`)와 메시지 목록 헤더가 모두 이것을 그린다.
//
//   모바일 레이아웃이 아니면(서랍이 없으면) 단추 없이 children 만 돌려준다.
//   폭이 아니라 `meta.layout` 으로 가린다 — 서랍을 그리는 `columns_area.jsx`
//   가 같은 값을 보므로, 여는 쪽과 열리는 쪽이 어긋날 수 없다.
//
//   계정은 `meta.me` 가 아니라 identity 의 `accountId` 로 찾는다. 둘은 같은 값을
//   가리키지만, 이쪽은 테스트에서 주입할 수 있다.
export const MobileMenuAvatarButton: React.FC<Props> = ({ children }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const { signedIn, accountId } = useIdentity();
  const isMobileLayout = useAppSelector(
    (state) => state.meta.get('layout') === 'mobile',
  );
  const account = useAppSelector((state) =>
    accountId ? state.accounts.get(accountId) : undefined,
  );
  const navigationOpen = useAppSelector((state) => state.navigation.open);

  const handleClick = useCallback(() => {
    dispatch(openNavigation());
  }, [dispatch]);

  if (!signedIn || !isMobileLayout || !account) return children ?? null;

  const label = intl.formatMessage(messages.menu);

  return (
    <>
      <button
        type='button'
        className='column-header__avatar-menu'
        aria-label={label}
        title={label}
        aria-expanded={navigationOpen}
        onClick={handleClick}
      >
        <Avatar account={account} size={32} />
      </button>

      {children}
    </>
  );
};
