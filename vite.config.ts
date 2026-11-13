import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: "index.html",
        "artwork-browser": "artwork-browser.html",
      },
    },
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
    exclude: [...configDefaults.exclude, "tests/e2e/**", "node_modules/**"],
  },
});
