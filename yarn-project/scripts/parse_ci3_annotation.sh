#!/usr/bin/env bash
# Parse a <ci3> XML annotation from the first line of a test file.
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
#   // <ci3 isolate cpus="10" mem="16g" timeout="5m" uv_threadpool_size="32" />
#
# Attributes:
#   Boolean (bare):  isolate, net, only_term_parent
#   Key=value:       cpus="N", mem="Xg", timeout="Nm", uv_threadpool_size="N",
#                    log_level="debug", bb_verbose="1", etc.
#
# Attribute names are case-insensitive in the annotation but are uppercased
# when emitted (e.g. cpus="8" → CPUS=8, uv_threadpool_size="32" → UV_THREADPOOL_SIZE=32).
#
# Known prefix fields (ci3 infrastructure — docker isolation / resource allocation):
#   ISOLATE, CPUS, MEM, TIMEOUT, NET, ONLY_TERM_PARENT
#
# Everything else becomes an environment variable for the test command:
#   UV_THREADPOOL_SIZE, LOG_LEVEL, BB_VERBOSE, HARDWARE_CONCURRENCY, etc.
#
# Examples:
#   // <ci3 isolate />
#   // <ci3 isolate cpus="10" mem="16g" timeout="5m" uv_threadpool_size="32" />
#   // <ci3 cpus="16" mem="16g" log_level="debug" bb_verbose="1" />
#   // <ci3 isolate net cpus="8" />
# ──────────────────────────────────────────────────────────────────────────────

# Fields that ci3 infrastructure uses for docker isolation / resource allocation.
KNOWN_PREFIX_FIELDS=" ISOLATE CPUS MEM TIMEOUT NET ONLY_TERM_PARENT "

file="$1"
CI3_PREFIX=""
CI3_ENV=""

first_line=$(head -1 "$file")

# Match: // <ci3 ... />
# Use a variable to avoid bash parsing issues with special regex characters.
re='^// <ci3 (.+) />$'
if [[ "$first_line" =~ $re ]]; then
  attrs="${BASH_REMATCH[1]}"

  # Parse attributes: bare words (boolean) and key="value" pairs.
  re_kv='^([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"(.*)'
  re_bare='^([a-zA-Z_][a-zA-Z0-9_]*)(.*)'
  while [[ -n "$attrs" ]]; do
    # Skip leading whitespace
    attrs="${attrs#"${attrs%%[![:space:]]*}"}"
    [ -z "$attrs" ] && break

    if [[ "$attrs" =~ $re_kv ]]; then
      # key="value" attribute
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      attrs="${BASH_REMATCH[3]}"
    elif [[ "$attrs" =~ $re_bare ]]; then
      # Bare boolean attribute
      key="${BASH_REMATCH[1]}"
      val="1"
      attrs="${BASH_REMATCH[2]}"
    else
      break
    fi

    # Uppercase the key for env var convention
    key=$(echo "$key" | tr '[:lower:]' '[:upper:]')

    if [[ "$KNOWN_PREFIX_FIELDS" == *" $key "* ]]; then
      CI3_PREFIX+=":${key}=${val}"
    else
      CI3_ENV+=" ${key}=${val}"
    fi
  done
fi

echo "CI3_PREFIX='$CI3_PREFIX' CI3_ENV='$CI3_ENV'"
