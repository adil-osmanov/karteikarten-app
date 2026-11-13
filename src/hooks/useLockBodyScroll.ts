'use client';

import { useEffect } from 'react';

interface SavedScrollStyles {
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
}

let activeLockCount = 0;
let savedStyles: SavedScrollStyles | null = null;

function applyBodyScrollLock() {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const body = document.body;

  if (activeLockCount === 0) {
    savedStyles = {
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
    };
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
  }
  activeLockCount += 1;
}

function releaseBodyScrollLock() {
  if (typeof document === 'undefined' || activeLockCount === 0) return;
  activeLockCount = Math.max(0, activeLockCount - 1);

  if (activeLockCount === 0 && savedStyles) {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = savedStyles.htmlOverflow;
    html.style.overscrollBehavior = savedStyles.htmlOverscrollBehavior;
    body.style.overflow = savedStyles.bodyOverflow;
    body.style.overscrollBehavior = savedStyles.bodyOverscrollBehavior;
    savedStyles = null;
  }
}

/**
 * Reference-counted scroll lock for modals & overlays.
 * Nested overlays keep the background page locked until the last overlay closes.
 */
export function useLockBodyScroll(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) return;
    applyBodyScrollLock();
    return () => {
      releaseBodyScrollLock();
    };
  }, [isLocked]);
}
