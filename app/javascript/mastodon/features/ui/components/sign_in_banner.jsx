import { FormattedMessage } from 'react-intl';

import { sso_redirect } from 'mastodon/initial_state';

const SignInBanner = () => {
  if (sso_redirect) {
    return (
      <div className='sign-in-banner'>
        <p><strong><FormattedMessage id='sign_in_banner.mastodon_is' defaultMessage="Mastodon is the best way to keep up with what's happening." /></strong></p>
        <p><FormattedMessage id='sign_in_banner.follow_anyone' defaultMessage='Follow anyone across the fediverse and see it all in chronological order. No algorithms, ads, or clickbait in sight.' /></p>
        <a href={sso_redirect} data-method='post' className='button button--block'><FormattedMessage id='sign_in_banner.sso_redirect' defaultMessage='Login or Register' /></a>
      </div>
    );
  }

  return (
    <div className='sign-in-banner'>
      <p><strong><FormattedMessage id='sign_in_banner.mastodon_is' defaultMessage="Mastodon is the best way to keep up with what's happening." /></strong></p>
      <p><FormattedMessage id='sign_in_banner.follow_anyone' defaultMessage='Follow anyone across the fediverse and see it all in chronological order. No algorithms, ads, or clickbait in sight.' /></p>
      <a href='/auth/sign_in' className='button button--block'><FormattedMessage id='sign_in_banner.sign_in' defaultMessage='Login' /></a>
    </div>
  );
};

export default SignInBanner;
