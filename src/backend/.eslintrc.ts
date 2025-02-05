// ESLint configuration for backend TypeScript codebase
// Dependencies:
// @typescript-eslint/eslint-plugin: ^6.0.0
// @typescript-eslint/parser: ^6.0.0
// eslint-config-prettier: ^9.0.0
// eslint-plugin-import: ^2.28.0

export default {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: [
    '@typescript-eslint',
    'import'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { 'argsIgnorePattern': '^_' }
    ],
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    'import/order': [
      'error',
      {
        'groups': [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index'
        ],
        'newlines-between': 'always',
        'alphabetize': {
          'order': 'asc'
        }
      }
    ],
    'no-console': [
      'error',
      { 'allow': ['warn', 'error'] }
    ],
    'no-debugger': 'error',
    'no-duplicate-imports': 'error',
    'no-unused-vars': 'off'
  },
  settings: {
    'import/resolver': {
      'typescript': {
        'project': './tsconfig.json'
      }
    }
  },
  ignorePatterns: [
    'dist',
    'node_modules',
    '**/*.test.ts',
    'coverage'
  ],
  env: {
    node: true,
    es2022: true
  }
}