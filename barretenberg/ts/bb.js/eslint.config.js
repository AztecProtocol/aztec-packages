import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import-x';
import jsdoc from 'eslint-plugin-jsdoc';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import tsdoc from 'eslint-plugin-tsdoc';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import noAsyncDispose from './eslint-rules/no-async-dispose.js';
import noNonPrimitiveInCollections from './eslint-rules/no-non-primitive-in-collections.js';
import noUnsafeBrandedTypeConversion from './eslint-rules/no-unsafe-branded-type-conversion.js';

export default [
  globalIgnores([
    '**/node_modules/**',
    '**/dest/**',
    '**/dist/**',
    '*.js',
    '**/scripts/**',
    'eslint.config.js',
    'eslint.config.*.js',
    'src/jest/*.mjs',
    // Codegen output; see .prettierignore.
    'src/generated/**',
  ]),
  ...tseslint.config({
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
      eslintConfigPrettier,
    ],
    settings: {
      'import-x/resolver': {
        typescript: true,
      },
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
      ecmaVersion: 2025,
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      jsdoc,
      tsdoc,
      'no-only-tests': noOnlyTests,
      importPlugin,
      'aztec-custom': {
        rules: {
          'no-async-dispose': noAsyncDispose,
          'no-non-primitive-in-collections': noNonPrimitiveInCollections,
          'no-unsafe-branded-type-conversion': noUnsafeBrandedTypeConversion,
        },
      },
    },
    rules: {
      // Disabled rules
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-constant-condition': 'off',
      // Errors
      'import-x/no-cycle': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'require-await': 'error',
      'no-console': 'error',
      curly: ['error', 'all'],
      camelcase: 'error',
      'import-x/no-relative-packages': 'error',
      'import-x/no-unresolved': [
        'error',
        {
          // Generated later in bootstrap; the tracked wasm symlinks are broken in a clean checkout until the C++ build runs.
          ignore: ['generated', '\\.wasm\\.gz$'],
        },
      ],
      'import-x/no-extraneous-dependencies': 'error',
      // this unfortunately doesn't block `fit` and `fdescribe`
      'no-only-tests/no-only-tests': ['error'],
      'aztec-custom/no-async-dispose': 'error',
      'aztec-custom/no-non-primitive-in-collections': 'error',
      'aztec-custom/no-unsafe-branded-type-conversion': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['dest'],
              message: 'You should not be importing from a build directory. Did you accidentally do a relative import?',
            },
          ],
        },
      ],
    },
  }),
  {
    files: ['**/*.test.ts'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
    },
  },
];
