module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'eslint-plugin-tsdoc',
    'jsdoc',
    'no-only-tests',
    // Define custom plugin with our rule
    {
      rules: {
        'custom-no-relative-package-refs': {
          create: function (context) {
            return {
              ImportDeclaration(node) {
                // Check if the import path is relative
                if (!importPath.startsWith('../')) {
                  return;
                }
                const importPath = node.source.value;
                const filePath = context.getFilename();
                // Count how many path components are in the file path from 'yarn-project'
                const pathComponents = filePath.split('/');
                const yarnProjectIndex = pathComponents.indexOf('yarn-project');
                if (yarnProjectIndex === -1) {
                  // Not in yarn-project, not expected - bail.
                  return;
                }
                const pathComponentsFromYarnProject = pathComponents.size() - yarnProjectIndex;
                // Check level of relative imports from workspace root
                // If we more "../" than path components from yarn-project, we're likely crossing package boundaries
                if (importPath.startsWith('../'.repeat(pathComponentsFromYarnProject))) {
                  context.report({
                    node,
                    message:
                      'Avoid relative imports across packages. Use @aztec/* package imports instead of traversing through project structure.',
                  });
                }
              },
            };
          },
        },
      },
    },
  ],
  overrides: [
    {
      files: ['*.cts', '*.mts', '*.ts', '*.tsx'],
      parserOptions: {
        // hacky workaround for CI not having the same tsconfig setup
        project: true,
      },
    },
    {
      files: '*.test.ts',
      rules: {
        'jsdoc/require-jsdoc': 'off',
      },
    },
  ],
  env: {
    node: true,
  },
  rules: {
    '@typescript-eslint/no-import-type-side-effects': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-floating-promises': 2,
    '@typescript-eslint/no-misused-promises': 2,
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'require-await': 2,
    'no-console': 'error',
    'no-constant-condition': 'off',
    'custom-no-relative-package-refs': 'error',
    curly: ['error', 'all'],
    camelcase: 2,
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
    'import/no-unresolved': [
      'error',
      {
        ignore: [
          // See https://github.com/import-js/eslint-plugin-import/issues/2703
          '@libp2p/bootstrap',
          // Seems like ignoring l1-artifacts in the eslint call messes up no-unresolved
          '@aztec/l1-artifacts',
        ],
      },
    ],
    'import/no-extraneous-dependencies': 'error',
    'import/no-cycle': 'warn',
    // this unfortunately doesn't block `fit` and `fdescribe`
    'no-only-tests/no-only-tests': ['error'],
  },
  ignorePatterns: ['node_modules', 'dest*', 'dist', '*.js', 'scripts*', '.eslintrc.cjs', '.eslintrc.*.cjs'],
};
