#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

test_name=$1
cd ../acir_tests/$test_name

bb=$(../../../cpp/scripts/find-bb)

tmp=$(mktemp -d)
trap "rm -rf $tmp" EXIT

# Deserialize, re-serialize, write roundtripped raw bytecode.
$bb acir_roundtrip -b target/program.json -o $tmp/roundtripped.bin

# Extract original raw bytecode from the nargo JSON (base64-encoded gzip).
jq -r .bytecode target/program.json | base64 -d | gunzip -c > $tmp/original.bin

# The two bytecodes must be identical.
cmp $tmp/original.bin $tmp/roundtripped.bin
