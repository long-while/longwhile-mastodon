// @_longwhile custom feature

const LEADING_MENTIONS = /^(?:@[^\s@]+(?:@[^\s]+)?[ \t]+)*/;

export const stripLeadingMentions = (text: string) =>
  text.replace(LEADING_MENTIONS, '');
