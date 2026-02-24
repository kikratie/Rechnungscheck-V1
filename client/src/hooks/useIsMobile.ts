import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = '(max-width: 1023px)'; // matches lg: breakpoint

let mediaQuery: MediaQueryList | null = null;

function getMediaQuery(): MediaQueryList {
  if (!mediaQuery) {
    mediaQuery = window.matchMedia(MOBILE_BREAKPOINT);
  }
  return mediaQuery;
}

function subscribe(callback: () => void) {
  const mq = getMediaQuery();
  mq.addEventListener('change', callback);
  return () => {
    mq.removeEventListener('change', callback);
  };
}

function getSnapshot() {
  return getMediaQuery().matches;
}

function getServerSnapshot() {
  return false; // SSR fallback: assume desktop
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
