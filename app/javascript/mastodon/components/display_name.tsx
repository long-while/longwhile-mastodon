import React from 'react';

import type { List } from 'immutable';

import type { Account } from 'mastodon/models/account';

import { autoPlayGif } from '../initial_state';

import { Skeleton } from './skeleton';

interface Props {
  account?: Account;
  others?: List<Account>;
  localDomain?: string;

  // @_longwhile — 닉네임 **바로 뒤**, 핸들 앞에 끼울 것. 잠금 자물쇠가 쓴다.
  //
  //   기본     <bdi>닉네임</bdi> @핸들
  //   afterName <bdi>닉네임</bdi>🔒 @핸들
  //
  // 밖에서 형제로 붙이면 핸들 **뒤**에 놓인다 — `.display-name` 이 닉네임과
  // 핸들을 함께 감싸고 있어서, 그 사이로는 CSS 로도 끼워 넣을 수 없다.
  // (flex `order` 는 같은 부모의 자식끼리만 서로 자리를 바꾼다.)
  afterName?: React.ReactNode;
}

export class DisplayName extends React.PureComponent<Props> {
  handleMouseEnter: React.ReactEventHandler<HTMLSpanElement> = ({
    currentTarget,
  }) => {
    if (autoPlayGif) {
      return;
    }

    const emojis =
      currentTarget.querySelectorAll<HTMLImageElement>('img.custom-emoji');

    emojis.forEach((emoji) => {
      const originalSrc = emoji.getAttribute('data-original');
      if (originalSrc != null) emoji.src = originalSrc;
    });
  };

  handleMouseLeave: React.ReactEventHandler<HTMLSpanElement> = ({
    currentTarget,
  }) => {
    if (autoPlayGif) {
      return;
    }

    const emojis =
      currentTarget.querySelectorAll<HTMLImageElement>('img.custom-emoji');

    emojis.forEach((emoji) => {
      const staticSrc = emoji.getAttribute('data-static');
      if (staticSrc != null) emoji.src = staticSrc;
    });
  };

  render() {
    const { others, localDomain, afterName } = this.props;

    let displayName: React.ReactNode,
      suffix: React.ReactNode,
      account: Account | undefined;

    if (others && others.size > 0) {
      account = others.first();
    } else if (this.props.account) {
      account = this.props.account;
    }

    if (others && others.size > 1) {
      displayName = others
        .take(2)
        .map((a) => (
          <bdi key={a.get('id')}>
            <strong
              className='display-name__html'
              dangerouslySetInnerHTML={{ __html: a.get('display_name_html') }}
            />
          </bdi>
        ))
        .reduce((prev, cur) => [prev, ', ', cur]);

      if (others.size - 2 > 0) {
        suffix = `+${others.size - 2}`;
      }
    } else if (account) {
      let acct = account.get('acct');

      if (!acct.includes('@') && localDomain) {
        acct = `${acct}@${localDomain}`;
      }

      displayName = (
        <bdi>
          <strong
            className='display-name__html'
            dangerouslySetInnerHTML={{
              __html: account.get('display_name_html'),
            }}
          />
        </bdi>
      );
      suffix = <span className='display-name__account'>@{acct}</span>;
    } else {
      displayName = (
        <bdi>
          <strong className='display-name__html'>
            <Skeleton width='10ch' />
          </strong>
        </bdi>
      );
      suffix = (
        <span className='display-name__account'>
          <Skeleton width='7ch' />
        </span>
      );
    }

    return (
      <span
        className='display-name'
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
      >
        {/* @_longwhile — `afterName` 이 있을 때만 감싼다.
            테마는 문맥에 따라 `.display-name__html` 을 `display: block` 으로
            바꾼다(작성창 위 계정 줄 `.account--minimal`). 그러면 자물쇠를
            형제로 두는 것만으로는 **반드시 다음 줄로 떨어진다.** 같은 줄에
            세우려면 둘을 한 상자에 넣어야 한다.
            감싸개를 늘 두지 않는 이유는, DisplayName 이 타임라인·알림·검색
            등 수십 곳에서 쓰이기 때문이다. 자물쇠가 없는 화면의 배치는 한
            글자도 건드리지 않는다. */}
        {afterName ? (
          <span className='display-name__with-badge'>
            {displayName}
            {afterName}
          </span>
        ) : (
          displayName
        )}{' '}
        {suffix}
      </span>
    );
  }
}
