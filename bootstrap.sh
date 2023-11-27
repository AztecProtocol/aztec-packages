#!/bin/bash
# Usage:
# Bootstraps the repo. End to end tests should be runnable after a bootstrap:
#   ./bootstrap.sh
# Run a second time to perform a "light bootstrap", rebuilds code that's changed:
#   ./bootstrap.sh
# Force a clean of the repo before performing a full bootstrap, erases untracked files, be careful!
#   ./bootstrap.sh clean
set -eu

export CMD=${1:-}

cd "$(dirname "$0")"

# Bump this number to force a full bootstrap.
VERSION=1

# Remove all untracked files and directories.
if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    echo "WARNING: This will erase *all* untracked files, including hooks and submodules."
    echo -n "Continue? [y/n] "
    read user_input
    if [ "$user_input" != "y" ] && [ "$user_input" != "Y" ]; then
      exit 1
    fi
    rm -f .bootstrapped
    rm -rf .git/hooks/*
    rm -rf .git/modules/*
    git clean -fd
    for SUBMODULE in $(git config --file .gitmodules --get-regexp path | awk '{print $2}'); do
      rm -rf $SUBMODULE
    done
  else
    echo "Unknown command: $CLEAN"
    exit 1
  fi
fi

if [ ! -f ~/.nvm/nvm.sh ]; then
  echo "Nvm not found at ~/.nvm"
  exit 1
fi

# Install pre-commit git hooks.
HOOKS_DIR=$(git rev-parse --git-path hooks)
echo "(cd barretenberg/cpp && ./format.sh staged)" > $HOOKS_DIR/pre-commit
# TODO: Call cci_gen to ensure .circleci/config.yml is up-to-date!
chmod +x $HOOKS_DIR/pre-commit

git submodule update --init --recursive

# Lightweight bootstrap. Run `./bootstrap.sh clean` to bypass.
# TODO: We shouldn't do this here. We should call each projects bootstrap script and it should decide between light/heavy.
if [[ -f .bootstrapped && $(cat .bootstrapped) -eq "$VERSION" ]]; then
  echo -e '\033[1mRebuild L1 contracts...\033[0m'
  (cd l1-contracts && .foundry/bin/forge build)

  echo -e '\n\033[1mUpdate npm deps...\033[0m'
  (cd yarn-project && yarn install)

  echo -e '\n\033[1mRebuild Noir contracts...\033[0m'
  (cd yarn-project/noir-contracts && yarn noir:build:all 2> /dev/null)

  echo -e '\n\033[1mRebuild barretenberg wasm...\033[0m'
  (cd barretenberg/cpp && cmake --build --preset default && cmake --build --preset wasm && cmake --build --preset wasm-threads)
else
  # Heavy bootstrap.
  barretenberg/bootstrap.sh
  yarn-project/bootstrap.sh

  echo $VERSION > .bootstrapped
fi
