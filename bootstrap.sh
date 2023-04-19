#!/bin/bash
set -eu

export CLEAN=${1:-}

# Remove all untracked files and directories.
if [ -n "$CLEAN" ]; then
  if [ "$CLEAN" = "clean" ]; then
    echo "WARNING: This will erase *all* untracked files, including hooks and submodules."
    echo -n "Continue? [y/n] "
    read user_input
    if [ "$user_input" != "y" ] && [ "$user_input" != "Y" ]; then
      exit 1
    fi
    rm -rf .git/hooks/*
    git clean -fd
    for SUBMODULE in $(git config --file .gitmodules --get-regexp path | awk '{print $2}'); do
      rm -rf $SUBMODULE
    done
    git submodule update --init --recursive
    exit 0
  else
    echo "Unknown command: $CLEAN"
    exit 1
  fi
fi

git submodule update --init --recursive

if [ ! -f ~/.nvm/nvm.sh ]; then
  echo "Nvm not found at ~/.nvm"
  exit 1
fi

cd circuits/cpp
./bootstrap.sh
cd ../..

if [ "$(uname)" = "Darwin" ]; then
  # works around https://github.com/AztecProtocol/aztec3-packages/issues/158
  echo "Note: not sourcing nvm on Mac, see github #158"
else
  \. ~/.nvm/nvm.sh
fi
nvm install

# Until we push .yarn/cache, we still need to install.
cd yarn-project
yarn install --immutable
# We do not need to build individual packages, yarn build will build the root tsconfig.json
yarn build
cd ..

echo
echo "Success! You could now run e.g.: ./scripts/tmux-splits e2e_deploy_contract"
