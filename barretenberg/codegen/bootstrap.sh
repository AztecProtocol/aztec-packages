#!/usr/bin/env bash
# Codegen tool: generates bindings from committed JSON schemas.
# Zero npm dependencies — runs with just Node.js (v22+).
#
# Usage:
#   ./bootstrap.sh           # Run codegen (generate all bindings)
#   ./bootstrap.sh generate  # Same
#   ./bootstrap.sh hash      # Print content hash

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Hash includes codegen source AND committed schema files.
export hash=$(cache_content_hash .rebuild_patterns)

NODE_FLAGS="--experimental-strip-types --experimental-transform-types --no-warnings"

gen() { node $NODE_FLAGS src/generate.ts "$@"; }

function generate {
  echo_header "codegen generate"
  local S="schemas"
  local CPP="../cpp/src/barretenberg"
  local TS="../ts/src"
  local ZIG="../zig/aztec-ipc/src"

  # --- BB ---
  gen --schema $S/bb_schema.json --lang cpp --out $CPP/bbapi/generated \
    --server --cpp-namespace bb::bbapi --prefix Bb --cpp-include-dir barretenberg/bbapi/generated
  gen --schema $S/bb_schema.json --lang ts --out $TS/cbind/generated \
    --server --client --prefix Bb --curve-constants
  gen --schema $S/bb_schema.json --lang rust --out ../rust/barretenberg-rs/src/generated \
    --client --uds --ffi --prefix Bb
  gen --schema $S/bb_schema.json --lang zig --out $ZIG/bb \
    --client --uds --ffi --prefix Bb

  # --- WSDB ---
  gen --schema $S/wsdb_schema.json --lang cpp --out $CPP/wsdb/generated \
    --server --client --cpp-namespace bb::wsdb --prefix Wsdb --cpp-include-dir barretenberg/wsdb/generated
  gen --schema $S/wsdb_schema.json --lang ts --out $TS/aztec-wsdb/generated \
    --server --client --prefix Wsdb
  gen --schema $S/wsdb_schema.json --lang zig --out $ZIG/wsdb \
    --server --client --uds --ffi --prefix Wsdb

  # --- CDB ---
  gen --schema $S/cdb_schema.json --lang cpp --out $CPP/cdb/generated \
    --client --cpp-namespace bb::cdb --prefix Cdb --cpp-include-dir barretenberg/cdb/generated
  gen --schema $S/cdb_schema.json --lang ts --out $TS/aztec-cdb/generated \
    --server --client --prefix Cdb
  gen --schema $S/cdb_schema.json --lang zig --out $ZIG/cdb \
    --client --uds --ffi --prefix Cdb

  # --- AVM ---
  gen --schema $S/avm_schema.json --lang cpp --out $CPP/avm/generated \
    --server --cpp-namespace bb::avm --prefix Avm --cpp-include-dir barretenberg/avm/generated
  gen --schema $S/avm_schema.json --lang ts --out $TS/aztec-avm/generated \
    --server --client --prefix Avm
  gen --schema $S/avm_schema.json --lang zig --out $ZIG/avm \
    --server --client --uds --ffi --prefix Avm
}

case "$cmd" in
  ""|generate)
    generate
    ;;
  hash)
    echo $hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
