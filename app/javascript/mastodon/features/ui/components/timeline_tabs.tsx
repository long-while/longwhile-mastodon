import { useCallback, useRef } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';
import { Link, useLocation } from 'react-router-dom';

import { useHideOnScroll } from 'mastodon/hooks/useHideOnScroll';

const messages = defineMessages({
  label: { id: 'timeline_tabs.label', defaultMessage: 'Timelines' },
  home: { id: 'column.home', defaultMessage: 'Home' },
  public: { id: 'timeline_tabs.public', defaultMessage: 'Public' },
});

const TABS = [
  { to: '/home', paths: ['/home', '/timelines/home'], message: messages.home },
  { to: '/public', paths: ['/public'], message: messages.public },
] as const;

export const TIMELINE_TAB_PATHS: string[] = TABS.flatMap(({ paths }) => paths);

interface Props {
  onActiveClick?: () => void;
}

export const TimelineTabs: React.FC<Props> = ({ onActiveClick }) => {
  const intl = useIntl();
  const { pathname } = useLocation();
  const ref = useRef<HTMLSpanElement>(null);

  useHideOnScroll(ref, true);

  const handleActiveClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onActiveClick?.();
    },
    [onActiveClick],
  );

  return (
    <span
      ref={ref}
      role='navigation'
      className='column-header__tabs'
      aria-label={intl.formatMessage(messages.label)}
    >
      {TABS.map(({ to, paths, message }) => {
        const active = (paths as readonly string[]).includes(pathname);

        return (
          <Link
            key={to}
            to={to}
            replace
            className={classNames('column-header__tab', { active })}
            aria-current={active ? 'page' : undefined}
            onClick={active ? handleActiveClick : undefined}
          >
            <span>{intl.formatMessage(message)}</span>
          </Link>
        );
      })}
    </span>
  );
};
