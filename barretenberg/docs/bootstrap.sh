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
source "$root/ci3/source_bootstrap"

if [[ "$REF_NAME" =~ ^v?[0-9]+\. ]] && semver check "$REF_NAME"; then
  # Ensure that released versions don't use cache from non-released versions (they will have incorrect links to master)
  export COMMIT_TAG=$REF_NAME
fi

function get_hash {
  if [ "${NO_CACHE:-0}" -eq 1 ] && [ "${NO_CACHE_UPLOAD:-0}" -eq 1 ]; then
    echo disabled-cache
    return
  fi

  local hash
  # We search the docs/*.md files to find included code, and use those as our rebuild dependencies.
  # We prefix the results with ^ to make them "not a file", otherwise they'd be interpreted as pattern files.
  hash=$(
    cache_content_hash \
      .rebuild_patterns \
      $(find docs versioned_docs -type f -name "*.md*" -exec grep '^#include_code' {} \; 2>/dev/null | \
        awk '{ gsub("^/", "", $3); print "^" $3 }' | sort -u)
  )

  if [[ "$REF_NAME" =~ ^v?[0-9]+\. ]] && semver check "$REF_NAME"; then
    # Ensure that released versions don't use cache from non-released versions (they will have incorrect links to master)
    hash+=$REF_NAME
  fi
  echo "$hash"
}

function build {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not building bb docs for arm64 in CI."
    return
  fi
  echo_header "build bb docs"
  npm_install_deps
  local hash=$(get_hash)
  if cache_download bb-docs-$hash.tar.gz; then
    echo "Skipping deployment - no bb doc changes compared to cache."
    return
  fi
  denoise "yarn build"
  cache_upload bb-docs-$hash.tar.gz build
}

function test_cmds {
  local hash
  if [ "${NO_CACHE:-0}" -eq 1 ]; then
    hash=disabled-cache
  else
    hash=$(get_hash)
  fi
  echo "$hash barretenberg/docs/bootstrap.sh test"
}

function test {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not testing bb docs for arm64 in CI."
    return
  fi
  echo_header "test docs"

  denoise "yarn test"
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    get_hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
