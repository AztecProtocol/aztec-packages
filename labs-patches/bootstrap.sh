#!/usr/bin/env bash
# The foundation's patch series on top of the labs submodule (labs/, aztec-node).
#
# labs/ is checked out at the commit recorded in this repo's index (the gitlink) and every
# labs-patches/*.patch is applied on top with git am, in name order. The applied series is a
# chain of real commits in the submodule, so labs/ HEAD normally sits ahead of the gitlink;
# the gitlink must stay an upstream commit (see check_staged and bump).
#
# The build then commits the use-local rewrite (manifests pointing at this checkout) on top
# as a marker commit, so the labs tree stays clean for ci3's cache hashing. Marker commits
# are recognised by their subject and are never exported.
#
# Usage: ./bootstrap.sh <command>
#   apply             (default) check out the gitlink and apply the series; no-op if applied
#   export            regenerate the series from the commits in labs/ on top of the gitlink
#   check             verify the series applies cleanly to the gitlink, without touching labs/
#   bump <ref>        move the gitlink to an upstream ref (branch, tag or sha) and re-apply
#   commit-use-local  commit the worktree's use-local rewrite as the marker commit
#   check_staged      fail if a patched or marker commit is staged as the gitlink (pre-commit)
#   status            show the base, the series, and what sits on top in labs/
#   test              run the sandbox lifecycle test (tests/lifecycle_test) and check
#
# Deliberately dependency-free (no ci3): it runs from git hooks and from fresh clones.
set -euo pipefail

fnd_root=$(cd "$(dirname "$0")/.." && pwd)
patch_dir=$fnd_root/labs-patches
labs=$fnd_root/labs
MARKER_SUBJECT="labs-patches: use-local rewrite (never exported)"
# Fixed committer identity and author dates keep the applied SHAs identical on every machine,
# and mark every commit this script makes so check_staged can tell them from upstream ones.
export GIT_COMMITTER_NAME=labs-patches
export GIT_COMMITTER_EMAIL=labs-patches@localhost
git_labs() { git -C "$labs" -c commit.gpgsign=false "$@"; }

function die { echo "labs-patches: $*" >&2; exit 1; }

# The commit the series applies to: the staged gitlink, which is HEAD's unless a bump is in
# progress. Falls back to HEAD's during a gitlink merge conflict, when the index has no
# stage-0 entry.
function base_sha {
  git -C "$fnd_root" rev-parse -q --verify :labs 2>/dev/null || git -C "$fnd_root" rev-parse HEAD:labs
}

