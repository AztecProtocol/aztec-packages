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
}

compile $1
