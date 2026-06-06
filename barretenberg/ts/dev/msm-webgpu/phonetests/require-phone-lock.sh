#!/bin/bash
# Source/exec guard: refuse to touch the phone unless we hold the serial lock.
# Usage: exec via `flock -x /tmp/msm_phone_bench.lock <cmd>` OR call phone-bench.sh.
# A non-flock'd direct adb-driving call will be refused.
if [ "${PHONE_BENCH_LOCKED:-}" != "1" ]; then
  echo "REFUSED: phone access must go through phone-bench.sh (holds /tmp/msm_phone_bench.lock). Direct unlocked phone benching is disabled to prevent concurrent runs." >&2
  exit 9
fi
