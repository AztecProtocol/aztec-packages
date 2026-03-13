#!/usr/bin/env bash

set -euo pipefail

coverage_dir="${BB_COVERAGE_DIR:-/home/sarkoxed/.secret/aztec-packages/barretenberg/cpp/build-coverage/profiles}"
merged_profile="${MERGED_PROFDATA_PATH:-${coverage_dir}/barretenberg_coverage.profdata}"
llvm_profdata="${LLVM_PROFDATA:-llvm-profdata}"
merge_interval_seconds="${MERGE_INTERVAL_SECONDS:-300}"

mkdir -p "$coverage_dir"

merge_profiles() {
    shopt -s nullglob
    local profraw_files=("$coverage_dir"/*.profraw)
    shopt -u nullglob

    if ((${#profraw_files[@]} == 0)); then
        return 0
    fi

    local merge_inputs=("${profraw_files[@]}")
    if [[ -f "$merged_profile" ]]; then
        # Keep accumulating coverage by merging the existing profdata with new raw profiles.
        merge_inputs=("$merged_profile" "${merge_inputs[@]}")
    fi

    local merged_profile_dir
    merged_profile_dir="$(dirname "$merged_profile")"
    mkdir -p "$merged_profile_dir"

    local temp_merged_profile
    temp_merged_profile="$(mktemp "${merged_profile}.tmp.XXXXXX")"

    if "$llvm_profdata" merge -sparse "${merge_inputs[@]}" -o "$temp_merged_profile"; then
        mv "$temp_merged_profile" "$merged_profile"
        rm -f "${profraw_files[@]}"
    else
        rm -f "$temp_merged_profile"
        return 1
    fi
}

while true; do
    if ! merge_profiles; then
        echo "coverage merge failed" >&2
    fi

    sleep "$merge_interval_seconds"
done

