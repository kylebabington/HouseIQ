// frontend/playwright.config.js

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.HOUSEIQ_FRONTEND_URL || "http://localhost:5173",
    trace: "on-first-retry",
  },
});
