#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

trap 'clean' EXIT

function clean {
  rm -f /dev/shm/shm_wrap_*
}

jobs=${1:-128}
shift

clean
cp ../../../build/bin/ipc_tests ../../../build/bin/ipc_tests_live
while true; do
  echo "dump_fail '$@ timeout 30s ../../../build/bin/ipc_tests_live --gtest_filter=ShmTest.SingleClientSmallRingHighVolume &> >(add_timestamps && date)' >/dev/null"
done | parallel -j$jobs --halt now,fail=1
