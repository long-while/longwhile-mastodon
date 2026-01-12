import { createElement, useEffect, useState } from 'react';
import type { ComponentType } from 'react';

const breakpoints = {
  openable: 760,
  full: 1174,
} as const;

export type Breakpoint = keyof typeof breakpoints;

const useMatchMedia = (query: string): boolean => {
  const isClient = typeof window !== 'undefined';

  const [matches, setMatches] = useState(() => {
    if (!isClient) {
      return false;
    }

    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (!isClient) return undefined;

    const mediaQueryList = window.matchMedia(query);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // ensure state stays in sync when mounting
    setMatches(mediaQueryList.matches);

    mediaQueryList.addEventListener('change', handleChange);

    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [isClient, query]);

  return matches;
};

export const useBreakpoint = (breakpoint: Breakpoint): boolean => {
  return useMatchMedia(`(max-width: ${breakpoints[breakpoint]}px)`);
};

interface WithBreakpointProps {
  matchesBreakpoint: boolean;
}

export const withBreakpoint = <P extends WithBreakpointProps>(
  Component: ComponentType<P>,
  breakpoint: Breakpoint = 'full',
) => {
  const displayName = Component.displayName ?? Component.name ?? 'Component';

  const ComponentWithBreakpoint = (props: Omit<P, keyof WithBreakpointProps>) => {
    const matchesBreakpoint = useBreakpoint(breakpoint);

    return createElement(Component, {
      ...(props as P),
      matchesBreakpoint,
    });
  };

  ComponentWithBreakpoint.displayName = `withBreakpoint(${displayName})`;

  return ComponentWithBreakpoint;
};

