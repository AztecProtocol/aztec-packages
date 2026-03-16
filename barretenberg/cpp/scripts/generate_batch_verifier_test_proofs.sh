#!/usr/bin/env bash
# Generate real Chonk proofs from pinned IVC inputs for batch verifier stress testing.
# Proofs are saved to $output_dir (default: /tmp/chonk-proofs/).
# Each flow gets a subdirectory with proof and vk files.
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
root="$(git -C "$script_dir" rev-parse --show-toplevel)"
bb="${bb:-$root/barretenberg/cpp/build/bin/bb}"
output_dir="${1:-/tmp/chonk-proofs}"

pinned_short_hash="189f0026"
pinned_url="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-chonk-inputs-${pinned_short_hash}.tar.gz"

inputs_dir=$(mktemp -d)
trap 'rm -rf "$inputs_dir"' EXIT

echo "Downloading pinned IVC inputs (hash: $pinned_short_hash)..."
curl -s -f "$pinned_url" -o "$inputs_dir/archive.tar.gz"
tar -xzf "$inputs_dir/archive.tar.gz" -C "$inputs_dir"
rm "$inputs_dir/archive.tar.gz"

mkdir -p "$output_dir"

for flow_dir in "$inputs_dir"/*/; do
    name=$(basename "$flow_dir")
    out="$output_dir/$name"
    if [[ -f "$out/proof" && -f "$out/vk" ]]; then
        echo "SKIP $name (already exists)"
        continue
    fi
    mkdir -p "$out"
    echo "Proving $name..."
    $bb prove --scheme chonk --ivc_inputs_path "$flow_dir/ivc-inputs.msgpack" --write_vk -o "$out"
    echo "  -> $(stat -c%s "$out/proof") bytes"
done

echo ""
echo "All proofs in: $output_dir"
ls -1 "$output_dir"
