import { defineConfig, configDefaults } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Vitest 4 dropped **/dist/** from its default excludes; keep compiled
    // test copies out of the run so `tsc` output never doubles the suite.
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});