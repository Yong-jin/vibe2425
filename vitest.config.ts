import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    clearMocks: true,
  },
});