# Series files, sorted; empty when there are none.
function patches {
  local f
  for f in "$patch_dir"/*.patch; do [ -e "$f" ] && echo "$f"; done
  return 0
}

# Identity of (base, series); a change in either means labs/ has to be rebuilt.
function stamp {
  { echo "base=$(base_sha)"; patches | xargs -r cat; } | git hash-object --stdin
}

function state_file { echo "$(git -C "$labs" rev-parse --absolute-git-dir)/labs-patches.state"; }
function initialized { [ -e "$labs/.git" ]; }
function recorded_head { sed -n 's/^head=//p' "$(state_file)" 2>/dev/null || true; }

# Applied when the recorded patched head for the current (base, series) is HEAD or an
# ancestor of it: commits on top (the use-local marker, work in progress) do not count.
function is_applied {
  initialized || return 1
  local f; f=$(state_file)
  [ -f "$f" ] || return 1
  [ "$(sed -n 's/^stamp=//p' "$f")" = "$(stamp)" ] || return 1
  local head; head=$(recorded_head)
  [ -n "$head" ] && git_labs merge-base --is-ancestor "$head" HEAD 2>/dev/null
}

# Besides the stamp and the patched head, the state records the commits the series produced,
# so that after the series is edited the previous versions of its commits are still known
# and not mistaken for work in progress.
# Only commits that match a series patch are recorded as applied: anything else above the
# base is work in progress and must keep being reported as such.
function write_state {
  local base ids c applied=""
  base=$(base_sha); ids=$(series_patch_ids)
  for c in $(series_commits "$base"); do
    echo "$ids" | grep -qx "$(commit_patch_id "$c")" && applied+="$c "
  done
  {
    echo "stamp=$(stamp)"
    echo "head=$(git_labs rev-parse HEAD)"
    echo "applied=$applied"
  } > "$(state_file)"
}
function recorded_applied { sed -n 's/^applied=//p' "$(state_file)" 2>/dev/null | tr ' ' '\n' || true; }

# Patch ids of the series, so applied commits can be recognised by content rather than by
# the recorded state: a cold checkout, a lost state file or a bump all still tell the series
# apart from work in progress.
function series_patch_ids {
  local p
  for p in $(patches); do
    grep -q '^diff --git' "$p" || continue
    git patch-id --stable < "$p" | cut -d' ' -f1
  done
}

function commit_patch_id {
  git_labs diff-tree -p --format= "$1" | git patch-id --stable | cut -d' ' -f1
}

# Every non-marker commit above $1, oldest first: what export turns into the series.
function series_commits {
  git_labs rev-list --reverse --invert-grep --grep="^$MARKER_SUBJECT\$" "$1..HEAD" 2>/dev/null || true
}

# Commits in labs/ above $1 that are neither part of the series nor marker commits: work
# that would be lost by a reset.
function unexported_commits {
  local ids known c id
  ids=$(series_patch_ids)
  known=$(recorded_applied)
  for c in $(series_commits "$1"); do
    echo "$known" | grep -qx "$c" && continue
    id=$(commit_patch_id "$c")
    [ -n "$id" ] && echo "$ids" | grep -qx "$id" && continue
    echo "$c"
  done
}

# True when every patch of the series is present above the base, by patch id.
function series_present {
  local base=$1 ids id
  ids=$(git_labs rev-list "$base..HEAD" 2>/dev/null | while read -r c; do commit_patch_id "$c"; done)
  for id in $(series_patch_ids); do echo "$ids" | grep -qx "$id" || return 1; done
}

function am_series {
  local dir=$1 p
  for p in $(patches); do
    # git am chokes on a patch without a diff (an empty commit); nothing to apply anyway.
    grep -q '^diff --git' "$p" || continue
    if ! git -C "$dir" -c commit.gpgsign=false am -q --3way --committer-date-is-author-date "$p"; then
      git -C "$dir" am --abort || true
      die "$(basename "$p") does not apply to $(base_sha); rebase the series (apply, fix up the commits in labs/, export)"
    fi
  done
}

# Uncommitted tracked edits in labs/ are usually the use-local rewrite (redone by the build),
# but could be someone's work in progress: park them in the submodule's stash rather than
# discarding, so `git -C labs stash pop` gets them back.
function stash_worktree {
  [ -n "$(git_labs status --porcelain --untracked-files=no)" ] || return 0
  echo "labs-patches: stashing local modifications in labs/ (git -C labs stash list; the use-local rewrite is redone by the build)." >&2
  git_labs -c user.name=labs-patches -c user.email=labs-patches@localhost stash push -q -m "labs-patches: worktree before re-apply"
}

function checkout_base {
  # Fetches the commit if this clone does not have it yet.
  git -C "$fnd_root" submodule update --init --checkout --depth 1 -- labs
  local base; base=$(base_sha)
  [ "$(git_labs rev-parse HEAD)" = "$base" ] || die "labs/ is at $(git_labs rev-parse HEAD), expected $base"
}

function apply {
  local base; base=$(base_sha)
  if ! initialized; then
    echo "Checking out labs submodule at $base..."
    checkout_base
  elif is_applied; then
    echo "labs patches already applied ($(patches | wc -l | tr -d ' ') on $base)."
    return
  elif git_labs merge-base --is-ancestor "$base" HEAD 2>/dev/null && series_present "$base"; then
    # Same base, same series by content (e.g. the state file is gone): nothing to redo.
    write_state
    echo "labs patches already applied ($(patches | wc -l | tr -d ' ') on $base)."
    return
  else
    # The series or the base changed: labs/ is rebuilt from the base. Refuse to discard commits
    # that are not part of the current series, unless told to.
    # Work in progress sits above the checkout we are leaving: the merge base with the new
    # base, or the previously committed gitlink when a shallow fetch left no common history.
    local from old
    if ! from=$(git_labs merge-base "$base" HEAD 2>/dev/null); then
      old=$(git -C "$fnd_root" rev-parse -q --verify HEAD:labs 2>/dev/null || true)
      if [ -n "$old" ] && git_labs merge-base --is-ancestor "$old" HEAD 2>/dev/null; then from=$old; else from=$base; fi
    fi
    local lost; lost=$(unexported_commits "$from")
    if [ -n "$lost" ] && [ "${LABS_PATCHES_FORCE:-0}" != 1 ]; then
      echo "labs-patches: labs/ has commits that are not in the series and would be lost:" >&2
      git_labs log --oneline --no-walk $lost >&2
      die "export them (./labs-patches/bootstrap.sh export) or drop them (git -C labs reset --hard <commit>). LABS_PATCHES_FORCE=1 discards them; last resort."
    fi
    stash_worktree
    checkout_base
  fi
  am_series "$labs"
  write_state
  echo "Applied $(patches | wc -l | tr -d ' ') labs patches on $base."
}

# Only commits are exported; marker commits are skipped. A built tree may carry the
# use-local rewrite uncommitted (before commit-use-local ran), so dirt is a note, not an error.
function export_series {
  initialized || die "labs/ is not checked out"
  local base; base=$(base_sha)
  git_labs merge-base --is-ancestor "$base" HEAD || die "labs/ HEAD does not descend from the gitlink $base; run apply first"
  if [ -n "$(git_labs status --porcelain --untracked-files=no)" ]; then
    echo "labs-patches: note: uncommitted changes in labs/ are not exported:" >&2
    git_labs status --short --untracked-files=no | sed 's/^/  /' >&2
  fi
  rm -f "$patch_dir"/*.patch
  local n=1 c
  for c in $(series_commits "$base"); do
    # --zero-commit, --no-signature, --full-index and --no-numbered keep the files free of
    # per-machine noise (git version, abbreviation length) and of series-length noise
    # ("[PATCH 1/2]"), so a re-export of an unchanged patch is a no-op in git.
    git_labs format-patch -q -1 --start-number "$n" --zero-commit --no-signature --no-stat --full-index --no-numbered \
      -o "$patch_dir" "$c"
    n=$((n + 1))
  done
  # The exported commits are the series now; record them as applied.
  write_state
  echo "Exported $(patches | wc -l | tr -d ' ') patches on $base:"
  patches | xargs -rn1 basename
}

function check {
  initialized || die "labs/ is not checked out; run apply first"
  local base; base=$(base_sha)
  git_labs worktree prune
  local tmp; tmp=$(mktemp -d)
  trap "rm -rf '$tmp'; git -C '$labs' worktree prune" EXIT
  git_labs worktree add -q --detach "$tmp" "$base"
  am_series "$tmp"
  echo "labs patches apply cleanly to $base."
}

function bump {
  local ref=${1:-}
  [ -n "$ref" ] || die "usage: bump <upstream ref>"
  initialized || checkout_base
  local lost; lost=$(unexported_commits "$(base_sha)")
  if [ -n "$lost" ]; then
    echo "labs-patches: labs/ has commits that are not in the series:" >&2
    git_labs log --oneline --no-walk $lost >&2
    die "export or drop them before bumping"
  fi
  git_labs fetch -q --depth 1 origin "$ref"
  local new; new=$(git_labs rev-parse FETCH_HEAD)
  local old; old=$(base_sha)
  git -C "$fnd_root" update-index --cacheinfo "160000,$new,labs"
  echo "labs gitlink: $old -> $new"
  apply
}

# Commits the worktree's use-local rewrite as the marker commit, amending the previous one
# when it is HEAD, so the labs tree is clean for cache hashing. No-op on a clean tree.
# Only the manifests, lockfiles and the foundation hash record are staged: use-local rewrites
# package.json and Nargo.toml files, the build refreshes yarn.lock and writes
# labs-aztec-toolchain/fnd-hashes. Any other tracked edit is left in the worktree (and
# reported), so work in progress never disappears into the marker.
function commit_use_local {
  initialized || die "labs/ is not checked out"
  local dirty; dirty=$({ git_labs status --porcelain --untracked-files=no; git_labs status --porcelain -- labs-aztec-toolchain/fnd-hashes; } | sort -u | sed 's/^...//')
  if [ -z "$dirty" ]; then
    echo "labs/ is clean; nothing to commit."
    return
  fi
  local rewrite other
  rewrite=$(echo "$dirty" | grep -E '(^|/)(package\.json|yarn\.lock|Nargo\.toml)$|^labs-aztec-toolchain/fnd-hashes$' || true)
  other=$(echo "$dirty" | grep -vE '(^|/)(package\.json|yarn\.lock|Nargo\.toml)$|^labs-aztec-toolchain/fnd-hashes$' || true)
  if [ -n "$other" ]; then
    echo "labs-patches: leaving uncommitted edits in labs/ that are not part of the use-local rewrite:" >&2
    echo "$other" | sed 's/^/  /' >&2
  fi
  if [ -z "$rewrite" ]; then
    echo "labs/ has no use-local rewrite to commit."
    return
  fi
  local amend=()
  [ "$(git_labs log -1 --format=%s)" = "$MARKER_SUBJECT" ] && amend=(--amend)
  echo "$rewrite" | xargs git -C "$labs" add --
  # The lockfile refresh should only touch the entries use-local rewrote (and what those
  # packages pull in); yarn also re-resolves tag ranges such as `latest`, which would move
  # every labs cache key without a foundation change. Surface anything of that kind.
  local drift
  drift=$(git_labs diff --cached -U0 -- '*yarn.lock' | grep -E '^[-+]"' | grep -vE 'portal:|file:|link:|@aztec' | sed 's/^\([-+]\)"\([^"]*\)".*/  \1 \2/' | sort -u || true)
  if [ -n "$drift" ]; then
    echo "labs-patches: note: lockfile entries changed outside the portal rewrite (yarn re-resolved them):" >&2
    echo "$drift" >&2
  fi
  git_labs -c user.name=labs-patches -c user.email=labs-patches@localhost \
    commit -q ${amend[@]+"${amend[@]}"} -m "$MARKER_SUBJECT" -m "Manifests rewritten by labs-aztec-toolchain use-local to consume the foundation checkout this submodule sits in. Not part of the patch series."
  echo "Committed the use-local rewrite as $(git_labs rev-parse --short HEAD)."
}

