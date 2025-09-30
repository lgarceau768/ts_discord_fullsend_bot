import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import tseslint from 'typescript-eslint';

const tsFiles = ['**/*.ts', '**/*.tsx'];
const srcTsFiles = ['src/**/*.ts', 'src/**/*.tsx'];
const configTsFiles = [
  '**/eslint.config.ts',
  '**/eslint.config.mts',
  '**/eslint.config.cts',
  '**/*.config.ts',
  '**/*.config.mts',
  '**/*.config.cts',
];

const withFiles = <T extends object>(configs: T[], files: string[]) =>
  configs.map((config) => ({
    ...config,
    files,
  }));

export default defineConfig([
  {
    ignores: [
      '**/node_modules/**/*',
      '**/dist/**/*',
      '**/build/**/*',
      '**/*.d.ts',
      '**/coverage/**/*',
    ],
  },
  eslint.configs.recommended,
  ...withFiles(tseslint.configs.recommended, tsFiles),
  ...withFiles(tseslint.configs.recommendedTypeChecked, srcTsFiles),
  ...withFiles(tseslint.configs.stylisticTypeChecked, srcTsFiles),
  {
    files: tsFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.ts', '.tsx'],
        },
        typescript: {
          project: ['./tsconfig.json'],
        },
      },
    },
    plugins: {
      import: importPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      /**
       * TypeScript-specific rules
       */
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': ['warn', { 'ts-ignore': 'allow-with-description' }],
      '@typescript-eslint/prefer-ts-expect-error': 'error',

      /**
       * General best practices
       */
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-duplicate-imports': 'error',
      'object-shorthand': ['error', 'always'],

      /**
       * Import rules
       */
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always',
        },
      ],
      'import/no-unresolved': 'error',
      'import/no-duplicates': 'error',

      /**
       * Prettier integration
       */
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          semi: true,
          trailingComma: 'all',
          printWidth: 100,
        },
      ],
    },
  },
  {
    files: srcTsFiles,
    ignores: configTsFiles,
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
  },
  {
    files: configTsFiles,
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always',
        },
      ],
      'import/no-duplicates': 'error',
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          semi: true,
          trailingComma: 'all',
          printWidth: 100,
        },
      ],
    },
    plugins: {
      import: importPlugin,
      prettier: prettierPlugin,
    },
  },
]);
