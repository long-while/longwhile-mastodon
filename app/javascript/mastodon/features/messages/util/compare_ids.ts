// @_longwhile custom feature
export const compareIds = (a: string, b: string) =>
  a.length === b.length ? a.localeCompare(b) : a.length - b.length;
