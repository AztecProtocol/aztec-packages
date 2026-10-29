#!/usr/bin/env bash
set -euo pipefail

# check_cli_defaults - Fail when a tracked docs/ file carries a key-shaped option default
#
# The rule is in lib/key_defaults.sh. Prints <path>:<line> and the first 4 hex characters of each
# value, never more.
#
# Usage: check_cli_defaults.sh [--cached | <rev>]
#   (none)    the working tree copies of tracked files
#   --cached  the index
#   <rev>     that commit's tree

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib/key_defaults.sh
source "$SCRIPT_DIR/lib/key_defaults.sh"
cd "$SCRIPT_DIR/.."

# git grep takes --cached before the pattern and a revision after it.
opts=()
revs=()
case "${1:-}" in
  "") ;;
  --cached) opts=(--cached) ;;
  -*)
    echo "usage: $0 [--cached | <rev>]" >&2
    exit 2
    ;;
  *)
    if ! commit=$(git rev-parse --verify --quiet --end-of-options "$1^{commit}"); then
      echo "error: $1 is not a commit" >&2
      exit 2
    fi
    revs=("$commit")
    ;;
esac

matches=$(git grep -nIE --full-name ${opts[@]+"${opts[@]}"} -e "$KEY_DEFAULT_ERE" ${revs[@]+"${revs[@]}"} -- .) ||
  [ $? -eq 1 ] || exit 2
found=$(key_defaults_report <<<"$matches")
if [ -n "$found" ]; then
  echo "error: option defaults that look like private keys (regenerate with the CLI's environment unset):" >&2
  echo "$found" >&2
  exit 1
fi
