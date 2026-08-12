/**
 * Tracks how far the server's clock is from this browser's clock.
 *
 * Scheduling is the one place where a wrong browser clock produces a confusing
 * failure: the user picks a time that looks a minute away, the server disagrees,
 * and the request comes back as a bare 422. Every API response carries a `Date`
 * header, so the difference can be measured for free and folded into the
 * client-side validation instead.
 *
 * Accuracy is limited to roughly a second (the header has second resolution and
 * is stamped before the response travels back), which is irrelevant next to the
 * minimum scheduling offset.
 */

let skewMs = 0;

/**
 * @param {string | undefined} dateHeader value of the response's `Date` header
 */
export const recordServerClockSkew = (dateHeader) => {
  if (!dateHeader) {
    return;
  }

  const serverTime = Date.parse(dateHeader);

  if (Number.isNaN(serverTime)) {
    return;
  }

  skewMs = serverTime - Date.now();
};

/** Server clock minus browser clock, in milliseconds. */
export const serverClockSkew = () => skewMs;

/** Best estimate of the server's current time, as a millisecond timestamp. */
export const serverNow = () => Date.now() + skewMs;
