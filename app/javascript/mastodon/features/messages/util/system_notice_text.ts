import { unescapeHTML } from 'mastodon/utils/html';

import { stripLeadingMentions } from './strip_leading_mentions';

export const systemNoticeText = (contentHtml: string | undefined | null) => {
  const text = (contentHtml ? unescapeHTML(contentHtml) : '') ?? '';

  return stripLeadingMentions(text.trim()).trim();
};
