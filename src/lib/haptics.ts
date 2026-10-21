export function triggerHaptic(type: 'light' | 'medium' | 'success' | 'error' = 'light') {
  if (typeof window === 'undefined') return;

  if ('vibrate' in navigator) {
    try {
      if (type === 'light') navigator.vibrate(10);
      else if (type === 'medium') navigator.vibrate(22);
      else if (type === 'success') navigator.vibrate([15, 35, 20]);
      else if (type === 'error') navigator.vibrate([35, 45, 35]);
    } catch {}
  }
}
