#!/usr/bin/env bash
# Parse a // ci3: annotation from the first line of a test file.
# Usage: eval $(./parse_ci3_annotation.sh <test_file>)
# Sets: CI3_PREFIX (colon-separated fields for ci3 infrastructure)
#       CI3_ENV (space-separated env vars for the test command)
#
# Annotation format: // ci3: KEY1 KEY2=value KEY3=value
# - Bare keys (e.g. ISOLATE) are treated as KEY=1
# - Known prefix fields go into CI3_PREFIX (used by ci3 for resource allocation)
# - Everything else goes into CI3_ENV (passed as env vars to the test)

# Fields that ci3 infrastructure uses for docker isolation / resource allocation.
KNOWN_PREFIX_FIELDS=" ISOLATE CPUS MEM TIMEOUT NET ONLY_TERM_PARENT "

file="$1"
CI3_PREFIX=""
CI3_ENV=""

first_line=$(head -1 "$file")

if [[ "$first_line" =~ ^//\ ci3:\ (.*) ]]; then
  tokens="${BASH_REMATCH[1]}"
  for token in $tokens; do
    key="${token%%=*}"
    val="${token#*=}"
    # Bare key (no =) means value is 1
    [[ "$token" != *=* ]] && val="1"

    if [[ "$KNOWN_PREFIX_FIELDS" == *" $key "* ]]; then
      CI3_PREFIX+=":${key}=${val}"
    else
      CI3_ENV+=" ${key}=${val}"
    fi
  done
fi

echo "CI3_PREFIX='$CI3_PREFIX' CI3_ENV='$CI3_ENV'"
