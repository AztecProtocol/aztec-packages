#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

repo_root=$(git rev-parse --show-toplevel)
export BB=${BB:-$repo_root/barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-$repo_root/noir/noir-repo/target/release/nargo}

# We search the docs/*.md files to find included code, and use those as our rebuild dependencies.
# We prefix the results with ^ to make them "not a file", otherwise they'd be interpreted as pattern files.
# Snippets under labs/ live in the submodule, which this repo's tree records only as a gitlink, so they
# enter the hash through the gitlink and the patch series (.rebuild_patterns) instead.
hash=$(
  cache_content_hash \
    .rebuild_patterns \
    $(find docs docs-developers docs-operate docs-participate developer_versioned_docs network_versioned_docs -type f -name "*.md*" -exec grep '^#include_code' {} \; | \
      awk '{ gsub("^/", "", $3); if ($3 !~ /^labs\//) print "^" $3 }' | sort -u)
)
[ -z "$(git -C "$repo_root/labs" status --porcelain)" ] || hash=disabled-cache
# Released docs link snippets at their tag, so a release build never shares a cache entry with a dev build.
# A tag of this repo is not a Labs version: releases set COMMIT_TAG (and LABS_REF) explicitly.
# cache_content_hash hashes blob ids without their names, so the docs tree id keys renamed pages.
hash=$(hash_str "$hash" "$(git -C "$repo_root" rev-parse HEAD:docs)" "$(git -C "$repo_root" rev-parse HEAD:labs)" \
  "${COMMIT_TAG:-}" "${LABS_REF:-}")

# Every function that reads aztec-node code fetches and checks the pinned checkout first, on a cache
# hit too, since later steps read it (scripts/aztec_node.mts; a no-op without network when current).
function fetch_aztec_node {
  node scripts/aztec_node.mts fetch
}

function build_docs {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not building docs for arm64 in CI."
    return
  fi
  echo_header "build docs"
  fetch_aztec_node
  npm_install_deps
  if cache_download docs-$hash.tar.gz; then
    return
  fi
  source "$repo_root/docs/scripts/node_options.sh"
  denoise "yarn build"
  cache_upload docs-$hash.tar.gz build
}

function check_generated_refs {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not checking generated docs for arm64 in CI."
    return
  fi
  echo_header "check generated aztec.js reference"
  fetch_aztec_node
  ./scripts/aztecjs_reference_generation/update_docs.sh --check
}

function test_cmds {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    # Not running docs tests for arm64 in CI.
    return
  fi

  local test_hash=$hash
  echo "$test_hash cd docs && yarn spellcheck"
  echo "$test_hash cd docs && yarn test"

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
  local base_ref="${GITHUB_BASE_REF:-${MERGE_GROUP_BASE_REF:-next}}"
  base_ref="${base_ref#refs/heads/}"
  local tmp
  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN

  # Resolve the base branch first, distinguishing "base unreachable" from "base
  # reachable but snapshot absent". Only the latter is a legitimate fallback (it
  # happens for the PR that first introduces the snapshot). Treating an
  # unreachable base as a fallback would silently reopen the bypass.
  local base_obj=""
  if git rev-parse --verify -q "refs/remotes/origin/${base_ref}" >/dev/null; then
    base_obj="refs/remotes/origin/${base_ref}"
  elif git fetch -q --depth=1 origin "refs/heads/${base_ref}:refs/remotes/origin/${base_ref}" 2>/dev/null &&
    git rev-parse --verify -q "refs/remotes/origin/${base_ref}" >/dev/null; then
    base_obj="refs/remotes/origin/${base_ref}"
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
  echo_header "Check doc references"
  fetch_aztec_node
  ./scripts/check_doc_references.sh docs
}

function build_examples {
  echo_header "Building examples"
  (cd examples && ./bootstrap.sh "$@")
}

case "$cmd" in
  "ci")
    build_examples
    build_docs
    check_generated_refs
    test
    check_orphaned_urls
    check_references
    ;;
  "")
    build_examples
    build_docs
    check_generated_refs
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
