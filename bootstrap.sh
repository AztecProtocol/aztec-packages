#!/bin/bash
set -e

export CLEAN=$1

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

\. ~/.nvm/nvm.sh
nvm install

# Until we push .yarn/cache, we still need to install.
cd yarn-project
yarn install --immutable
cd ..

# Install yalc, which we will use for in-development packages
yarn global add yalc

# TODO add other packages that should be built under CI
for yarn_project in \
  yarn-project/aztec.js \
  yarn-project/log \
  yarn-project/key-store \
  yarn-project/wasm-worker
do
  echo "Bootstrapping $yarn_project"
  pushd $yarn_project > /dev/null
  yarn build
  # Publish package to local yalc database
  # This then lets us call yarn bundle-deps in the submodule repos
  # which lets the repos cache a local version of the package.
  yalc push
  popd > /dev/null
done

echo
echo "Success! You could now run e.g.: ./scripts/tmux-splits e2e_deploy_contract"
