import { Link } from 'react-router-dom';

import { domain, version } from 'mastodon/initial_state';

export const LinkFooter: React.FC<{
  multiColumn: boolean;
}> = ({ multiColumn }) => (
  <div className='link-footer'>
    <p>
      본 서버는{' '}
      <a href='https://crepe.cm/@longwhile/lw5w0ofg' target='_blank' rel='noopener'>
        크레페 한참 커미션
      </a>
      으로 설치되었습니다.
    </p>

    <p>
      <strong>{domain}</strong>{' '}
      <Link
        to='/privacy-policy'
        target={multiColumn ? '_blank' : undefined}
        rel='privacy-policy'
      >
        개인정보처리방침
      </Link>{' '}
      <a href='https://github.com/long-while/longwhile-mastodon' target='_blank' rel='noopener' className='version'>v{version}</a>
    </p>
  </div>
);
