#!/usr/bin/env bash
# Parse a ci3 YAML annotation from the first line of a test file.
#
# Usage:
#   eval $(./parse_ci3_annotation.sh <test_file>)
#
# Sets:
#   CI3_PREFIX  — colon-separated fields for ci3 infrastructure (resource allocation, isolation)
#   CI3_ENV     — space-separated env vars passed to the test process
#
# ──────────────────────────────────────────────────────────────────────────────
# Annotation format (must be the FIRST LINE of the .test.ts file):
#
#   // ci3: { isolate: true, cpus: 10, mem: "16g", timeout: "15m", uv_threadpool_size: 32 }
#
# Keys are lowercase YAML. They are uppercased when emitted
# (e.g. cpus: 8 → CPUS=8, uv_threadpool_size: 32 → UV_THREADPOOL_SIZE=32).
#
# Known prefix fields (ci3 infrastructure — docker isolation / resource allocation):
#   isolate, cpus, mem, timeout, net, only_term_parent
#
# Everything else becomes an environment variable for the test command:
#   uv_threadpool_size, log_level, bb_verbose, hardware_concurrency, etc.
#
# Examples:
#   // ci3: { isolate: true }
#   // ci3: { isolate: true, cpus: 10, mem: "16g", uv_threadpool_size: 32 }
#   // ci3: { cpus: 16, mem: "16g", log_level: debug, bb_verbose: 1 }
#   // ci3: { isolate: true, net: true, cpus: 8 }
#   // ci3: { timeout: "15m" }
# ──────────────────────────────────────────────────────────────────────────────

# Fields that ci3 infrastructure uses for docker isolation / resource allocation.
KNOWN_PREFIX_FIELDS=" ISOLATE CPUS MEM TIMEOUT NET ONLY_TERM_PARENT "

file="$1"
CI3_PREFIX=""
CI3_ENV=""

first_line=$(head -1 "$file")

# Match: // ci3: { ... }
if [[ "$first_line" =~ ^//\ ci3:\ (.+) ]]; then
  yaml="${BASH_REMATCH[1]}"

  # Parse with yq: emit KEY=VALUE lines, uppercased keys, stringified values.
  while IFS='=' read -r key val; do
    [ -z "$key" ] && continue
    key=$(echo "$key" | tr '[:lower:]' '[:upper:]')

    # Skip boolean false values (only true matters).
    [ "$val" = "false" ] && continue
    # Convert boolean true to 1 for ci3 prefix compatibility.
    [ "$val" = "true" ] && val="1"

    if [[ "$KNOWN_PREFIX_FIELDS" == *" $key "* ]]; then
      CI3_PREFIX+=":${key}=${val}"
    else
      CI3_ENV+=" ${key}=${val}"
    fi
  done < <(echo "$yaml" | yq 'to_entries[] | .key + "=" + (.value | . tag = "!!str")')
fi

echo "CI3_PREFIX='$CI3_PREFIX' CI3_ENV='$CI3_ENV'"
