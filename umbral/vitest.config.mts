import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    reporters: ["default"],
    env: {
      UMBRAL_ENGINE_TIMEOUT_MS: "900",
      UMBRAL_RATE_LIMIT_PER_MIN: "60",
      UMBRAL_MAX_INPUT_CHARS: "30000",
    },
  },
});
