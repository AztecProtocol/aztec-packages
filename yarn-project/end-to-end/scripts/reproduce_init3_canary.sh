#!/usr/bin/env bash
# Reproduce the PXE_USE_INIT_3 canary: capture a real client_flow with init_3,
# prove it with bb (Chonk), and verify the proof.
#
# Usage:
#   yarn-project/end-to-end/scripts/reproduce_init3_canary.sh
#
# Prerequisites:
#   - The repo has been bootstrapped (run `./bootstrap.sh` from the repo root).
set -eu

repo_root=$(git rev-parse --show-toplevel)
bb=$repo_root/barretenberg/cpp/build/bin/bb-avm
out_dir=${OUT_DIR:-/tmp/init3-canary}
flow=deploy_ecdsar1+sponsored_fpc
ivc_inputs=$out_dir/captures/$flow/ivc-inputs.msgpack
logs=$out_dir/captures/$flow/logs.json

if [[ ! -x "$bb" ]]; then
  echo "ERROR: $bb not found. Run ./bootstrap.sh from the repo root first." >&2
  exit 1
fi

rm -rf "$out_dir"
mkdir -p "$out_dir/captures" "$out_dir/proof"

echo "==> [1/3] Capturing init_3 IVC inputs (real client_flow test, ~30-60s)..."
cd "$repo_root/yarn-project/end-to-end"
PXE_USE_INIT_3=1 \
CAPTURE_IVC_FOLDER="$out_dir/captures" \
SKIP_STEP_COUNT_CHECK=1 \
BENCHMARK_CONFIG=key_flows \
LOG_LEVEL=warn \
node --experimental-vm-modules ../node_modules/.bin/jest \
  --testTimeout=300000 \
  --no-cache \
  --runInBand \
  --testNamePattern "ecdsar1.*sponsored_fpc" \
  client_flows/account_deployments

if [[ ! -f "$ivc_inputs" ]]; then
  echo "ERROR: capture failed; $ivc_inputs not found" >&2
  exit 1
fi

# Sanity: the captured logs must show init_3 was actually exercised.
if ! grep -q "PrivateKernelInit3Artifact" "$logs"; then
  echo "ERROR: capture does not reference PrivateKernelInit3Artifact." >&2
  echo "       Check that PXE_USE_INIT_3 is plumbed through to the orchestrator." >&2
  exit 1
fi

cd "$repo_root"
echo "==> [2/3] bb prove --scheme chonk (real Chonk prover, ~1-2 min)..."
"$bb" prove --scheme chonk \
  --ivc_inputs_path "$ivc_inputs" \
  -o "$out_dir/proof" \
  --write_vk

echo "==> [3/3] bb verify --scheme chonk..."
"$bb" verify --scheme chonk \
  --vk_path "$out_dir/proof/vk" \
  -p "$out_dir/proof/proof"

echo
echo "init_3 canary verified end-to-end."
echo "  Captured inputs: $ivc_inputs"
echo "  Proof artifacts: $out_dir/proof/"
