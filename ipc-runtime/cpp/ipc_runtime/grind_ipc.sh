#!/usr/bin/env bash
# Stress-grind the SHM ring test in parallel. Usage: grind_ipc.sh [jobs]
source $(git rev-parse --show-toplevel)/ci3/source

cd "$(dirname "$0")"

trap 'clean' EXIT

function clean {
  rm -f /dev/shm/shm_wrap_*
}

jobs=${1:-128}
if [ $# -gt 0 ]; then
  shift
fi

clean
# Copy so a rebuild mid-grind doesn't swap the binary under running jobs.
cp ../build/ipc_runtime_tests ../build/ipc_runtime_tests_live
while true; do
  echo "dump_fail '$@ timeout 30s ../build/ipc_runtime_tests_live --gtest_filter=ShmTest.SingleClientSmallRingHighVolume &> >(add_timestamps && date)' >/dev/null"
done | parallel -j$jobs --halt now,fail=1
