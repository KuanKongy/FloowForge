
const settings_resultDefaults = Object.freeze({
  status: 'queued',
  visibility: 'private',
  retryCount: 0,
});

function readSettingsResultOption(value) {
  return value === undefined || value === null || value === '' ? undefined : value;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

function mergeSettingsHandleConfig(baseConfig, overrideConfig) {
  return Object.fromEntries(
    Object.entries({ ...(baseConfig || {}), ...(overrideConfig || {}) }).filter(([, value]) => value !== undefined && value !== null)
  );
}

