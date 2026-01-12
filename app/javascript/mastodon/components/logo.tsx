import logo from '@/images/logos/logo_dark.png';
import wordmark from '@/images/logos/wordmark_dark.png';
import m_logo from '@/images/logos/m_logo_dark.png';

export const WordmarkLogo: React.FC = () => (
  <img src={wordmark} alt='Mastodon' className='logo logo--wordmark' />
);


export const IconLogo: React.FC = () => (
  <img src={m_logo} alt='Mastodon' className='logo logo--icon' />
);


export const SymbolLogo: React.FC = () => (
  <img src={logo} alt='Mastodon' className='logo logo--icon' />
);
