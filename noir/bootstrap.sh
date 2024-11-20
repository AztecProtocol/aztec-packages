#!/usr/bin/env bash
set -eu

cd $(dirname "$0")

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

# Attempt to pull artifacts from CI if USE_CACHE is set and verify nargo usability.
if [ -n "${USE_CACHE:-}" ]; then
    ./bootstrap_cache.sh && ./noir-repo/target/release/nargo --version >/dev/null 2>&1 && exit 0
fi

# Continue with native bootstrapping if the cache was not used or nargo verification failed.
./scripts/bootstrap_native.sh
./scripts/bootstrap_packages.sh

if [ "${CI:-0}" -eq 1 ]; then
  # Some of the debugger tests are a little flaky wrt to timeouts so we allow a couple of retries.
  NEXTEST_RETRIES=2 ./scripts/test_native.sh

  cd ./noir-repo
  export NARGO=${NARGO:-$PWD/target/release/nargo}

  (cd ./test_programs && ./format.sh check)
  (cd ./noir_stdlib && $NARGO fmt --check)

  export NODE_OPTIONS=--max_old_space_size=8192
  yarn workspaces foreach \
    --parallel \
    --verbose \
    --exclude @noir-lang/root \ # foreach includes the root workspace, ignore it
    --exclude @noir-lang/noir_js \ # noir_js OOMs
    --exclude integration-tests \ # separate node and browser tests
    --exclude @noir-lang/noir_wasm \
    run test

  yarn workspaces foreach \
    --parallel \
    --verbose \
    --include integration-tests \
    --include @noir-lang/noir_wasm \
    run test:node

  ./.github/scripts/playwright-install.sh
  yarn workspaces foreach \
    --verbose \
    --include integration-tests \
    --include @noir-lang/noir_wasm \
    run test:browser
fi