#!/usr/bin/env bash
set -eu

REF_TAG=$1
COMPARE_TAG=$2

function compile_project() {
    local nargo_bin=$1
    local target_dir=$2

    rm -rf $target_dir
    $nargo_bin compile --silence-warnings --force --target-dir $target_dir
}

rm -rf ref-nargo
rm -rf compare-nargo

if [[ $REF_TAG != "current" ]]; then
    NARGO_HOME="./ref-nargo" noirup -v $REF_TAG
else
    mkdir -p ./ref-nargo/bin
    ln -s $(which nargo) ./ref-nargo/bin/nargo
fi

compile_project ./ref-nargo/bin/nargo ./ref-target

mkdir -p compare-nargo/bin
NARGO_HOME="compare-nargo" noirup -v $COMPARE_TAG

compile_project ./compare-nargo/bin/nargo ./compare-target

mkdir -p ./diff
for filename in ./ref-target/*.json; do
    echo "diffing $(basename $filename)"

    FILTER='del(.file_map, .noir_version)'

    # Sort keys in JSON to avoid diffs between semantically identical files.
    REF_CONTENTS=$(jq -r --sort-keys "$FILTER" $filename)
    COMPARE_CONTENTS=$(jq -r --sort-keys "$FILTER" ./compare-target/$(basename $filename))

    set +e
    artifact_diff=$(diff <(echo "$REF_CONTENTS") <(echo "$COMPARE_CONTENTS"))
    set -e

    if [[ "$artifact_diff" != "" ]]; then
        echo "$artifact_diff" > ./diff/$(basename $filename)
    fi
done