# A commit made by this script (the series, a marker) carries its committer identity; an
# upstream commit never does. Any such commit between the old and the staged gitlink means
# a patched head is being recorded, which no other clone could fetch.
function check_staged {
  git -C "$fnd_root" diff --cached --quiet -- labs && return 0
  initialized || return 0
  local old staged
  old=$(git -C "$fnd_root" rev-parse -q --verify HEAD:labs 2>/dev/null || true)
  staged=$(git -C "$fnd_root" rev-parse :labs)
  git_labs cat-file -e "$staged" 2>/dev/null || return 0
  # In a shallow clone the old gitlink may be unreachable; then judge the staged commit itself.
  local commits
  commits=$(git_labs rev-list "${old:+$old..}$staged" 2>/dev/null) || commits=$staged
  if git_labs log --no-walk --format=%ce $commits 2>/dev/null | grep -q "^$GIT_COMMITTER_EMAIL\$"; then
    die "the staged labs gitlink $staged includes commits made by labs-patches, which do not exist upstream. Unstage it (git restore --staged labs) and bump with labs-patches/bootstrap.sh bump <ref>."
  fi
}

function status {
  local base; base=$(base_sha)
  echo "base:    $base"
  if ! initialized; then echo "labs/:   not checked out"; return; fi
  echo "labs/:   $(git_labs rev-parse HEAD)"
  echo "series:"; patches | xargs -rn1 basename | sed 's/^/  /'
  if is_applied; then echo "applied: yes"; else echo "applied: no"; fi
  local extra; extra=$(unexported_commits "$base")
  if [ -n "$extra" ]; then echo "unexported commits in labs/:"; git_labs log --oneline --no-walk $extra | sed 's/^/  /'; fi
}

