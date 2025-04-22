#!/bin/bash

# --- Setup Paths --------------------------------------------------------------

get_script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

init_paths() {
  script_dir="$(get_script_dir)"
  root_dir="$(realpath "$script_dir/../../src/barretenberg")"
  trim_root="$root_dir"
  echo "Root directory: $root_dir"
}

# --- File Discovery -----------------------------------------------------------

find_auditable_files() {
  local dir="$1"
  find "$dir" -type f \( -name '*.cpp' -o -name '*.hpp' -o -name '*.h' \) \
    -not -name '*.test.cpp' \
    -not -path "*/build/*" \
    -exec realpath {} \;
}

# --- Header Injection ---------------------------------------------------------

add_audit_header_if_missing() {
  local file="$1"
  local header_file="$script_dir/header_template.txt"

  if [[ ! -f "$header_file" ]]; then
    echo "❌ Missing audit header template at $header_file"
    return
  fi

  # Use the first line of the template as the marker
  local marker
  marker="$(grep -m 1 -v '^[[:space:]]*$' "$header_file")"

  if grep -Fq "$marker" "$file"; then
    echo "Already has audit header: ${file#$trim_root/}"
    return
  fi

  local tmp_file
  tmp_file=$(mktemp)

  cat "$header_file" > "$tmp_file"
  echo "" >> "$tmp_file"
  cat "$file" >> "$tmp_file"
  mv "$tmp_file" "$file"

  echo "Added audit header: ${file#$trim_root/}"
}

process_dir() {
  local dir="$1"
  files=$(find_auditable_files "$dir")

  while read -r file; do
    add_audit_header_if_missing "$file"
  done <<< "$files"
}

# --- Main Execution -----------------------------------------------------------

EXCLUDED_SUBDIRS=(
  "acir_formal_proofs"
  "api"
  "build"
  "bb"
  "benchmark"
  "boomerang_value_detection"
  "circuit_checker"
  "commitment_schemes_recursion"
  "common"
  "env"
  "examples"
  "grumpkin_srs_gen"
  "lmdblib"
  "messaging"
  "nodejs_module"
  "serialize"
  "smt_verification"
  "solidity_helpers"
  "srs"
  "ultra_vanilla_client_ivc"
  "vm2"
  "wasi"
  "world_state"
)

main() {
  init_paths

  if [ -d "$root_dir" ] && compgen -G "$root_dir"/*/ > /dev/null; then
    # It's a directory with subdirectories (like full barretenberg/)
    for dir in "$root_dir"/*/; do
      subdir=$(basename "$dir")

      if [[ " ${EXCLUDED_SUBDIRS[*]} " == *" ${subdir} "* ]]; then
        echo "Skipping excluded subdir: $subdir"
        continue
      fi

      process_dir "$dir"
    done
  else
    # It's just a single directory of source files (e.g. sumcheck/)
    process_dir "$root_dir"
  fi
}

main
