import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Vitest 4 dropped **/dist/** from its default excludes; keep compiled
    // test copies out of the run so `tsc` output never doubles the suite.
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
