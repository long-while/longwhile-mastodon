const parser = new DOMParser();

const isMention = (node) =>
  node.nodeType === Node.ELEMENT_NODE &&
  (node.classList.contains('h-card') || node.classList.contains('mention'));

const isBlank = (node) =>
  node.nodeType === Node.TEXT_NODE && node.textContent.trim().length === 0;

const hrefOf = (node) =>
  node.matches?.('a') ? node.getAttribute('href') : node.querySelector('a')?.getAttribute('href');

/**
 * The mentions a reply carries only because the composer put them there: the
 * account being replied to, plus everyone that post was already addressed to.
 *
 * Anyone else named at the top of the reply is someone the author is bringing
 * into the conversation, which is information — those stay on screen.
 *
 * Matching goes through the status' own mention list rather than the anchor
 * text, because the rendered text is the bare username while two accounts on
 * different hosts can share one.
 *
 * @param {any} status the reply
 * @param {any} parentStatus the post it replies to, when it is in the store
 * @returns {Set<string>} URLs of the mentions that may be hidden
 */
export const carriedOverMentionUrls = (status, parentStatus) => {
  const urls = new Set();
  const mentions = status.get('mentions');

  if (!mentions || mentions.isEmpty()) {
    return urls;
  }

  const alreadyInConversation = new Set();
  const inReplyToAccountId = status.get('in_reply_to_account_id');

  if (inReplyToAccountId) {
    alreadyInConversation.add(inReplyToAccountId);
  }

  // Without the parent only its author is known, which is the common case
  // anyway: a one-to-one reply carries exactly that one handle.
  parentStatus?.get('mentions')?.forEach((mention) => {
    alreadyInConversation.add(mention.get('id'));
  });

  mentions.forEach((mention) => {
    if (alreadyInConversation.has(mention.get('id'))) {
      urls.add(mention.get('url'));
    }
  });

  return urls;
};

/**
 * Hides the handles a reply opens with, the way Twitter drops the addressees it
 * inserted for you.
 *
 * Mastodon's composer prefills a reply with everyone in the conversation, so a
 * back-and-forth repeats the same handles on every line. Those carry nothing the
 * thread does not already show, and in a long exchange they push the message off
 * to the right.
 *
 * Deliberately narrow:
 *
 * - only the leading run is considered; a mention written inside the sentence is
 *   part of what the author wrote;
 * - only handles listed in `carriedOver` go, so a third party introduced at the
 *   front of the reply is still named;
 * - a paragraph that holds nothing but mentions is left alone. Emptying it would
 *   erase a line the author chose to write.
 *
 * The markup is walked as a DOM rather than matched with a regular expression —
 * it is server-rendered HTML, and patterns break on the first nested tag.
 *
 * This is presentation only. The stored status keeps every mention, so replies,
 * notifications and delivery are unaffected.
 *
 * @param {string} html server-rendered status content
 * @param {Set<string>} carriedOver URLs from {@link carriedOverMentionUrls}
 * @returns {string} the same HTML with the carried-over handles removed
 */
export const stripLeadingMentions = (html, carriedOver) => {
  if (!html || !carriedOver || carriedOver.size === 0) {
    return html;
  }

  const document = parser.parseFromString(html, 'text/html');
  const root = document.body.firstElementChild ?? document.body;
  const removable = [];

  for (let node = root.firstChild; node; node = node.nextSibling) {
    if (isBlank(node)) {
      continue;
    }

    if (!isMention(node)) {
      break;
    }

    // A mention of someone new stops nothing: keep it and carry on looking, so
    // "@newcomer @alreadyHere text" loses only the second handle.
    if (carriedOver.has(hrefOf(node))) {
      removable.push(node);
    }
  }

  if (removable.length === 0) {
    return html;
  }

  removable.forEach((node) => {
    // Take one separator with it, or a handle that survives in front of a
    // removed one is left sitting on a double space. The space after is the
    // natural one to drop; when the text follows immediately, drop the one in
    // front instead.
    const following = node.nextSibling;
    const preceding = node.previousSibling;

    if (following && isBlank(following)) {
      following.remove();
    } else if (preceding && isBlank(preceding)) {
      preceding.remove();
    }

    node.remove();
  });

  // Nothing but handles was on this line; put it back rather than leaving a
  // blank paragraph where the author wrote something.
  if (root.textContent.trim().length === 0) {
    return html;
  }

  // Tidy the gap the removals left at the start of the line.
  while (root.firstChild && (isBlank(root.firstChild) || root.firstChild.nodeName === 'BR')) {
    root.firstChild.remove();
  }

  if (root.firstChild?.nodeType === Node.TEXT_NODE) {
    root.firstChild.textContent = root.firstChild.textContent.replace(/^\s+/, '');
  }

  return document.body.innerHTML;
};
