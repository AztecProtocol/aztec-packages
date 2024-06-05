#!/usr/bin/env bash
set -eu

BB_BIN=${BB_BIN:-../../barretenberg/cpp/build/bin/bb}

mkdir -p ./target/keys

for pathname in ./target/*.json; do    
    ARTIFACT_NAME=$(basename -s .json "$pathname")
    (($BB_BIN write_vk -b "./target/$ARTIFACT_NAME.json" -o "./target/keys/$ARTIFACT_NAME.vk" )
    && ($BB_BIN vk_as_fields -k "./target/keys/$ARTIFACT_NAME.vk" -o "./target/keys/$ARTIFACT_NAME.vk.json")) &
done


for job in $(jobs -p); do
    wait $job || exit 1
done