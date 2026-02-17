#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

test_name=$1
cd ../acir_tests/$test_name

bb=$(../../../cpp/scripts/find-bb)

$bb acir_roundtrip -b target/program.json
