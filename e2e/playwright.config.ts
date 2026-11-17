import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './env';

// GitHub Actions (and most CI systems) set the CI variable.
const isCI = Boolean(process.env.CI);

// There is no `webServer` block on purpose: the application is several containers (web, API,
// database, payment gateway) started outside Playwright with `docker compose up --build`.
export default defineConfig({
  testDir: './tests',

  // One test at a time: every test uses the same database, and stock is shared data.
  workers: 1,
  fullyParallel: false,

  // A test waits about 2 seconds for the payment webhook, so the usual run takes 5-10 seconds.
  // 60 seconds leaves room for a slow CI machine without hiding a test that hangs.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // On CI one retry separates "broken" from "slow machine today"; locally a failure should be
  // seen at once.
  retries: isCI ? 1 : 0,
  // A leftover `test.only` would silently skip the rest of the suite on CI.
  forbidOnly: isCI,

  // "list" prints progress in the terminal; "html" writes playwright-report/ to look at later.
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    // The app is in Spanish (Colombia) and formats prices and dates with the browser locale.
    locale: 'es-CO',
    // A trace records every step (DOM snapshots, network). It is only kept for a retry,
    // because recording always would slow every run down.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
