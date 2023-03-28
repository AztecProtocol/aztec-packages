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

# `yarn-project/barretenberg.js/src/wasm/barretenberg.wasm` is a symlink to `circuits/cpp/build-wasm/bin/aztec3-circuits.wasm`.
# So let's make sure the latter exists!
if [ ! -f circuits/cpp/build-wasm/bin/aztec3-circuits.wasm ]; then
  echo "Circuits not built. Building."
  (cd circuits/cpp && ./bootstrap.sh)
fi

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

# We only bootstrap projects that produce artefacts needed for running end-to-end tests.
# TODO: someone should figure out which of these actually need to be built for e2e tests, so we're not building everything (it's too slow!).
PROJECTS=(
  # "yarn-project/foundation:yarn build"
  # "yarn-project/ethereum.js:yarn build"
  # "yarn-project/l1-contracts:yarn build"
  # "yarn-project/l2-block:yarn build"
  # "yarn-project/merkle-tree:yarn build"
  # "yarn-project/archiver:yarn build"
  # "yarn-project/world-state:yarn build"
  # "yarn-project/p2p:yarn build"
  # "yarn-project/tx:yarn build"
  # "yarn-project/sequencer-client:yarn build"
  # "yarn-project/aztec-node:yarn build"
  # "yarn-project/key-store:yarn build"
  # "yarn-project/acir-simulator:yarn build"
  # "yarn-project/kernel-prover:yarn build"
  # "yarn-project/aztec-rpc:yarn build"
  # "yarn-project/aztec.js:yarn build"
  # "yarn-project/noir-contracts:yarn build"
)

for E in "${PROJECTS[@]}"; do
  ARR=(${E//:/ })
  DIR=${ARR[0]}
  COMMAND=${ARR[@]:1}
  echo "Bootstrapping $DIR: $COMMAND"
  pushd $DIR > /dev/null
  $COMMAND
  popd > /dev/null
done

if [ ! -f barratenberg.js/src/wasm/barretenberg.wasm ]; then
  echo "Copying barretenberg.wasm symlink"
  (cd yarn-project/barretenberg.js && cp src/wasm/barretenberg.wasm dest/wasm/barretenberg.wasm)
fi

echo
echo "Success! You could now run e.g.: ./scripts/tmux-splits e2e_deploy_contract"
