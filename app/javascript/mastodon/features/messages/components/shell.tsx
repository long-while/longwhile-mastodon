// @_longwhile custom feature

import { useEffect } from 'react';

const BODY_CLASS = 'layout-messages';

export const useMessagesLayout = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return undefined;

    document.body.classList.add(BODY_CLASS);

    return () => {
      document.body.classList.remove(BODY_CLASS);
    };
  }, [enabled]);
};
