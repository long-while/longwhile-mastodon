import { me } from 'mastodon/initial_state';

const PRESENCE_REQUEST = 'ma:presence?';
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

export interface PushPresence {
  accountId: string | null;
  path: string;
  hasFocus: boolean;
  visible: boolean;
  lastInteractionAt: number;
  suppressEnabled: boolean;
  streamConnected: boolean;
}

let lastInteractionAt = Date.now();
let installed = false;

const markInteraction = () => {
  lastInteractionAt = Date.now();
};

export const buildPresence = (
  suppressEnabled: boolean,
  streamConnected: boolean,
): PushPresence => ({
  accountId: me ?? null,
  path: window.location.pathname,
  hasFocus: document.hasFocus(),
  visible: document.visibilityState === 'visible',
  lastInteractionAt,
  suppressEnabled,
  streamConnected,
});

export const installPushPresenceResponder = (
  isSuppressEnabled: () => boolean,
  isStreamConnected: () => boolean,
) => {
  if (installed || !('serviceWorker' in navigator)) return;
  installed = true;

  INTERACTION_EVENTS.forEach((type) => {
    window.addEventListener(type, markInteraction, {
      capture: true,
      passive: true,
    });
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown } | null;
    const port = event.ports[0];

    if (data?.type !== PRESENCE_REQUEST || !port) return;

    port.postMessage(buildPresence(isSuppressEnabled(), isStreamConnected()));
  });
};
