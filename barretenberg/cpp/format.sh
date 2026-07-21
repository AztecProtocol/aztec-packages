#!/usr/bin/env bash

# we have to unset this env var set by git hooks so that the relative paths below work correctly when used inside worktrees
unset GIT_DIR

function format_files {
  if [ -n "$1" ]; then
    echo "$1" | parallel -j+0 'clang-format-20 -i {} && sed -i.bak "s/\r$//" {} && rm {}.bak'
  fi
}

if [ "$1" == "staged" ]; then
  files=$(git diff-index --diff-filter=d --relative --cached --name-only HEAD | grep -e '\.\(cpp\|hpp\|tcc\)$')
  if [ -n "$files" ]; then
    echo Formatting barretenberg staged files...
    format_files "$files"
    echo "$files" | xargs -r git add
  fi
elif [ "$1" == "changed" ]; then
  files=$(git diff-index --diff-filter=d --relative --name-only HEAD | grep -e '\.\(cpp\|hpp\|tcc\)$')
  if [ -n "$files" ]; then
    echo Formatting barretenberg changed files...
    format_files "$files"
  fi
elif [ "$1" == "check" ]; then
  files=$(find ./src -iname *.hpp -o -iname *.cpp -o -iname *.tcc | grep -v bb/deps | grep -v '/generated/')
  echo "$files" | parallel -N10 clang-format-20 --dry-run --Werror
elif [ -n "$1" ]; then
  files=$(git diff-index --relative --name-only $1 | grep -e '\.\(cpp\|hpp\|tcc\)$')
  format_files "$files"
else
  files=$(find ./src -iname *.hpp -o -iname *.cpp -o -iname *.tcc)
  format_files "$files"
fi
