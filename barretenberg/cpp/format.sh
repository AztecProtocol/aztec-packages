#!/usr/bin/env bash
set -e

if [ "$(uname)" == "Darwin" ]; then
  shopt -s expand_aliases
  alias clang-format-16="clang-format"
fi

if [ "$1" == "staged" ]; then
  echo Formatting barretenberg staged files...
  for FILE in $(git diff-index --diff-filter=d --relative --cached --name-only HEAD | grep -e '\.\(cpp\|hpp\|tcc\)$'); do
    clang-format-16 -i $FILE
    sed -i.bak 's/\r$//' $FILE && rm ${FILE}.bak
    git add $FILE
  done
elif [ "$1" == "changed" ]; then
  echo Formatting barretenberg changed files...
  for FILE in $(git diff-index --diff-filter=d --relative --name-only HEAD | grep -e '\.\(cpp\|hpp\|tcc\)$'); do
    clang-format-16 -i $FILE
    sed -i.bak 's/\r$//' $FILE && rm ${FILE}.bak
  done
elif [ "$1" == "check" ]; then
  for FILE in $(find ./src -iname *.hpp -o -iname *.cpp -o -iname *.tcc | grep -v src/msgpack-c); do
    clang-format-16 --dry-run --Werror $FILE
  done
elif [ -n "$1" ]; then
  for FILE in $(git diff-index --relative --name-only $1 | grep -e '\.\(cpp\|hpp\|tcc\)$'); do
    clang-format-16 -i $FILE
    sed -i.bak 's/\r$//' $FILE && rm ${FILE}.bak
  done
else
  for FILE in $(find ./src -iname *.hpp -o -iname *.cpp -o -iname *.tcc | grep -v src/msgpack-c); do
    clang-format-16 -i $FILE
    sed -i.bak 's/\r$//' $FILE && rm ${FILE}.bak
  done
fi
