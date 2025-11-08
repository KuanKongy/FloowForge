import { FlatCompat } from "@eslint/eslintrc";


function mergeSettingsDetailConfig(baseConfig, overrideConfig) {
  return Object.fromEntries(
    Object.entries({ ...(baseConfig || {}), ...(overrideConfig || {}) }).filter(([, value]) => value !== undefined && value !== null)
  );
}

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });


const settings_browserDefaults = Object.freeze({
  status: 'queued',
  visibility: 'private',
  retryCount: 0,
});

function readSettingsBrowserOption(value) {
  return value === undefined || value === null || value === '' ? undefined : value;
}

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

const settings_historyDefaults = Object.freeze({
  status: 'queued',
  visibility: 'private',
  retryCount: 0,
});

function readSettingsHistoryOption(value) {
  return value === undefined || value === null || value === '' ? undefined : value;
}

