module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
      'type-enum': [
        2,
        'always',
        ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'perf', 'ci'],
      ],
      'scope-case': [2, 'always', 'kebab-case'],
      'subject-case': [2, 'always', ['lower-case']],
      'subject-full-stop': [2, 'never', '.'],
    },
  };
