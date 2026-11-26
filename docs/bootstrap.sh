#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
# shellcheck source=/dev/null # ci3 is linted by its owners, not by the docs lint
source "$(git rev-parse --show-toplevel)/ci3/source_bootstrap"

repo_root=$(git rev-parse --show-toplevel)

# The builds and tests are keyed and cached as make steps (docs, docs-examples, docs-tests and so on): the
# Makefile names their inputs, from docs/.rebuild_patterns and scripts/include_code_patterns.sh, and the
# variables that change the site.

# Every function that reads aztec-node code fetches and checks the pinned checkout first, on a cache
# hit too, since later steps read it (scripts/aztec_node.mts; a no-op without network when current).
# The fetch covers every dev line (docs/lines/<line>/), each with its own pin.
function fetch_aztec_node {
  node scripts/aztec_node.mts fetch
}

function lines {
  node scripts/aztec_node.mts lines
}

# The site, into the make step's $STEP_OUT when it runs as one.
function build_docs {
  if [ "${CI:-0}" -eq 1 ] && [ "$(arch)" == arm64 ]; then
    echo "Not building docs for arm64 in CI."
    return
  fi
  echo_header "build docs"
  prep
  # shellcheck source=scripts/node_options.sh
  source "$repo_root/docs/scripts/node_options.sh"
  denoise "yarn build"
  if [ -n "${STEP_OUT:-}" ]; then
    mv build "$STEP_OUT/build"
  fi
}

# What the build and the tests read whether or not the site comes from the cache: the pinned aztec-node
# checkout and the npm dependencies. Each is a local check when already current.
function prep {
  fetch_aztec_node
  npm_install_deps
}

# The docs target: the site, and the checks of what it publishes.
function build {
  build_docs
  check_generated_refs
  check_orphaned_urls
}

function check_generated_refs {
  if [ "${CI:-0}" -eq 1 ] && [ "$(arch)" == arm64 ]; then
    echo "Not checking generated docs for arm64 in CI."
    return
  fi
  echo_header "check generated aztec.js reference"
  fetch_aztec_node
  ./scripts/aztecjs_reference_generation/update_docs.sh --check
  for line in $(lines); do
    ./scripts/aztecjs_reference_generation/update_docs.sh --line "$line" --check
  done
}

# Keyed by the docs-tests step ($STEP_KEY). The examples' tests are docs-examples-tests'.
function test_cmds {
  if [ "${CI:-0}" -eq 1 ] && [ "$(arch)" == arm64 ]; then
    # Not running docs tests for arm64 in CI.
    return
  fi

  local key=${STEP_KEY:-disabled-cache}
  echo "$key cd docs && yarn spellcheck"
  echo "$key cd docs && yarn test"
  echo "$key cd docs && yarn lint"
}

function test {
  echo_header "docs test"
  (cd examples && ./bootstrap.sh pin_toolchains)
  { test_cmds; (cd examples && ./bootstrap.sh test_cmds); } | parallelize
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

# The lasting docs checks, cheap enough for fast CI: they need neither labs/ nor an install.
function check {
  echo_header "docs checks"
  fetch_aztec_node
  node --test scripts/__tests__/*.test.mts
  python3 -I scripts/check_netlify_toml.py --self-test
  python3 -I scripts/check_netlify_toml.py netlify.toml
  ./scripts/check_source_urls.sh --self-test
  ./scripts/check_source_urls.sh
  ./scripts/check_static_redirects.sh --self-test
  ./scripts/check_static_redirects.sh
  ./scripts/check_skills.sh --self-test
  ./scripts/check_skills.sh
  ./scripts/check_warnings.sh --self-test
  ./scripts/check_cli_defaults.sh
  ./scripts/check_doc_references.sh docs
  for line in $(lines); do
    ./scripts/check_doc_references.sh "docs/lines/$line"
  done
}

function build_examples {
  echo_header "Building examples"
  (cd examples && ./bootstrap.sh "$@")
}

# A dev line's examples compile and type-check here; they run against a network only at the line's cut.
function build_line_examples {
  for line in $(lines); do
    echo_header "Building $line examples"
    (cd examples && ./bootstrap.sh --line "$line")
  done
}

# The docs-examples target: main's examples and each dev line's.
function examples {
  build_examples
  build_line_examples
}

# shellcheck disable=SC2154 # set by ci3/source_bootstrap
case "$cmd" in
  "ci")
    examples
    build
    test
    check
    ;;
  "")
    # Through make, so the steps are restored from the cache when they can be.
    make -C "$repo_root" docs-examples docs docs-checks
    ;;
  "compile")
    build_examples compile "$@"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
