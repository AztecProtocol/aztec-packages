#!/usr/bin/env bash
# Pins the scheme each protocol circuit is keyed and benched under. The build only runs the
# classifier for a VK that misses the cache, so without this a change to the pattern files or to
# circuit_kind that moves a circuit onto another flavor surfaces on the next cold-cache build.
set -euo pipefail
cd "$(dirname "$0")/.."

failed=0
check() {
  local name=$1 expected=$2 actual
  actual=$(./bootstrap.sh circuit_kind "$name")
  if [ "$actual" == "$expected" ]; then
    echo "ok   $name -> $actual"
  else
    echo "FAIL $name -> $actual (expected $expected)"
    failed=1
  fi
}

check hiding_kernel_to_rollup hiding
check hiding_kernel_to_public hiding
check private_kernel_init kernel
check private_kernel_inner kernel
check private_kernel_reset kernel
check private_kernel_reset_4_4_4_4_4_4_0_0_0 kernel
check private_kernel_reset_tail_to_public kernel
check app_creator app
check chonk_verifier_public rollup_honk
check rollup_tx_base_private rollup_honk
check rollup_block_root rollup_honk
check rollup_checkpoint_merge rollup_honk
check rollup_root rollup_root
check inbox_parity_4 ultra_honk
# The mock circuits share this script and must land on the same flavors as the circuits they mock.
check mock_hiding hiding
check mock_private_kernel_init kernel
check mock_rollup_tx_merge rollup_honk
check mock_rollup_root rollup_root

exit $failed
