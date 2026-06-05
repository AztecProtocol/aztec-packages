#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

repo_root=$(git rev-parse --show-toplevel)
export BB=${BB:-$repo_root/barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-$repo_root/noir/noir-repo/target/release/nargo}
export BB_HASH=${BB_HASH:-$($repo_root/barretenberg/cpp/bootstrap.sh hash)}

# We search the docs/*.md files to find included code, and use those as our rebuild dependencies.
# We prefix the results with ^ to make them "not a file", otherwise they'd be interpreted as pattern files.
hash=$(
  cache_content_hash \
    .rebuild_patterns \
    $(find docs docs-developers docs-operate docs-participate developer_versioned_docs network_versioned_docs -type f -name "*.md*" -exec grep '^#include_code' {} \; | \
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

  # Delegate to examples for their test commands
  (cd examples && ./bootstrap.sh test_cmds)
}

function test {
  echo_header "docs test"
  test_cmds | parallelize
}

function check_orphaned_urls {
  echo_header "Check orphaned URLs"
  # Source the baseline from the base branch, not the working tree, so a PR
  # cannot weaken its own gate by deleting URLs from the snapshot in the same
  # diff. The committed snapshot only grows the protected set for future PRs;
  # the check a PR must satisfy is the base-branch version it cannot edit.
  local snapshot=snapshots/published-urls.txt
  local base_ref="${GITHUB_BASE_REF:-next}"
  local tmp
  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN

  # Resolve the base branch first, distinguishing "base unreachable" from "base
  # reachable but snapshot absent". Only the latter is a legitimate fallback (it
  # happens for the PR that first introduces the snapshot). Treating an
  # unreachable base as a fallback would silently reopen the bypass.
  local base_obj=""
  if git rev-parse --verify -q "origin/${base_ref}" >/dev/null; then
    base_obj="origin/${base_ref}"
  elif git fetch -q origin "$base_ref" 2>/dev/null; then
    base_obj="FETCH_HEAD"
  fi

  local baseline
  if [[ -n "$base_obj" ]]; then
    if git show "${base_obj}:docs/${snapshot}" >"$tmp" 2>/dev/null; then
      echo "Using base-branch baseline (${base_obj})."
      baseline="$tmp"
    else
      echo "Base branch ${base_ref} has no snapshot yet; using working-tree snapshot (introducing PR)."
      baseline="$snapshot"
    fi
  elif [[ "${CI:-0}" -eq 1 ]]; then
    # In CI the base must be reachable; downgrading to the PR's own editable
    # snapshot would reopen the bypass this gate exists to close.
    echo "ERROR: cannot resolve base branch origin/${base_ref} to source the orphan-check baseline." >&2
    return 1
  else
    echo "Base branch origin/${base_ref} unavailable; using working-tree snapshot (local run)."
    baseline="$snapshot"
  fi

  local rc=0
  FAIL_ON_ORPHAN=1 ./scripts/check_orphaned_urls.sh "$baseline" || rc=$?
  return $rc
}

function check_references {
  if [[ "${GITHUB_EVENT_NAME:-}" != "merge_group" ]]; then
    echo "Skipping doc reference check (only runs in merge queue)."
    return
  fi
  echo_header "Check doc references"
  if ! ./scripts/check_doc_references.sh docs; then
    echo "⚠ Doc reference check failed (non-blocking)."
    if [[ -n "${AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN:-}" ]]; then
      curl -s -X POST https://slack.com/api/chat.postMessage \
        -H "Authorization: Bearer $AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN" \
        -H "Content-type: application/json" \
        -d "{\"channel\": \"#docs-alerts\", \"text\": \"⚠️ Doc reference check script failed for ref \`${GITHUB_REF_NAME:-unknown}\`. Check CI logs.\"}" \
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
    check_orphaned_urls
    check_references
    ;;
  "")
    build_examples
    build_docs
    check_orphaned_urls
    check_references
    ;;
  "hash")
    echo "$hash"
    ;;
  "compile")
    build_examples compile "$@"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
