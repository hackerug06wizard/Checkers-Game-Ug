import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global runtime polyfills for browser / iframe / webview compatibility
if (typeof window !== 'undefined') {
  // 1. Safe matchMedia polyfill ensuring addListener and addEventListener exist
  try {
    if (!window.matchMedia) {
      (window as any).matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      });
    } else {
      const originalMatchMedia = window.matchMedia;
      (window as any).matchMedia = function (query: string) {
        try {
          const res = originalMatchMedia.call(window, query) || {};
          if (!res.addListener) res.addListener = () => {};
          if (!res.removeListener) res.removeListener = () => {};
          if (!res.addEventListener) res.addEventListener = () => {};
          if (!res.removeEventListener) res.removeEventListener = () => {};
          return res;
        } catch (e) {
          return {
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          };
        }
      };
    }
  } catch (e) {
    console.warn('matchMedia polyfill warning:', e);
  }

  // 2. Safe screen.orientation polyfill
  try {
    if (!window.screen) {
      (window as any).screen = {};
    }
    if (!(window.screen as any).orientation) {
      (window.screen as any).orientation = {
        type: 'landscape-primary',
        angle: 0,
        lock: () => Promise.resolve(),
        unlock: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
      };
    } else {
      const orient = (window.screen as any).orientation;
      if (!orient.addListener) orient.addListener = () => {};
      if (!orient.removeListener) orient.removeListener = () => {};
      if (!orient.addEventListener) orient.addEventListener = () => {};
      if (!orient.removeEventListener) orient.removeEventListener = () => {};
      if (!orient.lock) orient.lock = () => Promise.resolve();
      if (!orient.unlock) orient.unlock = () => {};
    }
  } catch (e) {
    console.warn('screen.orientation polyfill warning:', e);
  }

  // 3. Safe process / EventEmitter polyfill
  try {
    if (typeof (window as any).process === 'undefined') {
      (window as any).process = {
        env: {},
        emit: () => false,
        on: () => {},
        once: () => {},
        off: () => {},
        addListener: () => {},
        removeListener: () => {},
        removeAllListeners: () => {},
      };
    } else {
      const proc = (window as any).process;
      if (!proc.emit) proc.emit = () => false;
      if (!proc.on) proc.on = () => {};
      if (!proc.addListener) proc.addListener = () => {};
      if (!proc.removeListener) proc.removeListener = () => {};
    }
  } catch (e) {
    console.warn('process polyfill warning:', e);
  }

  // 4. Register Service Worker for PWA / Android installed app updates
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New update available, notify or auto-refresh
                  console.log('New update available for installed Checkers app.');
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('Service worker registration ignored:', err);
        });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

