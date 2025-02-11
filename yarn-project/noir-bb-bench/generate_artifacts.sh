#!/usr/bin/env bash
set -eu
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-$(realpath ../../noir/noir-repo/target/release/nargo)}

key_dir=artifacts/keys

function compile {
  set -euo pipefail
  local dir=$1
  local name=${dir//-/_}
  local circuit_path="./circuits/$name"

  echo_stderr "Generating bytecode for circuit: $name..."
  cd $circuit_path
  $NARGO compile
  cd -
  local filename="$name.json"
  mv $circuit_path/target/$filename artifacts/

  local json_path="./artifacts/$filename"
  local write_vk_cmd="write_vk --scheme ultra_honk --honk_recursion 1"
  local key_path="$key_dir/$name.vk.data.json"
  echo_stderr "Generating vk for circuit: $name..."
  SECONDS=0
  local _vk_cmd="jq -r '.bytecode' $json_path | base64 -d | gunzip | $BB $write_vk_cmd -b - -o - --recursive"
    local vk_cmd="$_vk_cmd --output_type bytes | xxd -p -c 0"
  vk=$(dump_fail "$vk_cmd")
  local vkf_cmd="$_vk_cmd --output_type fields"
  vk_fields=$(dump_fail "$vkf_cmd")
  jq -n --arg vk "$vk" --argjson vkf "$vk_fields" '{keyAsBytes: $vk, keyAsFields: $vkf}' > $key_path
  echo "Key output at: $key_path (${SECONDS}s)"
}

compile $1