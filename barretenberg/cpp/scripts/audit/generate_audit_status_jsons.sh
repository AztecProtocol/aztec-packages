#!/bin/bash

# --- Setup Paths --------------------------------------------------------------

get_script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

init_paths() {
  script_dir="$(get_script_dir)"
  root_dir="$(realpath "$script_dir/../../src/barretenberg")"
  trim_root="$root_dir"
  audit_status_root="$(realpath -m "$root_dir/../barretenberg_audit_status")"

  echo "Root directory: $root_dir"
  echo "Audit status root: $audit_status_root"
  mkdir -p "$audit_status_root"
}

# --- File Discovery -----------------------------------------------------------

find_auditable_files() {
  local dir="$1"
  find "$dir" -type f \( -name '*.cpp' -o -name '*.hpp' -o -name '*.h' \) \
    -not -name '*.test.cpp' \
    -not -path "*/build/*" \
    -exec realpath {} \;
}

# --- JSON Generation ----------------------------------------------------------

write_json_entry() {
  local relpath="$1"
  local is_last="$2"

  echo "  \"${relpath}\": {" >> "$output_file"
  echo "    \"status\": \"not started\"," >> "$output_file"
  echo "    \"auditor(s)\": \"\"" >> "$output_file"

  if [ "$is_last" -eq 1 ]; then
    echo "  }" >> "$output_file"
  else
    echo "  }," >> "$output_file"
  fi
}

generate_json_for_dir() {
  local dir="$1"
  local subdir
  subdir=$(basename "$dir")
  output_dir="$audit_status_root/$subdir"
  mkdir -p "$output_dir"
  output_file="$output_dir/audit_status.json"

  echo "{" > "$output_file"

  files=$(find_auditable_files "$dir")
  count=$(echo "$files" | wc -l)
  i=0

  if [ "$count" -eq 0 ]; then
    echo "}" >> "$output_file"
    return
  fi

  while read -r file; do
    ((i++))
    relpath="barretenberg/${file#$trim_root/}"
    write_json_entry "$relpath" $([ "$i" -eq "$count" ] && echo 1 || echo 0)
  done <<< "$files"

  echo "}" >> "$output_file"
  rel_output="${output_file#$audit_status_root/}"
  echo "Generated: $rel_output"
}

# --- Main Execution -----------------------------------------------------------

# Subdirectories (relative to root_dir) to exclude from audit
EXCLUDED_SUBDIRS=(
  "acir_formal_proofs"
  "build"
  "bb"
  "benchmark"
  "boomerang_value_detection"
  "circuit_checker"
  "commitment_schemes_recursion"
  "common"
  "env"
  "examples"
  "lmdblib"
  "messaging"
  "nodejs_module"
  "smt_verification"
  "solidity_helpers"
  "ultra_vanilla_ivc"
  "wasi"
  "world_state"
)

main() {
  init_paths

  for dir in "$root_dir"/*/; do
    subdir=$(basename "$dir")

    # Skip if subdir is in the excluded list
    if [[ " ${EXCLUDED_SUBDIRS[*]} " == *" ${subdir} "* ]]; then
      echo "Skipping excluded subdir: $subdir"
      continue
    fi

    generate_json_for_dir "$dir"
  done
}

main
