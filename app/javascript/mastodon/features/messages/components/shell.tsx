// @_longwhile custom feature

import { useEffect } from 'react';

const BODY_CLASS = 'layout-messages';

const ROOM_BODY_CLASS = 'layout-messages-room';

export const useMessagesLayout = (enabled: boolean, roomOpen = false) => {
  useEffect(() => {
    if (!enabled) return undefined;

    document.body.classList.add(BODY_CLASS);

    return () => {
      document.body.classList.remove(BODY_CLASS);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !roomOpen) return undefined;

    document.body.classList.add(ROOM_BODY_CLASS);

    return () => {
      document.body.classList.remove(ROOM_BODY_CLASS);
    };
  }, [enabled, roomOpen]);
};
