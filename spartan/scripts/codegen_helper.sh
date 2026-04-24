#!/usr/bin/env bash
# Helper for generating TypeScript/JSON from .env files.
# Sourced by per-package generate.sh scripts.

# Format KEY=VALUE lines from stdin as TypeScript object properties.
format_ts_properties() {
  node -e "
    const lines = require('fs').readFileSync(0, 'utf8').trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      const idx = line.indexOf('=');
      if (idx < 0) continue;
      const key = line.substring(0, idx);
      const val = line.substring(idx + 1);
      let tsVal;
      if (val === 'true' || val === 'false') tsVal = val;
      else if (val !== '' && !isNaN(Number(val)) && !/^0x/i.test(val)) tsVal = String(Number(val));
      else tsVal = \"'\" + val + \"'\";
      console.log('  ' + key + ': ' + tsVal + ',');
    }
  "
}

# Format KEY=VALUE lines from stdin as a JSON object.
format_json_object() {
  node -e "
    const lines = require('fs').readFileSync(0, 'utf8').trim().split('\n');
    const obj = {};
    for (const line of lines) {
      if (!line) continue;
      const idx = line.indexOf('=');
      if (idx < 0) continue;
      const key = line.substring(0, idx);
      const val = line.substring(idx + 1);
      if (val === 'true') obj[key] = true;
      else if (val === 'false') obj[key] = false;
      else if (val !== '' && !isNaN(Number(val)) && !/^0x/i.test(val)) obj[key] = Number(val);
      else obj[key] = val;
    }
    console.log(JSON.stringify(obj, null, 2));
  "
}

# Extract keys defined within named codegen sections across one or more env files,
# with values resolved by sourcing all files in order.
#
# Section markers in env files:
#   # === [codegen:section-name] ===
#     KEY=value
#     ...
#   # === [codegen:other-section] ===  # ends previous section
#     KEY=value
#   # === [codegen:none] ===           # explicitly excluded from codegen
#
# Usage: extract_codegen_keys "section1 section2 ..." env_file1 [env_file2 ...]
# Output: KEY=VALUE lines (deduped, last source wins for value)
extract_codegen_keys() {
  local sections_str="$1"
  shift
  local files=("$@")

  # Collect all keys defined within the named sections across all files
  local keys
  keys=$(for f in "${files[@]}"; do
    awk -v sections="$sections_str" '
      BEGIN {
        n = split(sections, want, " ")
        for (i = 1; i <= n; i++) wanted[want[i]] = 1
        in_section = 0
      }
      /^[[:space:]]*#[[:space:]]*===[[:space:]]*\[codegen:[a-z0-9-]+\][[:space:]]*===/ {
        match($0, /\[codegen:[a-z0-9-]+\]/)
        section = substr($0, RSTART + 9, RLENGTH - 10)
        in_section = (section in wanted) ? 1 : 0
        next
      }
      in_section && /^[A-Z_][A-Z0-9_]*=/ {
        sub(/=.*/, "")
        print
      }
    ' "$f"
  done | awk '!seen[$0]++')

  # Source all files and emit KEY=VALUE for each collected key (skip empty values)
  (
    set +u 2>/dev/null || true
    set +e 2>/dev/null || true
    for f in "${files[@]}"; do source "$f" 2>/dev/null; done
    for key in $keys; do
      if [[ -n "${!key+x}" ]] && [[ -n "${!key}" ]]; then
        echo "$key=${!key}"
      fi
    done
  )
}
