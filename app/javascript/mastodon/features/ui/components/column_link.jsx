import PropTypes from 'prop-types';

import classNames from 'classnames';
import { useRouteMatch, useLocation, NavLink } from 'react-router-dom';

import { Icon } from 'mastodon/components/icon';

const ColumnLink = ({ icon, activeIcon, iconComponent, activeIconComponent, text, to, href, method, badge, transparent, optional, isActive, ...other }) => {
  const location = useLocation();
  const match = useRouteMatch(to);
  const className = classNames('column-link', { 'column-link--transparent': transparent, 'column-link--optional': optional });
  const badgeElement = typeof badge !== 'undefined' ? <span className='column-link__badge'>{badge}</span> : null;
  const iconElement = (typeof icon === 'string' || iconComponent) ? <Icon id={icon} icon={iconComponent} className='column-link__icon' /> : icon;
  const activeIconElement = activeIcon ?? (activeIconComponent ? <Icon id={icon} icon={activeIconComponent} className='column-link__icon' /> : iconElement);
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
