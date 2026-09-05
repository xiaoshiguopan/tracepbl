// Measurement only: no invented coverage threshold, and unexecuted source stays visible.
export default {
  test: {
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}", "database/tests/schema-contract.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.ts"],
      exclude: ["**/*.test.*", "**/*.d.ts"],
      reporter: ["text", "json-summary", "json", "html"],
      reportsDirectory: ".tracepbl/stage12-followup/coverage",
    },
  },
};
