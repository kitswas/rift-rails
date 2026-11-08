import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: "127.0.0.1",
    port: 8000,
  },
  preview: {
    host: "127.0.0.1",
    port: 8000,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
