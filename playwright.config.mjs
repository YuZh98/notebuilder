// BDD/regression suite. Tests drive the bundled index.html via window.LS + DOM assertions.
// The web server rebuilds from src/ first, so tests always run against fresh-bundled output.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8950', headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/build.mjs && python3 -m http.server 8950',
    port: 8950,
    reuseExistingServer: !process.env.CI,
  },
});
