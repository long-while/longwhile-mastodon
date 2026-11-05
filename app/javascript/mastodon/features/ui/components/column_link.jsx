import PropTypes from 'prop-types';

import classNames from 'classnames';
import { useRouteMatch, useLocation, NavLink } from 'react-router-dom';

import { Icon } from 'mastodon/components/icon';

// @_longwhile — `isActive` 를 **아이콘 교체에도** 쓴다.
//
//   `isActive` 자체는 원래 있던 것이다. 상류가 퍼블릭 툿 링크에 넘기고 있고,
//   예전에는 `{...other}` 를 타고 NavLink 로 그대로 흘러갔다. 시그니처는
//   react-router 의 것이다 — `(match, location) => boolean`.
//
//   **그 이름을 가로채 우리 시그니처로 바꿨다가 사고를 냈다.** `(pathname)` 을
//   받는 함수로 오해하고 `isActive(location.pathname)` 로 부르는 바람에, 상류
//   함수의 `match` 자리에 문자열이 들어가 늘 참이 됐다. 퍼블릭 툿이 모든
//   화면에서 켜져 있었다. 시그니처는 react-router 것을 그대로 쓴다.
//
//   여기서 하는 일은 **아이콘 교체(기본 ↔ 채워진 것)를 같은 판정에 맞추는 것**
//   하나뿐이다. 그러지 않으면 켜진 항목에 꺼진 아이콘이 붙는다.
//
//   `isActive` 를 준 링크에서는 `exact` 를 뺀다. 그래야 그 함수가 받는 `match`
//   가 하위 경로에서도 채워져, 판정이 `match` 를 볼 수 있다.
//
//   **NavLink 는 경로가 일치하지 않아도 `isActive` 를 부른다.** 실제 코드가
//   `!!(isActiveProp ? isActiveProp(match, location) : match)` 라, 안 맞으면
//   `match` 가 null 인 채로 불린다. 판정 함수는 그것을 견뎌야 한다.
const ColumnLink = ({ icon, activeIcon, iconComponent, activeIconComponent, text, to, href, method, badge, transparent, optional, isActive, ...other }) => {
  const location = useLocation();
  const match = useRouteMatch(to);
  const className = classNames('column-link', { 'column-link--transparent': transparent, 'column-link--optional': optional });
  const badgeElement = typeof badge !== 'undefined' ? <span className='column-link__badge'>{badge}</span> : null;
  const iconElement = (typeof icon === 'string' || iconComponent) ? <Icon id={icon} icon={iconComponent} className='column-link__icon' /> : icon;
  const activeIconElement = activeIcon ?? (activeIconComponent ? <Icon id={icon} icon={activeIconComponent} className='column-link__icon' /> : iconElement);
  // NavLink 안쪽과 **같은 식**으로 계산한다. 다르게 계산하면 클래스는 켜졌는데
  // 아이콘은 꺼진 상태가 생긴다.
  const active = isActive ? !!isActive(match, location) : match?.isExact;

  if (href) {
    return (
      <a href={href} className={className} data-method={method} {...other}>
        {active ? activeIconElement : iconElement}
        <span>{text}</span>
        {badgeElement}
      </a>
    );
  } else {
    return (
      <NavLink
        to={to}
        className={className}
        exact={!isActive}
        isActive={isActive}
        {...other}
      >
        {active ? activeIconElement : iconElement}
        <span>{text}</span>
        {badgeElement}
      </NavLink>
    );
  }
};

ColumnLink.propTypes = {
  icon: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  iconComponent: PropTypes.func,
  activeIcon: PropTypes.node,
  activeIconComponent: PropTypes.func,
  text: PropTypes.string.isRequired,
  to: PropTypes.string,
  href: PropTypes.string,
  method: PropTypes.string,
  badge: PropTypes.node,
  transparent: PropTypes.bool,
  optional: PropTypes.bool,
  isActive: PropTypes.func,
};

export default ColumnLink;
