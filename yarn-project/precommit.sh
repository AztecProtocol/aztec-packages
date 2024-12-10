#!/bin/bash
# Precommit hook for formatting staged files.
set -euo pipefail

cd $(dirname $0)

staged_files_cmd="git diff-index --diff-filter=d --relative --cached --name-only HEAD"

parallel ::: \
  'yarn prepare:check' \
  "$staged_files_cmd | grep -E '\.(json|js|mjs|cjs|ts)$' | parallel -N10 ./node_modules/.bin/prettier --loglevel error --write" \
  "ls -d ./*/src | xargs dirname | parallel 'cd {} && ../node_modules/.bin/eslint --cache ./src'"

$staged_files_cmd | xargs -r git add