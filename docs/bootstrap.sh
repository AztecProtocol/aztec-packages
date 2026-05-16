#!/usr/bin/env bash
root=${root:-$(git rev-parse --show-toplevel)}
source "$root/ci3/source_bootstrap"

repo_root=$root
export BB=${BB:-$repo_root/barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-$repo_root/noir/noir-repo/target/release/nargo}

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
      $(find docs docs-developers docs-operate docs-participate developer_versioned_docs network_versioned_docs -type f -name "*.md*" -exec grep '^#include_code' {} \; | \
        awk '{ gsub("^/", "", $3); print "^" $3 }' | sort -u)
  )

  if [[ "$REF_NAME" =~ ^v?[0-9]+\. ]] && semver check "$REF_NAME"; then
    # Ensure that released versions don't use cache from non-released versions (they will have incorrect links to master)
    hash+=$REF_NAME
  fi
  echo "$hash"
}

function build_docs {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not building docs for arm64 in CI."
    return
  fi
  echo_header "build docs"
  npm_install_deps
  local hash=$(get_hash)
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

  local test_hash
  if [ "${NO_CACHE:-0}" -eq 1 ]; then
    test_hash=disabled-cache
  else
    test_hash=$(get_hash)
  fi
  echo "$test_hash cd docs && yarn spellcheck"

  # Delegate to examples for their test commands
  (cd examples && ./bootstrap.sh test_cmds)
}

function test {
  echo_header "docs test"
  test_cmds | parallelize
}

function check_references {
  if [[ "${GITHUB_EVENT_NAME:-}" != "merge_group" ]]; then
    echo "Skipping doc reference check (only runs in merge queue)."
    return
  fi
  echo_header "Check doc references"
  if ! ./scripts/check_doc_references.sh docs; then
    echo "⚠ Doc reference check failed (non-blocking)."
    if [[ -n "${SLACK_BOT_TOKEN:-}" ]]; then
      curl -s -X POST https://slack.com/api/chat.postMessage \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-type: application/json" \
        -d "{\"channel\": \"#devrel-docs-updates\", \"text\": \"⚠️ Doc reference check script failed for ref \`${GITHUB_REF_NAME:-unknown}\`. Check CI logs.\"}" \
        > /dev/null 2>&1 || true
    fi
  fi
}

function build_examples {
  echo_header "Building examples"
  (cd examples && ./bootstrap.sh "$@")
}

case "$cmd" in
  "ci")
    build_examples
    build_docs
    test
    check_references
    ;;
  "")
    build_examples
    build_docs
    check_references
    ;;
  "hash")
    get_hash
    ;;
  "compile")
    build_examples compile "$@"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
