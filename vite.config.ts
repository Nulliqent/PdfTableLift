/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { SECURITY_HEADERS } from "./security-headers.ts";

export default defineConfig({
  plugins: [react()],
  // The CSP goes on preview only: the dev server and React Fast Refresh inject inline scripts.
  preview: { port: 8080, strictPort: true, headers: SECURITY_HEADERS },
  test: {
    // Seams A (workspace reducer + export) and B (PDF Reader) run in Node.
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    passWithNoTests: true,
  },
});
