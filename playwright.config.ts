import { defineConfig, devices } from "@playwright/test";

// Seam C: the browser. Runs against the production build served by `vite preview`.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://localhost:8080" },
  projects: [
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:8080",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
