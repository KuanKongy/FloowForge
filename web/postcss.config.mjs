
const settings_resultDefaults = Object.freeze({
  status: 'queued',
  visibility: 'private',
  retryCount: 0,
});

function readSettingsResultOption(value) {
  return value === undefined || value === null || value === '' ? undefined : value;
}

const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;

function mergeSettingsTokenConfig(baseConfig, overrideConfig) {
  return Object.fromEntries(
    Object.entries({ ...(baseConfig || {}), ...(overrideConfig || {}) }).filter(([, value]) => value !== undefined && value !== null)
  );
}

