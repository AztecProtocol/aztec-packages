#!/usr/bin/env bash
# Fast worktree setup for aztec-packages backed by a shared, frozen, content-addressed deps store.
#
# Instead of a full multi-minute ./bootstrap.sh, `create` makes a git worktree, copies the writable
# yarn-project layer (node_modules, .yarn/cache, generated build outputs) from the source checkout,
# and runs each upstream component's bootstrap in link mode so their cached artifacts are symlinked
# from a shared read-only store (CACHE_LINK_DIR) instead of extracted in place.
set -euo pipefail

# SCRIPT_ROOT is the checkout this script lives in (resolved via the script's own path, not CWD,
# which could point at a different — possibly unbuilt — checkout). It is the fallback source for
# `create` and the anchor for the other commands when CWD is not inside a repo.
SCRIPT_ROOT=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_ROOT")

# Store locations (overridable via env). CACHE_LOCAL_DIR holds downloaded tarballs (existing ci3
# behavior); CACHE_LINK_DIR holds the extracted, frozen, content-addressed entries we symlink into.
CACHE_LOCAL_DIR=${CACHE_LOCAL_DIR:-$HOME/.cache/aztec-build-cache}
CACHE_LINK_DIR=${CACHE_LINK_DIR:-$CACHE_LOCAL_DIR/extracted}
export CACHE_LOCAL_DIR CACHE_LINK_DIR

# Upstream components bootstrapped in link mode, in dependency order. yarn-project is intentionally
# absent: its layer is copied from the source checkout (its tarball is excluded from link mode).
UPSTREAM_COMPONENTS=(
  "barretenberg/cpp"
  "barretenberg/ts"
  "noir"
  "avm-transpiler"
  "l1-contracts"
  "noir-projects"
)

function log { echo -e "$@" >&2; }
function die { log "Error: $*"; exit 1; }

