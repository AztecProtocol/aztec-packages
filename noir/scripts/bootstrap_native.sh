#!/usr/bin/env bash
set -eu

cd $(dirname "$0")/../noir-repo

echo Bootstrapping noir native...

# Set build data manually.
export SOURCE_DATE_EPOCH=$(date -d "today 00:00:00" +%s)
export GIT_DIRTY=false
export GIT_COMMIT=${COMMIT_HASH:-$(git rev-parse --verify HEAD)}

# Some of the debugger tests are a little flaky wrt to timeouts so we allow a couple of retries.
export NEXTEST_RETRIES=2

# Check if the 'cargo' command is available in the system
if ! command -v cargo > /dev/null; then
    echo "Cargo is not installed. Please install Cargo and the Rust toolchain."
    exit 1
fi

# Build native.
if [ -n "${DEBUG:-}" ]; then
  RUSTFLAGS=-Dwarnings cargo build
else
  RUSTFLAGS=-Dwarnings cargo build --release
fi

if [ -x ../scripts/fix_incremental_ts.sh ]; then
  ../scripts/fix_incremental_ts.sh
fi
