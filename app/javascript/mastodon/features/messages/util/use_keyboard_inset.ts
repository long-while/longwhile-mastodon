// @_longwhile custom feature

import { useEffect, useState } from 'react';

const KEYBOARD_MIN_HEIGHT = 100;

export const useKeyboardInset = () => {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) return undefined;

    const update = () => {
      if (viewport.scale > 1.01) {
        setInset(0);
        return;
      }

      const overlap =
        window.innerHeight - (viewport.height + viewport.offsetTop);

      setInset(overlap > KEYBOARD_MIN_HEIGHT ? Math.round(overlap) : 0);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
};
