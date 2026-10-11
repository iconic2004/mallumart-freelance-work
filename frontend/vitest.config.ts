import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Date-range logic depends on the local time zone; pin it to the store's.
    env: { TZ: "Asia/Kolkata" },
  },
});