# Test commands for the foundation test engine: the lifecycle test runs the tooling against
# a sandbox fixture, and check verifies the committed series against the gitlink.
# The paths are root-relative (the test engine runs from the repo root), and so is the hash
# input: the Makefile invokes this from labs-patches/, hence the cd. The gitlink is part of
# the hash so check is never served from the test cache across a pin bump.
function test_cmds {
  local inputs="labs-patches scripts/labs_test_cmds.sh scripts/labs_env.sh"
  local h
  # Uncommitted edits must not be served a cached result, as with cache_content_hash.
  if [ -n "$(cd "$fnd_root" && git status --porcelain -- $inputs)" ]; then
    h=disabled-cache
  else
    h=$(cd "$fnd_root" && { git rev-parse :labs; git ls-files -z -- $inputs | xargs -0 cat; } | git hash-object --stdin | cut -c1-16)
  fi
  [ -n "$h" ] || die "could not hash labs-patches"
  echo "$h labs-patches/tests/lifecycle_test"
  echo "$h labs-patches/bootstrap.sh check"
}

case "${1:-apply}" in
  apply) apply ;;
  export) export_series ;;
  check) check ;;
  bump) bump "${2:-}" ;;
  commit-use-local) commit_use_local ;;
  check_staged) check_staged ;;
  status) status ;;
  test_cmds) test_cmds ;;
  test) "$patch_dir/tests/lifecycle_test" && check ;;
  *) die "unknown command: $1" ;;
esac
