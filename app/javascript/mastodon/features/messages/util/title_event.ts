// @_longwhile custom feature
export const TITLE_EVENT_PREFIX = 'conversation:title_changed:';

export const isTitleEvent = (spoilerText: string | undefined | null) =>
  Boolean(spoilerText?.startsWith(TITLE_EVENT_PREFIX));
