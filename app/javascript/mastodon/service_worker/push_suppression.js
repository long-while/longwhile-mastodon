export const IDLE_MS = 120_000;
export const REPLY_TIMEOUT_MS = 300;
export const MAX_CONSECUTIVE = 5;
export const PRESENCE_REQUEST = 'ma:presence?';

const ALWAYS_SHOW = new Set([
  'admin.report',
  'admin.sign_up',
  'severed_relationships',
  'moderation_warning',
]);

export const isWebKitOnly = (userAgent = '') =>
  /iPhone|iPad|iPod/.test(userAgent) ||
  (/Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|Edg\/|Firefox\//.test(userAgent));

const isDirectMessage = (push) => Boolean(push.dm_room_id);

const isLegacyDirectMessage = (push) => push.direct === true && !push.dm_room_id;

const coversPush = (reply, push, now) => {
  if (!reply || !reply.suppressEnabled || !reply.hasFocus || !reply.visible) return false;
  if (reply.streamConnected === false) return false;
  if (reply.accountId !== push.account_id) return false;
  if (!(now - reply.lastInteractionAt < IDLE_MS)) return false;

  return !isDirectMessage(push) || reply.path === `/messages/${push.dm_room_id}`;
};

/**
 * @param {object} push
 * @param {Array<object|null>} replies
 * @param {number} now
 * @param {{ consecutive: number, userAgent: string }} context
 * @returns {boolean}
 */
export const shouldSuppressPush = (push, replies, now, { consecutive, userAgent }) => {
  if (!push || !push.account_id) return false;
  if (isWebKitOnly(userAgent)) return false;
  if (consecutive >= MAX_CONSECUTIVE) return false;
  if (ALWAYS_SHOW.has(push.notification_type)) return false;
  if (isLegacyDirectMessage(push)) return false;

  return replies.some((reply) => coversPush(reply, push, now));
};

const askClient = (client, timeoutMs) =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);

    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data ?? null);
    };

    try {
      client.postMessage({ type: PRESENCE_REQUEST }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });

/**
 * @param {{ matchAll: Function }} clients
 * @param {number} [timeoutMs]
 */
export const collectPresence = async (clients, timeoutMs = REPLY_TIMEOUT_MS) => {
  try {
    const windows = await clients.matchAll({ type: 'window' });
    const focused = windows.filter((client) => client.focused);

    return await Promise.all(focused.map((client) => askClient(client, timeoutMs)));
  } catch {
    return [];
  }
};
