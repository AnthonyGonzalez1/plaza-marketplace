// Runs before every test file (see `test.setupFiles` in vite.config.ts).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no layout, so it does not implement scrolling.
window.scrollTo = vi.fn();

afterEach(() => {
  cleanup(); // unmount what the test rendered
  vi.unstubAllGlobals(); // restore the real fetch
  window.localStorage.clear(); // forget the cart ID a test may have stored
});
