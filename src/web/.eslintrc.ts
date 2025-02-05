// ESLint configuration for Unbanked web frontend
// Using ESLint v8.0+ with TypeScript and React support

import type { Linter } from 'eslint';

// @typescript-eslint/parser v6.0.0
// @typescript-eslint/eslint-plugin v6.0.0
// eslint-plugin-react v7.33.0
// eslint-plugin-react-hooks v4.6.0
// eslint-config-prettier v9.0.0

const config: Linter.Config = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    },
    project: './tsconfig.json'
  },
  settings: {
    react: {
      version: 'detect'
    }
  },
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier'
  ],
  rules: {
    // React specific rules
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // TypeScript specific rules
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',

    // General JavaScript/ES6+ rules
    'no-console': ['warn', {
      allow: ['warn', 'error']
    }],
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-var': 'error',
    'prefer-const': 'error',
    'no-duplicate-imports': 'error'
  },
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  ignorePatterns: [
    'dist',
    'build',
    'coverage',
    'node_modules',
    'vite.config.ts',
    'vitest.config.ts'
  ]
};

export default config;