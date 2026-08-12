// @_longwhile custom feature

import { unescapeHTML } from 'mastodon/utils/html';

interface Props {
  contentHtml?: string;
}

export const SystemNotice: React.FC<Props> = ({ contentHtml }) => {
  const text = (contentHtml ? unescapeHTML(contentHtml) : '')?.trim() ?? '';

  if (!text) return null;

  return (
    <div className='dm-system-notice' role='status'>
      {text}
    </div>
  );
};
