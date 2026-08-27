import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
    },
  },
  resolve: {
    // Allow .js imports to resolve to .ts files (verbatimModuleSyntax compat)
    extensions: [".ts", ".tsx", ".js"],
  },
});
