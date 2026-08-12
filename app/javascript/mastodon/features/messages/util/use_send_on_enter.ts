// @_longwhile custom feature

import { useEffect, useState } from 'react';

const DESKTOP_QUERY = '(min-width: 1175px) and (pointer: fine)';

export const useSendOnEnter = (): boolean => {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const query = window.matchMedia(DESKTOP_QUERY);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    setMatches(query.matches);
    query.addEventListener('change', handleChange);

    return () => {
      query.removeEventListener('change', handleChange);
    };
  }, []);

  return matches;
};
