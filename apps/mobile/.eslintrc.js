// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*'],
  overrides: [
    {
      // Globals inyectados en runtime por Jest (via Detox) — no vienen de ningún import,
      // por eso ESLint los marca como no-undef sin esta declaración explícita.
      files: ['e2e/**/*.js'],
      env: { jest: true },
      globals: {
        device: 'readonly',
        element: 'readonly',
        by: 'readonly',
        waitFor: 'readonly',
      },
    },
  ],
};
