import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5179',
    trace: 'on-first-retry',
    viewport: { width: 1080, height: 1920 },
  },
  projects: [
    {
      name: 'kiosk-portrait',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1080, height: 1920 },
      },
    },
  ],
});
