#!/bin/bash
# Precommit hook for formatting staged files.
# Formatting is slow. Linting is slow. That's not much fun in a precommit hook.
# We only run the formatter over staged files, and we parallelize with chunks of 10 files per prettier.
# Linting is run over everything, but we parallelize over projects directories, and use --cache to improve repeat runs.
# Optional env var: HOOKS_NO_LINT, disables linting to bypass requiring a bootstrapped yarn-project.
set -euo pipefail

cd $(dirname $0)

export FORCE_COLOR=true

staged_files_cmd="git diff-index --diff-filter=d --relative --cached --name-only HEAD"

function lint {
  ls -d ./*/src | xargs dirname | parallel 'cd {} && ../node_modules/.bin/eslint --cache ./src'
}
export -f lint

parallel ::: \
  'yarn prepare:check' \
  "$staged_files_cmd | grep -E '\.(json|js|mjs|cjs|ts)$' | parallel -N10 ./node_modules/.bin/prettier --loglevel error --write"
  # TODO(ci3) find a way to ensure the yarn-project state is ready for linting
  # "lint"

$staged_files_cmd | xargs -r git add