function usage {
  cat >&2 <<'EOF'
worktrees.sh — fast git worktrees for aztec-packages backed by a shared frozen deps store.

USAGE
  scripts/worktrees.sh create <name> [base-ref] [--branch <branch>] [--frozen-only] [--dry-run]
  scripts/worktrees.sh status [path]
  scripts/worktrees.sh thaw <path>...
  scripts/worktrees.sh gc [--dry-run] [--keep-days N]
  scripts/worktrees.sh --help

COMMANDS

  create <name> [base-ref]
      Create a worktree as a sibling of the source checkout (<parent-of-source>/<name>), on a new
      branch, based on <base-ref> (default: the source checkout's current HEAD).

      SOURCE CHECKOUT
        The source is the aztec-packages checkout containing your current directory (so you can run
        this from anywhere inside your checkout). If CWD is not inside such a checkout, the checkout
        this script lives in is used instead.

      BRANCH NAME (first match wins)
        --branch <branch>     use <branch> verbatim.
        <name> contains a /   <name> IS the branch; the worktree dir is its last segment
                                (e.g. create ab/fix-thing -> branch ab/fix-thing, dir fix-thing).
        otherwise             prefix <name> with your initials from the source checkout's git config:
                                user.initials if set, else initials derived from user.name
                                ("Jane van Doe" -> jvd). With neither set, <name> is used unprefixed.

      --dry-run
        Resolve and print the source checkout, worktree path, branch, and base-ref, then exit
        without fetching, creating the worktree, or touching the store.

      What happens:
        1. git worktree add <parent-of-source>/<name>  (git fetch first if base-ref looks remote).
        2. Copy the WRITABLE yarn layer from the source checkout (real copies, ext4 has no reflink):
             - yarn-project/.yarn/cache + .yarn/install-state.gz
             - root + per-workspace node_modules (preserves the relative @aztec/* symlinks so they
               resolve inside the worktree)
             - all gitignored yarn-project build outputs (dest/, generated src/, artifacts,
               .tsbuildinfo), enumerated dynamically; node_modules and junk (logs, joblog.txt) excluded.
           Build outputs are only copied when the source and the worktree are at the same yarn-project
           content state (same cache_content_hash, or same HEAD + clean tree when hashes are disabled
           by uncommitted changes); otherwise they are skipped and you run yarn-project/bootstrap.sh or
           yarn build in the worktree. node_modules is still copied when yarn.lock content matches.
        3. Run each upstream component bootstrap inside the worktree in LINK mode. On a store/cache hit
           this is download + extract-once + symlink time only. On a cache MISS the component builds
           locally (correct, but slow) — pass --frozen-only to abort instead of building.
        4. Write .deps-manifest.json and print a summary.

      SYMLINKED vs COPIED
        Symlinked (read-only, shared via the store): everything an upstream component bootstrap pulls
        from cache — barretenberg build/ (bb binary + wasm), noir-repo/target/release binaries,
        l1-contracts out/cache/generated, per-contract and per-circuit artifacts.
        Extracted in place (real files, per-worktree): bb.js dest/build and noir/packages — their
        contents are loaded as Node.js modules, which resolve imports from real paths and so must
        live inside the checkout — plus the copied yarn-project layer above.

      FREEZE SEMANTICS
        Store entries are content-addressed and immutable. After extraction they are chmod -R a-w, so a
        stray rebuild writing through a symlink fails loudly with EACCES instead of silently corrupting
        a shared entry. To rebuild an upstream component locally, thaw it first (see `thaw`).

      DRIFT / REFRESH
        Symlinks point at content-addressed store entries, so they never go stale on their own. After a
        rebase that changes an upstream component, re-run that component's bootstrap in the worktree with
        CACHE_LINK_DIR + CACHE_LOCAL_DIR exported (e.g. `CACHE_LINK_DIR=... CACHE_LOCAL_DIR=...
        ./barretenberg/cpp/bootstrap.sh`) to repoint links at the new content. If the worktree's
        yarn.lock diverges from the copied node_modules, delete node_modules and run `yarn install`.

      CHICKEN-AND-EGG
        Link mode only kicks in if the worktree's checked-out ci3/cache_download honors CACHE_LINK_DIR.
        If your base-ref predates that patch, create warns and deps are extracted in place (correct,
        just more disk).

  status [path]
      For the given checkout (default: current), show linked store entries and whether their store
      paths still exist, the copied-layer provenance (source + commit) from the manifest, and a drift
      hint comparing the worktree yarn.lock hash to the manifest.

  thaw <path>...
      Replace store symlinks at the given paths with writable copies (cp from the store, chmod u+w) and
      drop those entries from the checkout's manifest. Use before rebuilding an upstream component
      locally. Refreeze by re-running that component's bootstrap in link mode.

  gc [--dry-run] [--keep-days N]
      Garbage-collect the store. Roots = the manifests of every checkout in `git worktree list` (a
      removed worktree drops its roots automatically). Extracted entries not referenced by any live
      checkout are chmod -R u+w then rm -rf'd. As a safety net, an entry is kept (with a warning) if any
      registered checkout still has a symlink pointing into it. Tarballs older than --keep-days (default
      30) whose extracted entry is dead are also removed. --dry-run prints what would be removed.

ENVIRONMENT
  CACHE_LOCAL_DIR   tarball cache dir (default ~/.cache/aztec-build-cache)
  CACHE_LINK_DIR    extracted frozen store (default $CACHE_LOCAL_DIR/extracted)

Design docs (store layout, grafting, exclusions, hash pitfalls): scripts/worktrees.md
EOF
}

# ---------------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------------

# Compute the yarn-project content hash for a checkout, or empty if the cache is disabled (uncommitted
# changes) or the helper is unavailable.
function yp_content_hash {
  local checkout="$1"
  local h
  h=$(cd "$checkout/yarn-project" && ./bootstrap.sh hash 2>/dev/null) || return 0
  [[ "$h" == *disabled-cache* ]] && return 0
  echo "$h"
}

# True when source and worktree are at the same yarn-project content state, so build outputs can be
# copied. Prefer content hashes; fall back to "same HEAD commit + clean tracked files".
function yp_same_state {
  local src="$1" wt="$2"
  local hs hw
  hs=$(yp_content_hash "$src")
  hw=$(yp_content_hash "$wt")
  if [[ -n "$hs" && -n "$hw" ]]; then
    [[ "$hs" == "$hw" ]] && return 0 || return 1
  fi
  # Hashes disabled (uncommitted changes somewhere): fall back to commit + clean tracked files.
  # -uno: untracked scratch files can't change build outputs (nothing tracked references them), and
  # blocking on them would force a full rebuild in every worktree made from a mildly messy checkout.
  local cs cw
  cs=$(git -C "$src" rev-parse HEAD)
  cw=$(git -C "$wt" rev-parse HEAD)
  [[ "$cs" == "$cw" ]] || return 1
  [[ -z "$(git -C "$src" status --porcelain -uno -- yarn-project)" ]] || return 1
  return 0
}

function yarn_lock_hash {
  local checkout="$1"
  local lock="$checkout/yarn-project/yarn.lock"
  [[ -f "$lock" ]] || return 0
  sha256sum "$lock" | cut -d' ' -f1
}

# True if the given directory looks like an aztec-packages checkout root.
function is_aztec_checkout {
  local d="$1"
  [[ -n "$d" && -f "$d/scripts/worktrees.sh" && -d "$d/yarn-project" ]]
}

# Resolve the SOURCE checkout for `create`. Prefer the aztec-packages checkout containing CWD; fall
# back to SCRIPT_ROOT (the checkout this script lives in). If both resolve, differ, and CWD wins,
# note which source is used so a teammate isn't surprised when they invoke the script by an absolute
# path from inside a different checkout.
function resolve_source {
  local cwd_root=""
  cwd_root=$(git rev-parse --show-toplevel 2>/dev/null) || cwd_root=""
  if [[ -n "$cwd_root" ]] && is_aztec_checkout "$cwd_root"; then
    [[ "$cwd_root" != "$SCRIPT_ROOT" ]] && log "Using source checkout from CWD: $cwd_root"
    echo "$cwd_root"
    return 0
  fi
  echo "$SCRIPT_ROOT"
}

# Derive the default branch name for a worktree from the source checkout's git config, following the
# repo convention (yarn-project/CLAUDE.md): user.initials if set, else initials derived from
# user.name (lowercased first letter of each word), else the bare name.
function default_branch {
  local source="$1" name="$2"
  local initials
  initials=$(git -C "$source" config user.initials 2>/dev/null || true)
  if [[ -z "$initials" ]]; then
    local fullname
    fullname=$(git -C "$source" config user.name 2>/dev/null || true)
    if [[ -n "$fullname" ]]; then
      initials=$(echo "$fullname" | awk '{ out=""; for (i=1;i<=NF;i++) out=out tolower(substr($i,1,1)); print out }')
    fi
  fi
  if [[ -n "$initials" ]]; then
    echo "$initials/$name"
  else
    echo "$name"
  fi
}

# ---------------------------------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------------------------------

function cmd_create {
  local name="" base_ref="" branch="" frozen_only=0 dry_run=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --branch) branch="$2"; shift 2 ;;
      --frozen-only) frozen_only=1; shift ;;
      --dry-run) dry_run=1; shift ;;
      --help|-h) usage; exit 0 ;;
      -*) die "Unknown option: $1" ;;
      *)
        if [[ -z "$name" ]]; then name="$1";
        elif [[ -z "$base_ref" ]]; then base_ref="$1";
        else die "Unexpected argument: $1"; fi
        shift ;;
    esac
  done
  [[ -n "$name" ]] || { usage; die "create requires <name>"; }

  local source
  source=$(resolve_source)

  # A <name> containing a slash IS the full branch name; the worktree dir is its last path segment.
  local dir_name="$name"
  if [[ "$name" == */* ]]; then
    branch=${branch:-$name}
    dir_name="${name##*/}"
  fi
  branch=${branch:-$(default_branch "$source" "$name")}

  local wt_path
  wt_path="$(dirname "$source")/$dir_name"
  base_ref=${base_ref:-HEAD}

  if [[ "$dry_run" -eq 1 ]]; then
    log "Dry run (no changes made):"
    log "  source:   $source"
    log "  path:     $wt_path"
    log "  branch:   $branch"
    log "  base-ref: $base_ref"
    return 0
  fi

  [[ -d "$source/yarn-project/node_modules" ]] \
    || die "Source checkout $source has no yarn-project/node_modules — bootstrap it before creating worktrees."
  [[ -e "$wt_path" ]] && die "Path already exists: $wt_path"

  # Fetch first if base-ref looks like a remote ref (origin/... or a remote-tracking name).
  if [[ "$base_ref" == origin/* || "$base_ref" == */* ]]; then
    log "Fetching to resolve base-ref $base_ref..."
    git -C "$source" fetch || die "git fetch failed"
  fi

  log "Creating worktree $wt_path on branch $branch (base $base_ref)..."
  if git -C "$source" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$source" worktree add "$wt_path" "$branch"
  else
    git -C "$source" worktree add -b "$branch" "$wt_path" "$base_ref"
  fi

  # An uninitialized noir-repo makes `git -C noir-repo rev-parse HEAD` resolve to the PARENT repo's
  # HEAD (git walks up from the empty dir), corrupting the noir content hash and, through the
  # dependency chain, every downstream component hash — turning cache hits into misses.
  log "Initializing noir/noir-repo submodule..."
  git -C "$wt_path" submodule update --init noir/noir-repo || die "submodule init failed"

  # Chicken-and-egg: only graft if the worktree's own cache_download honors CACHE_LINK_DIR.
  local link_supported=1
  if ! grep -q CACHE_LINK_DIR "$wt_path/ci3/cache_download" 2>/dev/null; then
    link_supported=0
    log "WARNING: this base-ref's ci3/cache_download has no CACHE_LINK_DIR support."
    log "         Upstream deps will be EXTRACTED IN PLACE (correct, just more disk)."
  fi

  # --- copy the writable yarn layer ---
  local copied=()
  copy_yarn_layer "$source" "$wt_path" copied

  # --- bootstrap upstream components in link mode ---
  : > "$wt_path/.deps-manifest.linked"
  local failed_frozen=()
  local comp
  for comp in "${UPSTREAM_COMPONENTS[@]}"; do
    [[ -x "$wt_path/$comp/bootstrap.sh" ]] || { log "Skipping $comp (no bootstrap.sh)."; continue; }
    if [[ "$frozen_only" -eq 1 ]]; then
      if ! frozen_precheck "$wt_path" "$comp"; then
        failed_frozen+=("$comp")
        continue
      fi
    fi
    log "Bootstrapping $comp in link mode..."
    if ! ( cd "$wt_path/$comp" && CACHE_LINK_DIR="$CACHE_LINK_DIR" CACHE_LOCAL_DIR="$CACHE_LOCAL_DIR" CI=0 ./bootstrap.sh ); then
      log "WARNING: $comp bootstrap returned non-zero; continuing."
    fi
  done

  if [[ ${#failed_frozen[@]} -gt 0 ]]; then
    die "--frozen-only: missing cached artifacts for: ${failed_frozen[*]}. Aborting before any local build."
  fi

  write_manifest "$wt_path" "$source" copied

  log ""
  log "Worktree ready: $wt_path (branch $branch)"
  log "  Linked store entries: $(wc -l < "$wt_path/.deps-manifest.linked" 2>/dev/null || echo 0)"
  log "  Copied yarn layer items: ${#copied[@]}"
  log ""
  log "Next steps:"
  log "  cd $wt_path/yarn-project"
  if [[ "$link_supported" -eq 0 ]]; then
    log "  (deps were extracted in place; this base-ref lacks CACHE_LINK_DIR support)"
  fi
  log "  # If build outputs were skipped (hash mismatch), run:  ./bootstrap.sh   or   yarn build"
}

# Copy the writable yarn-project layer. Appends copied item descriptors to the named array.
function copy_yarn_layer {
  local source="$1" wt="$2"
  local -n _copied="$3"
  local syp="$source/yarn-project"
  local wyp="$wt/yarn-project"

  log "Copying yarn-project writable layer..."

  # .yarn/cache + install-state (so a fresh worktree doesn't re-download every package zip).
  if [[ -d "$syp/.yarn/cache" ]]; then
    mkdir -p "$wyp/.yarn"
    cp -a --reflink=auto "$syp/.yarn/cache" "$wyp/.yarn/cache"
    _copied+=("yarn-project/.yarn/cache")
  fi
  if [[ -f "$syp/.yarn/install-state.gz" ]]; then
    mkdir -p "$wyp/.yarn"
    cp -a --reflink=auto "$syp/.yarn/install-state.gz" "$wyp/.yarn/install-state.gz"
    _copied+=("yarn-project/.yarn/install-state.gz")
  fi

  # node_modules: copy when yarn.lock content matches; otherwise warn (user runs yarn install).
  local lock_match=1
  if [[ "$(yarn_lock_hash "$source")" != "$(yarn_lock_hash "$wt")" ]]; then
    lock_match=0
    log "  yarn.lock differs between source and worktree; skipping node_modules copy."
    log "  Run 'yarn install' in the worktree's yarn-project."
  fi
  if [[ "$lock_match" -eq 1 ]]; then
    # Root node_modules + per-workspace node_modules (the @aztec/* relative symlinks survive cp -a).
    local nm
    while IFS= read -r nm; do
      local dst="$wyp/$nm"
      mkdir -p "$(dirname "$dst")"
      cp -a --reflink=auto "$syp/$nm" "$dst"
      _copied+=("yarn-project/$nm")
    done < <(cd "$syp" && { [[ -d node_modules ]] && echo node_modules; find . -maxdepth 2 -type d -name node_modules ! -path './node_modules' -printf '%P\n' 2>/dev/null; })
  fi

  # Build outputs: only when source and worktree are at the same yarn-project content state.
  if yp_same_state "$source" "$wt"; then
    log "  Copying yarn-project build outputs (same content state)..."
    local f count=0
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      local dst="$wyp/$f"
      mkdir -p "$(dirname "$dst")"
      cp -a --reflink=auto "$syp/$f" "$dst" 2>/dev/null || continue
      count=$((count + 1))
    done < <(cd "$syp" && git -C "$syp" ls-files --others --ignored --exclude-standard \
      | grep -vE '(^|/)node_modules/' \
      | grep -vE '(^|/)joblog\.txt$|\.log$' )
    _copied+=("yarn-project/<build-outputs:$count files>")
    log "  Copied $count build-output files."
  else
    log "  yarn-project content state differs from source; SKIPPING build outputs."
    log "  Run './bootstrap.sh' or 'yarn build' in the worktree's yarn-project."
  fi
}

# Best-effort pre-check for --frozen-only: confirm the component's primary cached artifact exists
# before bootstrap would start a local build. Per-contract / per-circuit granularity is not checked
# (documented limitation); we check the coarse top-level artifact per component.
function frozen_precheck {
  local wt="$1" comp="$2"
  local h
  case "$comp" in
    barretenberg/cpp)
      h=$(cd "$wt/barretenberg/cpp" && ./bootstrap.sh hash 2>/dev/null) || return 0
      _frozen_check "barretenberg-$(_bb_native_preset "$wt")-$h.zst" ;;
    barretenberg/ts)
      h=$(cd "$wt/barretenberg/ts" && ./bootstrap.sh hash 2>/dev/null) || return 0
      _frozen_check "bb.js-$h.tar.gz" ;;
    noir)
      h=$(cd "$wt/noir" && ./bootstrap.sh hash 2>/dev/null) || return 0
      _frozen_check "noir-$h.tar.gz" ;;
    avm-transpiler)
      h=$(cd "$wt/avm-transpiler" && ./bootstrap.sh hash 2>/dev/null) || return 0
      _frozen_check "avm-transpiler-$h.tar.gz" ;;
    *)
      # l1-contracts and noir-projects use per-artifact/per-contract granularity; not pre-checked.
      return 0 ;;
  esac
}

