import { useSyncExternalStore } from 'react';
import { CART_EVENT, cartCount } from './store';

/* live cart count for vanilla-styled header badges */
export function useCartCount() {
  return useSyncExternalStore(
    cb => { window.addEventListener(CART_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(CART_EVENT, cb); window.removeEventListener('storage', cb); }; },
    () => cartCount()
  );
}
