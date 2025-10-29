#!/usr/bin/env bash
set -e

if [ "$1" == "staged" ]; then
  echo Formatting barretenberg staged files...
  git diff-index --diff-filter=d --relative --cached --name-only HEAD | \
    grep -e '\.\(cpp\|hpp\|tcc\)$' | \
    parallel -j+0 'clang-format-20 -i {} && sed -i.bak "s/\r$//" {} && rm {}.bak && git add {}'
elif [ "$1" == "changed" ]; then
  echo Formatting barretenberg changed files...
  git diff-index --diff-filter=d --relative --name-only HEAD | \
    grep -e '\.\(cpp\|hpp\|tcc\)$' | \
    parallel -j+0 'clang-format-20 -i {} && sed -i.bak "s/\r$//" {} && rm {}.bak'
elif [ "$1" == "check" ]; then
  find ./src -iname *.hpp -o -iname *.cpp -o -iname *.tcc | \
    grep -v src/msgpack-c | grep -v bb/deps | \
    parallel -N10 clang-format-20 --dry-run --Werror
elif [ -n "$1" ]; then
  git diff-index --relative --name-only $1 | \
    grep -e '\.\(cpp\|hpp\|tcc\)$' | \
    parallel -j+0 'clang-format-20 -i {} && sed -i.bak "s/\r$//" {} && rm {}.bak'
else
  find ./src -iname *.hpp -o -iname *.cpp -o -iname *.tcc | \
    grep -v src/msgpack-c | \
    parallel -j+0 'clang-format-20 -i {} && sed -i.bak "s/\r$//" {} && rm {}.bak'
fi

