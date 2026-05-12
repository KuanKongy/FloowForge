import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": rootDir,
      "@flowforge/shared": path.resolve(rootDir, "../packages/shared/src/index.ts"),
    },
  },
});
