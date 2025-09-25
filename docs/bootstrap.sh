#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

# We search the docs/*.md files to find included code, and use those as our rebuild dependencies.
# We prefix the results with ^ to make them "not a file", otherwise they'd be interpreted as pattern files.
hash=$(
  cache_content_hash \
    .rebuild_patterns \
    $(find docs versioned_docs -type f -name "*.md*" -exec grep '^#include_code' {} \; | \
      awk '{ gsub("^/", "", $3); print "^" $3 }' | sort -u)
)

if semver check $REF_NAME; then
  # Ensure that released versions don't use cache from non-released versions (they will have incorrect links to master)
  hash+=$REF_NAME
  export COMMIT_TAG=$REF_NAME
fi

function build_docs {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not building docs for arm64 in CI."
    return
  fi
  echo_header "build docs"
  npm_install_deps
  if cache_download docs-$hash.tar.gz; then
    return
  fi
  denoise "yarn build"
  cache_upload docs-$hash.tar.gz build
}

function test_cmds {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    # Not running docs tests for arm64 in CI.
    return
  fi

  local test_hash=$hash
  echo "$test_hash cd docs && yarn spellcheck"
}

function test {
  echo_header "docs test"
  test_cmds | parallelize
}

# This compiles a noir contract, transpile's public functions, and generates vk's for private functions.
# $1 is the input package name, and on exit it's fully processed json artifact is in the target dir.
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
function compile {
  set -euo pipefail
  local contract_name contract_hash

  local contract_path=$(get_contract_path "$1")
  local contract=${contract_path#*/}
  # Calculate filename because nargo...
  contract_name=$(cat contracts/$contract_path/src/main.nr | awk '/^contract / { print $2 } /^pub contract / { print $3 }')
  local filename="$contract-$contract_name.json"
  local json_path="./target/$filename"
  contract_hash=$(get_contract_hash $1)
  if ! cache_download contract-$contract_hash.tar.gz; then
    $NARGO compile --package $contract --inliner-aggressiveness 0 --pedantic-solving --deny-warnings
    $TRANSPILER $json_path $json_path
    cache_upload contract-$contract_hash.tar.gz $json_path
  fi

  # We segregate equivalent vk's created by process_function. This was done to narrow down potential edge cases with identical VKs
  # reading from cache at the same time. Create this folder up-front.
  mkdir -p $tmp_dir/$contract_hash

  # Pipe each contract function, one per line (jq -c), into parallel calls of process_function.
  # The returned jsons from process_function are converted back to a json array in the second jq -s call.
  # When slurping (-s) in the last jq, we get an array of two elements:
  # .[0] is the original json (at $json_path)
  # .[1] is the updated functions on stdin (-)
  # * merges their fields.
  jq -c '.functions[]' $json_path | \
    parallel $PARALLEL_FLAGS --keep-order -N1 --block 8M --pipe process_function $contract_hash | \
    jq -s '{functions: .}' | jq -s '.[0] * {functions: .[1].functions}' $json_path - > $tmp_dir/$filename
  mv $tmp_dir/$filename $json_path
}
export -f compile

# If given an argument, it's the contract to compile.
# Otherwise parse out all relevant contracts from the root Nargo.toml and process them in parallel.
function build {
  echo_stderr "Compiling contracts (bb-hash: $BB_HASH)..."
  if [ "$#" -eq 0 ]; then
    rm -rf target
    mkdir -p $tmp_dir
    local contracts=$(grep -oP '(?<=contracts/)[^"]+' Nargo.toml)
  else
    local contracts="$@"
  fi
  set +e
  parallel $PARALLEL_FLAGS --joblog joblog.txt -v --line-buffer --tag compile {} ::: ${contracts[@]}
  code=$?
  cat joblog.txt
  return $code
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    build_docs
    test
    ;;
  ""|"full"|"fast")
    build_docs
    ;;
  "hash")
    echo "$hash"
    ;;
  "compile")
    shift
    VERBOSE=${VERBOSE:-1} build "$@"
    ;;
  test|test_cmds)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
