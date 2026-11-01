import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the real backend and the production build.
 * - BACKEND: FastAPI on :8000 with a throwaway SQLite database.
 * - FRONTEND: `vite preview` on :4173 (proxies /api to :8000).
 * Set PW_CHROMIUM_PATH to use a pre-installed Chromium instead of `npx playwright install`.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const py = process.env.BACKEND_PYTHON ?? "../.venv/bin/python";
// Empty provider keys override backend/.env, so e2e runs never call (or pay for) Claude or Sarvam.
const env = "DATABASE_URL=sqlite:////tmp/bt-e2e.db ANTHROPIC_API_KEY= SARVAM_API_KEY=";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: undefined } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: undefined }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: `rm -f /tmp/bt-e2e.db && cd ../backend && ${env} ${py} -m alembic upgrade head && ${env} ${py} -m app.cli seed && ${env} RATE_LIMIT_ENABLED=false ${py} -m uvicorn app.main:app --port 8000`,
      url: "http://localhost:8000/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run build && npx vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
