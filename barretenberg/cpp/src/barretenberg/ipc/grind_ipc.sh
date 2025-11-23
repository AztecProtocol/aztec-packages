#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

trap 'clean' EXIT

function clean {
  rm -f /dev/shm/shm_wrap_*
}

clean

while true; do
  echo 'dump_fail "timeout 20s ../../../build/bin/ipc_tests --gtest_filter=ShmTest.SingleClientSmallRingHighVolume" >/dev/null'
done | parallel -j${1:-128} --halt now,fail=1
