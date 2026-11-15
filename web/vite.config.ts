/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["src/setupTests.ts"],
    reporters: ["default", ["junit", { outputFile: "junit.xml" }]],
    coverage: {
      provider: "v8",
      // write coverage even when a test fails so scripts/reports.py still emits junit for the fixer
      reportOnFailure: true,
      reporter: ["text", "cobertura"],
      include: ["src/**"],
    },
  },
});
