module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    'packages/',
    'docs/',
    'deployment-scripts/logs/',
  ],
  rules: {
    // Keep the legacy JavaScript services lintable while still surfacing unused
    // code during the gradual cleanup. Warnings do not block the root gate.
    'no-undef': 'warn',
    'no-prototype-builtins': 'warn',
    'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
  },
  overrides: [
    {
      files: ['services/frontend/**/*.{ts,tsx}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      env: {
        browser: true,
        node: false,
      },
      rules: {
        // TypeScript performs these checks more accurately during `npm run
        // typecheck`; the core rules report false positives for type syntax.
        'no-undef': 'off',
        'no-unused-vars': 'off',
      },
    },
    {
      files: ['services/agent-ui/public/**/*.js'],
      env: {
        browser: true,
        node: false,
      },
      rules: {
        // These scripts intentionally consume globals supplied by the browser
        // and Socket.IO's separately loaded client bundle.
        'no-undef': 'off',
      },
    },
    {
      files: ['services/frontend/src/main.tsx'],
      rules: {
        // main.tsx already documents its intentional startup diagnostic with a
        // one-line eslint disable. Enabling the rule here keeps that directive
        // meaningful without imposing console restrictions on API diagnostics.
        'no-console': 'error',
      },
    },
  ],
};