function _bb_native_preset {
  # Read the native preset the worktree's cpp bootstrap actually uses (e.g. clang20), honoring
  # an explicit NATIVE_PRESET override, so the coarse pre-check looks for the right artifact name.
  local wt="$1"
  if [[ -n "${NATIVE_PRESET:-}" ]]; then echo "$NATIVE_PRESET"; return 0; fi
  local p
  p=$(grep -oE 'native_preset=\$\{NATIVE_PRESET:-[a-zA-Z0-9_-]+\}' "$wt/barretenberg/cpp/bootstrap.sh" 2>/dev/null \
    | head -1 | sed -E 's/.*:-([a-zA-Z0-9_-]+)\}/\1/')
  echo "${p:-clang20}"
}

function _frozen_check {
  local artifact="$1"
  if CACHE_LINK_DIR="$CACHE_LINK_DIR" CACHE_LOCAL_DIR="$CACHE_LOCAL_DIR" "$ROOT/ci3/cache_exists" "$artifact" 2>/dev/null; then
    return 0
  fi
  if [[ -f "$CACHE_LOCAL_DIR/$artifact" ]]; then
    return 0
  fi
  log "  --frozen-only: missing cached artifact $artifact"
  return 1
}

function write_manifest {
  local wt="$1" source="$2"
  local -n _copied_ref="$3"
  local linked_json copied_json
  linked_json=$(sort -u "$wt/.deps-manifest.linked" 2>/dev/null | jq -R . | jq -s . 2>/dev/null || echo "[]")
  copied_json=$(printf '%s\n' "${_copied_ref[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
  jq -n \
    --arg source "$source" \
    --arg sourceCommit "$(git -C "$source" rev-parse HEAD)" \
    --arg createdAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg yarnLockHash "$(yarn_lock_hash "$wt")" \
    --argjson linked "$linked_json" \
    --argjson copied "$copied_json" \
    '{source: $source, sourceCommit: $sourceCommit, createdAt: $createdAt, yarnLockHash: $yarnLockHash, linked: $linked, copied: $copied}' \
    > "$wt/.deps-manifest.json"
}

# ---------------------------------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------------------------------

function cmd_status {
  local checkout="${1:-$ROOT}"
  checkout=$(cd "$checkout" && git rev-parse --show-toplevel)
  local manifest="$checkout/.deps-manifest.json"
  log "Checkout: $checkout"
  if [[ ! -f "$manifest" ]]; then
    log "No .deps-manifest.json found (not set up via worktrees.sh create)."
    if [[ -f "$checkout/.deps-manifest.linked" ]]; then
      log "Linked entries (from .deps-manifest.linked):"
      sort -u "$checkout/.deps-manifest.linked" | while read -r e; do
        [[ -z "$e" ]] && continue
        if [[ -d "$CACHE_LINK_DIR/$e" ]]; then log "  [ok]      $e"; else log "  [MISSING] $e"; fi
      done
    fi
    return 0
  fi
  log "Source:       $(jq -r .source "$manifest")"
  log "Source commit:$(jq -r .sourceCommit "$manifest")"
  log "Created:      $(jq -r .createdAt "$manifest")"
  log ""
  log "Linked store entries:"
  jq -r '.linked[]' "$manifest" | while read -r e; do
    [[ -z "$e" ]] && continue
    if [[ -d "$CACHE_LINK_DIR/$e" ]]; then log "  [ok]      $e"; else log "  [MISSING] $e"; fi
  done
  log ""
  local mh ch
  mh=$(jq -r .yarnLockHash "$manifest")
  ch=$(yarn_lock_hash "$checkout")
  if [[ "$mh" == "$ch" ]]; then
    log "yarn.lock: unchanged since setup."
  else
    log "yarn.lock: DRIFTED since setup (delete node_modules + run 'yarn install' if builds break)."
  fi
}

# ---------------------------------------------------------------------------------------------------
# thaw
# ---------------------------------------------------------------------------------------------------

function cmd_thaw {
  [[ $# -gt 0 ]] || die "thaw requires at least one path"
  local checkout
  checkout=$(git rev-parse --show-toplevel)
  local p
  for p in "$@"; do
    local abs
    # -s: do not follow symlinks, so a path that IS a store symlink stays the symlink (we thaw it),
    # rather than resolving to the store target.
    abs=$(realpath -m -s "$p")
    thaw_path "$abs" "$checkout"
  done
}

# Replace store symlinks at or under a path with writable copies; drop thawed entries from the manifest.
function thaw_path {
  local target="$1" checkout="$2"
  local -A thawed_entries=()

  if [[ -L "$target" ]]; then
    _thaw_one "$target" thawed_entries
  elif [[ -d "$target" ]]; then
    local link
    while IFS= read -r -d '' link; do
      _thaw_one "$link" thawed_entries
    done < <(find "$target" -type l -lname "$CACHE_LINK_DIR/*" -print0 2>/dev/null)
  else
    log "thaw: $target is not a symlink or directory; skipping."
    return 0
  fi

  # Drop thawed entries from this checkout's manifests.
  local e
  for e in "${!thawed_entries[@]}"; do
    if [[ -f "$checkout/.deps-manifest.linked" ]]; then
      grep -vxF "$e" "$checkout/.deps-manifest.linked" > "$checkout/.deps-manifest.linked.tmp" || true
      mv "$checkout/.deps-manifest.linked.tmp" "$checkout/.deps-manifest.linked"
    fi
    if [[ -f "$checkout/.deps-manifest.json" ]]; then
      jq --arg e "$e" '.linked |= map(select(. != $e))' "$checkout/.deps-manifest.json" \
        > "$checkout/.deps-manifest.json.tmp" && mv "$checkout/.deps-manifest.json.tmp" "$checkout/.deps-manifest.json"
    fi
  done
  log "Thawed ${#thawed_entries[@]} store entr$([[ ${#thawed_entries[@]} -eq 1 ]] && echo y || echo ies) under $target."
}

function _thaw_one {
  local link="$1"
  local -n _thawed="$2"
  local store_target
  store_target=$(readlink "$link")
  # entry name = first path component of store_target relative to CACHE_LINK_DIR.
  local rel="${store_target#"$CACHE_LINK_DIR"/}"
  local entry="${rel%%/*}"
  log "  thawing $link -> writable copy"
  rm -f "$link"
  cp -a --reflink=auto "$store_target" "$link"
  chmod -R u+w "$link"
  _thawed["$entry"]=1
}

# ---------------------------------------------------------------------------------------------------
# gc
# ---------------------------------------------------------------------------------------------------

function cmd_gc {
  local dry_run=0 keep_days=30
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) dry_run=1; shift ;;
      --keep-days) keep_days="$2"; shift 2 ;;
      *) die "Unknown gc option: $1" ;;
    esac
  done

  git -C "$ROOT" worktree prune

  [[ -d "$CACHE_LINK_DIR" ]] || { log "No store at $CACHE_LINK_DIR; nothing to collect."; return 0; }

  # Live roots = union of linked entries across every registered checkout.
  local -A live=()
  local checkout
  while IFS= read -r checkout; do
    [[ -z "$checkout" ]] && continue
    local m="$checkout/.deps-manifest.json"
    [[ -f "$m" ]] && while read -r e; do [[ -n "$e" ]] && live["$e"]=1; done < <(jq -r '.linked[]?' "$m" 2>/dev/null)
    local l="$checkout/.deps-manifest.linked"
    [[ -f "$l" ]] && while read -r e; do [[ -n "$e" ]] && live["$e"]=1; done < "$l"
  done < <(git -C "$ROOT" worktree list --porcelain | awk '/^worktree /{print $2}')

  log "Live store entries: ${#live[@]}"

  # Registered checkouts (for the symlink safety-net scan).
  local checkouts=()
  while IFS= read -r checkout; do
    [[ -n "$checkout" ]] && checkouts+=("$checkout")
  done < <(git -C "$ROOT" worktree list --porcelain | awk '/^worktree /{print $2}')

  local entry collected=0
  for entry_dir in "$CACHE_LINK_DIR"/*/; do
    [[ -d "$entry_dir" ]] || continue
    entry=$(basename "$entry_dir")
    [[ "$entry" == .tmp.* ]] && continue
    if [[ -n "${live[$entry]:-}" ]]; then
      continue
    fi
    # Safety net: keep if any registered checkout still has a symlink into this entry.
    local referenced=0 co
    for co in "${checkouts[@]}"; do
      if find "$co" -maxdepth 6 -type l -lname "$CACHE_LINK_DIR/$entry/*" -print -quit 2>/dev/null | grep -q .; then
        referenced=1; break
      fi
      if find "$co" -maxdepth 6 -type l -lname "$CACHE_LINK_DIR/$entry" -print -quit 2>/dev/null | grep -q .; then
        referenced=1; break
      fi
    done
    if [[ "$referenced" -eq 1 ]]; then
      log "  KEEP (still symlinked, not in manifest): $entry"
      continue
    fi
    if [[ "$dry_run" -eq 1 ]]; then
      log "  would remove entry: $entry"
    else
      log "  removing entry: $entry"
      chmod -R u+w "$entry_dir" 2>/dev/null || true
      rm -rf "$entry_dir"
    fi
    collected=$((collected + 1))
  done

  # Sweep dead tarballs older than keep_days whose extracted entry is gone.
  local tarball name base collected_tar=0
  if [[ -d "$CACHE_LOCAL_DIR" ]]; then
    while IFS= read -r tarball; do
      [[ -z "$tarball" ]] && continue
      name=$(basename "$tarball")
      base="$name"; base="${base%.tar.gz}"; base="${base%.zst}"; base="${base%.tar}"
      [[ -d "$CACHE_LINK_DIR/$base" ]] && continue
      [[ -n "${live[$base]:-}" ]] && continue
      if [[ "$dry_run" -eq 1 ]]; then
        log "  would remove tarball (>$keep_days days, dead): $name"
      else
        log "  removing tarball: $name"
        rm -f "$tarball"
      fi
      collected_tar=$((collected_tar + 1))
    done < <(find "$CACHE_LOCAL_DIR" -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.zst' -o -name '*.tar' \) -mtime "+$keep_days" 2>/dev/null)
  fi

  log ""
  if [[ "$dry_run" -eq 1 ]]; then
    log "Dry run: $collected store entr$([[ $collected -eq 1 ]] && echo y || echo ies) and $collected_tar tarball(s) would be collected."
  else
    log "Collected $collected store entr$([[ $collected -eq 1 ]] && echo y || echo ies) and $collected_tar tarball(s)."
  fi
}

# ---------------------------------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------------------------------

cmd="${1:-}"
if [[ $# -gt 0 ]]; then shift; fi
case "$cmd" in
  create) cmd_create "$@" ;;
  status) cmd_status "$@" ;;
  thaw)   cmd_thaw "$@" ;;
  gc)     cmd_gc "$@" ;;
  --help|-h|help|"") usage; [[ -z "$cmd" ]] && exit 1 || exit 0 ;;
  *) usage; die "Unknown command: $cmd" ;;
esac
