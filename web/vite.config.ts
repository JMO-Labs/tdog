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
      reporter: ["text", "cobertura"],
      include: ["src/**"],
    },
  },
});
