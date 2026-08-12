// @_longwhile custom feature
export const TITLE_EVENT_PREFIX = 'conversation:title_changed:';

export const MEMBER_EVENT_PREFIX = 'conversation:members_changed:';

export const isTitleEvent = (spoilerText: string | undefined | null) =>
  Boolean(spoilerText?.startsWith(TITLE_EVENT_PREFIX));

export const isMemberEvent = (spoilerText: string | undefined | null) =>
  Boolean(spoilerText?.startsWith(MEMBER_EVENT_PREFIX));

export const isSystemEvent = (spoilerText: string | undefined | null) =>
  isTitleEvent(spoilerText) || isMemberEvent(spoilerText);
