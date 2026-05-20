#!/usr/bin/env bash
if [ "${1:-}" = "hash" ] && [ "${NO_CACHE:-0}" -eq 1 ] && [ "${NO_CACHE_UPLOAD:-0}" -eq 1 ]; then
  echo disabled-cache
  exit 0
fi

script_dir=${BASH_SOURCE[0]%/*}
[ "$script_dir" = "${BASH_SOURCE[0]}" ] && script_dir=.
case "$script_dir" in
  /*) root=${root:-$script_dir/../..} ;;
  *) root=${root:-$PWD/$script_dir/../..} ;;
esac
source "$root/ci3/source"

NOIR_PROTOCOL_CIRCUITS_WORKING_DIR="$(pwd)" ../noir-protocol-circuits/bootstrap.sh "${1:-}"
NOIR_PROTOCOL_CIRCUITS_SKIP_CHECK_WARNINGS=true
