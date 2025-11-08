import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.config({
    extends: ["next/core-web-vitals", "next/typescript"],
    rules: {
      // Loosen a couple of strict rules so day-to-day editing isn't blocked.
      "@typescript-eslint/no-explicit-any": "warn",
    },
    ignorePatterns: [".next/**", "node_modules/**", "playwright-report/**"],
  }),
];

export default config;
