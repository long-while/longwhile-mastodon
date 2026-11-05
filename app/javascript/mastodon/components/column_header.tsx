import { useCallback, useId, useState } from 'react';

import { FormattedMessage, defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';

import AddIcon from '@/material-icons/400-24px/add.svg?react';
import ArrowBackIcon from '@/material-icons/400-24px/arrow_back.svg?react';
import ChevronLeftIcon from '@/material-icons/400-24px/chevron_left.svg?react';
import ChevronRightIcon from '@/material-icons/400-24px/chevron_right.svg?react';
import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import SettingsIcon from '@/material-icons/400-24px/settings.svg?react';
import type { IconProp } from 'mastodon/components/icon';
import { Icon } from 'mastodon/components/icon';
import { WordmarkLogo } from 'mastodon/components/logo';
import { MobileMenuAvatarButton } from 'mastodon/features/ui/components/mobile_menu_avatar_button';
import { ButtonInTabsBar } from 'mastodon/features/ui/util/columns_context';
import { useIdentity } from 'mastodon/identity_context';

import { useAppHistory } from './router';

const messages = defineMessages({
  show: { id: 'column_header.show_settings', defaultMessage: 'Show settings' },
  hide: { id: 'column_header.hide_settings', defaultMessage: 'Hide settings' },
  moveLeft: {
    id: 'column_header.moveLeft_settings',
    defaultMessage: 'Move column to the left',
  },
  moveRight: {
    id: 'column_header.moveRight_settings',
    defaultMessage: 'Move column to the right',
  },
  back: { id: 'column_back_button.label', defaultMessage: 'Back' },
});

const BackButton: React.FC<{
  onlyIcon: boolean;
}> = ({ onlyIcon }) => {
  const history = useAppHistory();
  const intl = useIntl();

  const handleBackClick = useCallback(() => {
    if (history.location.state?.fromMastodon) {
      history.goBack();
    } else {
      history.push('/');
    }
  }, [history]);

  return (
    <button
      onClick={handleBackClick}
      className={classNames('column-header__back-button', {
        compact: onlyIcon,
      })}
      aria-label={intl.formatMessage(messages.back)}
    >
      {/* @_longwhile — "돌아가기" 글자를 빼고 화살표만 남긴다. 화살표가 이미
          말하는 것을 한 번 더 말할 뿐이고, 그만큼 헤더의 가로를 먹는다.
          이름은 위의 `aria-label` 이 들고 있으므로 스크린 리더에는 그대로다. */}
      <Icon
        id='chevron-left'
        icon={ArrowBackIcon}
        className='column-back-button__icon'
      />
    </button>
  );
};

export interface Props {
  title?: string;
  icon?: string;
  iconComponent?: IconProp;
  active?: boolean;
  children?: React.ReactNode;
  pinned?: boolean;
  multiColumn?: boolean;
  extraButton?: React.ReactNode;
  // 제목 대신 그릴 탭 줄(홈·퍼블릭의 `TimelineTabs`). 주면 제목 글자는 h1
  // 안에 화면에서만 감춰 두고, 모바일에서는 사진·로고 줄 아래로 내려간다.
  tabs?: React.ReactNode;
  showBackButton?: boolean;
  placeholder?: boolean;
  appendContent?: React.ReactNode;
  collapseIssues?: boolean;
  onClick?: () => void;
  onMove?: (arg0: number) => void;
  onPin?: () => void;
}

export const ColumnHeader: React.FC<Props> = ({
  title,
  icon,
  iconComponent,
  active,
  children,
  pinned,
  multiColumn,
  extraButton,
  tabs,
  showBackButton,
  placeholder,
  appendContent,
  collapseIssues,
  onClick,
  onMove,
  onPin,
}) => {
  const intl = useIntl();
  const { signedIn } = useIdentity();
  const history = useAppHistory();
  const [collapsed, setCollapsed] = useState(true);
  const [animating, setAnimating] = useState(false);

  const handleToggleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCollapsed((value) => !value);
      setAnimating(true);
    },
    [setCollapsed, setAnimating],
  );

  const handleTitleClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  const handleMoveLeft = useCallback(() => {
    onMove?.(-1);
  }, [onMove]);

  const handleMoveRight = useCallback(() => {
    onMove?.(1);
  }, [onMove]);

  const handleTransitionEnd = useCallback(() => {
    setAnimating(false);
  }, [setAnimating]);

  const handlePin = useCallback(() => {
    if (!pinned) {
      history.replace('/');
    }

    onPin?.();
  }, [history, pinned, onPin]);

  const wrapperClassName = classNames('column-header__wrapper', {
    active,
  });

  const buttonClassName = classNames('column-header', {
    active,
    'column-header--tabbed': !!tabs,
  });

  const collapsibleClassName = classNames('column-header__collapsible', {
    collapsed,
    animating,
  });

  const collapsibleButtonClassName = classNames('column-header__button', {
    active: !collapsed,
  });

  let extraContent, pinButton, moveButtons, backButton, collapseButton;

  if (children) {
    extraContent = (
      <div key='extra-content' className='column-header__collapsible__extra'>
        {children}
      </div>
    );
  }

  if (multiColumn && pinned) {
    pinButton = (
      <button
        className='text-btn column-header__setting-btn'
        onClick={handlePin}
      >
        <Icon id='times' icon={CloseIcon} />{' '}
        <FormattedMessage id='column_header.unpin' defaultMessage='Unpin' />
      </button>
    );

    moveButtons = (
      <div className='column-header__setting-arrows'>
        <button
          title={intl.formatMessage(messages.moveLeft)}
          aria-label={intl.formatMessage(messages.moveLeft)}
          className='icon-button column-header__setting-btn'
          onClick={handleMoveLeft}
        >
          <Icon id='chevron-left' icon={ChevronLeftIcon} />
        </button>
        <button
          title={intl.formatMessage(messages.moveRight)}
          aria-label={intl.formatMessage(messages.moveRight)}
          className='icon-button column-header__setting-btn'
          onClick={handleMoveRight}
        >
          <Icon id='chevron-right' icon={ChevronRightIcon} />
        </button>
      </div>
    );
  } else if (multiColumn && onPin) {
    pinButton = (
      <button
        className='text-btn column-header__setting-btn'
        onClick={handlePin}
      >
        <Icon id='plus' icon={AddIcon} />{' '}
        <FormattedMessage id='column_header.pin' defaultMessage='Pin' />
      </button>
    );
  }

  if (
    !pinned &&
    ((multiColumn && history.location.state?.fromMastodon) || showBackButton)
  ) {
    backButton = <BackButton onlyIcon={!!title} />;
  }

  const collapsedContent = [extraContent];

  if (multiColumn) {
    collapsedContent.push(
      <div key='buttons' className='column-header__advanced-buttons'>
        {pinButton}
        {moveButtons}
      </div>,
    );
  }

  if (signedIn && (children || (multiColumn && onPin))) {
    collapseButton = (
      <button
        className={collapsibleButtonClassName}
        title={intl.formatMessage(collapsed ? messages.show : messages.hide)}
        aria-label={intl.formatMessage(
          collapsed ? messages.show : messages.hide,
        )}
        onClick={handleToggleClick}
      >
        <i className='icon-with-badge'>
          <Icon id='sliders' icon={SettingsIcon} />
          {collapseIssues && <i className='icon-with-badge__issue-badge' />}
        </i>
      </button>
    );
  }

  const hiddenTitleId = useId();
  const hasIcon = icon && iconComponent;
  const hasTitle = hasIcon && title;

  const titleButton = tabs ? (
    <span id={hiddenTitleId} className='column-header__hidden-title'>
      {title}
    </span>
  ) : (
    hasTitle && (
      <button onClick={handleTitleClick} className='column-header__title'>
        {!backButton && (
          <Icon
            id={icon}
            icon={iconComponent}
            className='column-header__icon'
          />
        )}
        {title}
      </button>
    )
  );

  // 돌아가기 단추가 있는 화면은 그 자리를 단추가 쓴다. 다중 칼럼에는 서랍이 없다.
  const showMenuAvatar = !backButton && !multiColumn;

  const component = (
    <div className={wrapperClassName}>
      {/* 탭이 있으면 h1 안에 탭·버튼까지 들어 있어, 내용으로 이름을 지으면
          "홈 타임라인 홈 퍼블릭 툿 …" 이 된다. 감춘 제목 하나로 이름을 정한다. */}
      <h1
        className={buttonClassName}
        aria-labelledby={tabs && hasTitle ? hiddenTitleId : undefined}
      >
        {hasTitle && (
          <>
            {backButton}

            {showMenuAvatar ? (
              <MobileMenuAvatarButton>{titleButton}</MobileMenuAvatarButton>
            ) : (
              titleButton
            )}
          </>
        )}

        {!hasTitle &&
          (backButton ?? (showMenuAvatar && <MobileMenuAvatarButton />))}

        {/* 모바일에서만 보인다(가운데 로고, X 와 같다). 테마에 맞는 그림은
            `WordmarkLogo` 가 고른다 — 라이트 번들의 diff.scss 가 바꿔 끼운다. */}
        {tabs && (
          <span className='column-header__logo' aria-hidden='true'>
            <WordmarkLogo />
          </span>
        )}

        <div className='column-header__buttons'>
          {extraButton}
          {collapseButton}
        </div>

        {tabs}
      </h1>

      <div
        className={collapsibleClassName}
        tabIndex={collapsed ? -1 : undefined}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className='column-header__collapsible-inner'>
          {(!collapsed || animating) && collapsedContent}
        </div>
      </div>

      {appendContent}
    </div>
  );

  if (placeholder) {
    return component;
  } else {
    return <ButtonInTabsBar>{component}</ButtonInTabsBar>;
  }
};

// eslint-disable-next-line import/no-default-export
export default ColumnHeader;
