#!/usr/bin/env bash
# Keeps docs/ in step with aztec-node's docs/ (the labs submodule) until the docs are owned here.
# Code outside docs/ is read through labs/, so every Labs docs tree is "rerooted" before use:
# snippet and reference paths gain a labs/ prefix, Nargo path dependencies that climb to the
# repo root descend into labs/, and the Netlify build is disabled (aztec-docs-dev builds this
# directory, while production is deployed from aztec-node).
#
#   import <ref>            replace docs/ with the rerooted Labs docs at <ref> (once)
#   sync <ref>              3-way merge Labs' docs changes since docs/.labs-sync into docs/
#   reroot [--check]        apply (or, with --check, list) the layout rewrites on docs/
#   check                   fail on drift: reroot, .labs-sync vs the gitlink, patched snippet
#                           sources, l1-artifacts vs BB_VERSION, the Netlify guard
#   --release <tag>         (sync, check) compare against a pristine labs/ at <tag> instead of
#                           the gitlink; for release cut worktrees only
#
# A sync merges R(last) -> R(ref) into HEAD, where R(x) is a parentless commit holding only the
# rerooted docs/ of Labs commit x, rebuilt from labs/ on every run. Both sides are rerooted, so
# Labs edits to rewritten lines merge cleanly, and non-docs paths count as ours and stay.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$root"
sync_file=docs/.labs-sync
source_dirs=(docs/docs docs/docs-developers docs/docs-operate docs/docs-participate)
# Generators that emit references frontmatter into source pages.
generated_refs=(
  docs/scripts/cli_reference_generation/operator_cli_preamble.md
  docs/scripts/node_api_reference_generation/generate_node_api_reference.ts
)

function die { echo "labs_docs_sync: $*" >&2; exit 1; }
function labs { git -C "$root/labs" "$@"; }

# Resolves <ref> to a commit SHA in labs/, fetching it (shallow) when absent.
function resolve {
  local sha
  if sha=$(labs rev-parse --verify -q "$1^{commit}"); then echo "$sha"; return; fi
  labs fetch -q --depth 1 origin "$1" || die "cannot fetch $1 into labs/"
  labs rev-parse --verify 'FETCH_HEAD^{commit}'
}

# Files under <base> that reroot rewrites, NUL-separated and relative to <base>. In the repo,
# tracked files only, so node_modules and build outputs are never touched.
function reroot_files {
  local base=$1
  if [ "$base" = "$root" ]; then
    git ls-files -z -- "${source_dirs[@]/%//*.md}" "${source_dirs[@]/%//*.mdx}" "${generated_refs[@]}" \
      'docs/*Nargo.toml' docs/netlify.toml
  else
    (cd "$base" && find "${source_dirs[@]}" -type f \( -name '*.md' -o -name '*.mdx' \) -print0 2>/dev/null || true
     for f in "${generated_refs[@]}" docs/netlify.toml; do [ -f "$f" ] && printf '%s\0' "$f"; done
     find docs -type f -name Nargo.toml -not -path '*/node_modules/*' -print0)
  fi
}

# Rewrites the files listed on stdin (relative to cwd). With --check, prints the files that
# would change and exits 1 if any would. Idempotent: rewritten paths start with labs/.
function reroot_apply {
  perl -e '
    use strict; use warnings;
    my $check = ($ARGV[0] // "") eq "--check";
    my $guard = qq{# In aztec-packages, skip every build: aztec-docs-dev builds this directory, while\n}
              . qq{# docs.aztec.network is deployed from aztec-node with `netlify deploy --prod`.\n};
    my $prefix = sub {   # quoted path not under docs/ or labs/ -> labs/<path>
      my $s = shift;
      $s =~ s{(["\x27])([^"\x27]*)\1}{
        my ($q, $p) = ($1, $2);
        $p =~ s{^(/?)(?!(?:docs|labs)/)(?=[^/\s])}{$1labs/};
        "$q$p$q"
      }ge;
      $s;
    };
    local $/ = "\0";
    my @files = <STDIN>; chomp @files;
    my $changed = 0;
    for my $f (@files) {
      open(my $in, "<", $f) or die "$f: $!";
      my $s = do { local $/; <$in> }; close $in;
      my $o = $s;
      if ($f =~ m{(?:^|/)netlify\.toml$}) {
        $s =~ s{^([ \t]*)ignore[ \t]*=[ \t]*"(?!exit 0")[^"\n]*"[ \t]*$}{
          my $i = $1; (join "", map { "$i$_\n" } split /\n/, $guard) . qq{${i}ignore = "exit 0"}
        }gme;
      } elsif ($f =~ m{(?:^|/)Nargo\.toml$}) {
        my $depth = () = $f =~ m{/}g;   # directories between the repo root and this file
        $s =~ s{(path\s*=\s*")((?:\.\./){$depth})(?!\.\./|(?:docs|labs)/)}{$1$2labs/}g;
      } elsif ($f =~ m{\.ts$}) {
        $s =~ s{(references:\s*\[)([^\]]*)}{$1 . $prefix->($2)}ge;
      } else {
        # #include_code <id> <path> <lang>: the preprocessor skips lines opening with <!--.
        $s = join "", map {
          s{(#include_code\s+\S+\s+)(/?)(?!(?:docs|labs)/)([^/\s]\S*)(?=[ \t]+\S)}{$1$2labs/$3} unless /^<!--/;
          $_
        } split /^/m, $s;
        $s =~ s{\A(---\n.*?\n)(---\n)}{
          my ($fm, $end) = ($1, $2);
          $fm =~ s{^(references:\s*\[)([^\]]*)}{$1 . $prefix->($2)}gme;
          $fm . $end
        }se;
      }
      next if $s eq $o;
      $changed = 1;
      if ($check) { print "$f\n"; next; }
      open(my $out, ">", $f) or die "$f: $!"; print $out $s; close $out;
    }
    exit($check && $changed ? 1 : 0);
  ' -- "$@"
}

function reroot_dir {
  local base=$1; shift
  (cd "$base" && reroot_files "$base" | reroot_apply "$@")
}

# R(sha): a deterministic parentless commit of Labs' docs/ at <sha>, rerooted, in this repo.
function rerooted_commit {
  local sha=$1 tmp tree gitdir
  tmp=$(mktemp -d)
  gitdir=$(git rev-parse --absolute-git-dir)
  mkdir "$tmp/tree"
  labs archive --format=tar "$sha" docs | tar -x -C "$tmp/tree"
  reroot_dir "$tmp/tree" >/dev/null
  # -f: Labs tracks files this repo's .gitignore matches; no attribute filters may alter blobs.
  (cd "$tmp/tree" && GIT_INDEX_FILE=$tmp/index git --git-dir="$gitdir" --work-tree=. \
    -c core.autocrlf=false -c core.attributesFile=/dev/null -c core.fsmonitor=false add -A -f .)
  tree=$(GIT_INDEX_FILE=$tmp/index git write-tree)
  rm -rf "$tmp"
  GIT_AUTHOR_NAME=labs-docs-sync GIT_AUTHOR_EMAIL=labs-docs-sync@localhost GIT_AUTHOR_DATE=2000-01-01T00:00:00Z \
  GIT_COMMITTER_NAME=labs-docs-sync GIT_COMMITTER_EMAIL=labs-docs-sync@localhost GIT_COMMITTER_DATE=2000-01-01T00:00:00Z \
    git commit-tree --no-gpg-sign -m "aztec-node docs at $sha, rerooted" "$tree"
}

# The Labs commit docs/ must track: the staged gitlink, or the tag in release mode.
function expected_labs {
  if [ -n "$release" ]; then
    local sha
    sha=$(labs rev-parse --verify -q "refs/tags/$release^{commit}") || die "tag $release is not in labs/ (git -C labs fetch --depth 1 origin tag $release)"
    [ "$(labs rev-parse HEAD)" = "$sha" ] || die "labs/ HEAD is not $release; check it out detached first"
    echo "$sha"
  else
    git ls-files -s -- labs | awk '{print $2}'
  fi
}

function require_clean {
  # The labs gitlink differs from HEAD whenever the patch series or a release tag is checked out.
  if ! { git diff --quiet --ignore-submodules=all && git diff --cached --quiet --ignore-submodules=all; }; then
    die "uncommitted changes in this repository; commit them first"
  fi
  [ -z "$(labs status --porcelain)" ] || die "labs/ has uncommitted changes"
}

# Replaces docs/ (index and worktree) with <tree>'s docs/, asserting nothing else moves.
function checkout_docs_tree {
  local tree=$1 outside
  outside=$(git diff --name-only HEAD "$tree" -- ':!docs')
  [ -z "$outside" ] || die "merge would change paths outside docs/:"$'\n'"$outside"
  git read-tree -m -u HEAD "$tree"
}

function cmd_import {
  local sha r tmp tree
  sha=$(resolve "$1")
  [ "$sha" = "$(expected_labs)" ] || die "$1 is not the labs gitlink; move it with labs-patches/bootstrap.sh bump first"
  require_clean
  r=$(rerooted_commit "$sha")
  tmp=$(mktemp -d)/index
  GIT_INDEX_FILE=$tmp git read-tree HEAD
  GIT_INDEX_FILE=$tmp git rm -r -q --cached --ignore-unmatch -- docs
  GIT_INDEX_FILE=$tmp git read-tree --prefix=docs/ "$r:docs"
  GIT_INDEX_FILE=$tmp git update-index --add --cacheinfo \
    "100644,$(printf '%s\n' "$sha" | git hash-object -w --stdin),$sync_file"
  tree=$(GIT_INDEX_FILE=$tmp git write-tree)
  rm -rf "$(dirname "$tmp")"
  if [ "$tree" = "$(git rev-parse 'HEAD^{tree}')" ]; then echo "docs/ already matches $sha"; return; fi
  if git cat-file -e "HEAD:$sync_file" 2>/dev/null; then
    die "$sync_file exists: docs/ was imported already and carries local work; use sync"
  fi
  checkout_docs_tree "$tree"
  echo "imported aztec-node docs at $sha; commit with: git commit -m 'docs: import rerooted docs from aztec-node@${sha:0:10}'"
}

function cmd_sync {
  local sha last base theirs out tree status=0 conflicts
  sha=$(resolve "$1")
  [ "$sha" = "$(expected_labs)" ] || die "$1 is not the labs gitlink; move it with labs-patches/bootstrap.sh bump first"
  require_clean
  last=$(git show "HEAD:$sync_file" 2>/dev/null) || die "no $sync_file; run import first"
  [ "$last" != "$sha" ] || { echo "docs/ already synced to $sha"; return; }
  base=$(rerooted_commit "$(resolve "$last")")
  theirs=$(rerooted_commit "$sha")
  out=$(git merge-tree --write-tree --name-only --merge-base="$base" HEAD "$theirs") || status=$?
  [ "$status" -le 1 ] || die "git merge-tree failed ($status)"
  tree=$(head -n1 <<<"$out")
  if [ "$status" = 1 ]; then
    conflicts=$(sed -n '2,/^$/p' <<<"$out" | sed '/^$/d' | sort -u)
    if [ "$conflicts" = docs/yarn.lock ]; then
      # A lockfile is regenerated, never hand-merged: take theirs, then yarn install re-resolves.
      local tmp
      tmp=$(mktemp -d)/index
      GIT_INDEX_FILE=$tmp git read-tree "$tree"
      GIT_INDEX_FILE=$tmp git update-index --cacheinfo "100644,$(git rev-parse "$theirs:docs/yarn.lock"),docs/yarn.lock"
      tree=$(GIT_INDEX_FILE=$tmp git write-tree)
      rm -rf "$(dirname "$tmp")"
      echo "docs/yarn.lock conflicted: took aztec-node's; run (cd docs && yarn install) before committing"
    else
      echo "conflicts; nothing was changed:" >&2
      while IFS= read -r line; do echo "  $line"; done <<<"$conflicts" >&2
      echo "make these files agree with aztec-node@${sha:0:10} where the edits overlap, commit, and rerun" >&2
      exit 1
    fi
  fi
  checkout_docs_tree "$tree"
  printf '%s\n' "$sha" > "$sync_file"
  git add -- "$sync_file"
  echo "synced docs/ to aztec-node@$sha; review and commit with: git commit -m 'docs: sync from aztec-node@${sha:0:10}'"
}

function cmd_check {
  local fail=0 expected recorded touched pin bb ignores
  reroot_dir "$root" --check >/dev/null || { echo "reroot would change:" >&2; reroot_dir "$root" --check | sed 's/^/  /' >&2; fail=1; }
  expected=$(expected_labs)
  recorded=$(cat "$sync_file" 2>/dev/null || true)
  if [ "$recorded" != "$expected" ]; then
    echo "$sync_file ($recorded) is not the labs commit ($expected): docs and snippet sources would drift" >&2
    echo "  fix: scripts/labs_docs_sync.sh sync $expected merges aztec-node's docs up to the new pin; commit the result" >&2
    fail=1
  fi
  # Snippets must render the upstream code their links name: diffing the working tree against the
  # recorded commit catches both the foundation's patch series and uncommitted edits.
  touched=$(comm -12 \
    <(labs diff --name-only "$expected" | sort -u) \
    <(git grep -h -o -E '#include_code[[:space:]]+[^[:space:]]+[[:space:]]+/?labs/[^[:space:]]+' -- "${source_dirs[@]}" |
        awk '{sub(/^\/?labs\//, "", $3); print $3}' | sort -u))
  [ -z "$touched" ] || {
    echo "labs/ changes snippet sources against ${expected:0:10}:"$'\n'"$touched" >&2
    echo "  fix: the docs quote these files as aztec-node has them at the pin; keep the change off them or update the quoting pages" >&2
    fail=1
  }
  pin=$(sed -n -E 's/^[[:space:]]*"@aztec-foundation\/l1-artifacts":[[:space:]]*"([^"]+)".*/\1/p' docs/package.json)
  bb=$(sed -n -E 's/^BB_VERSION=([^ #]+).*/\1/p' labs/labs-aztec-toolchain/bootstrap.sh)
  [ -n "$pin" ] && [ "$pin" = "$bb" ] || {
    echo "docs l1-artifacts ($pin) is not labs BB_VERSION ($bb)" >&2
    echo "  fix: the sync above usually moves it; otherwise set it to $bb in docs/package.json and run (cd docs && yarn install)" >&2
    fail=1
  }
  ignores=$(grep -E '^[[:space:]]*(build\.)?ignore[[:space:]]*=' docs/netlify.toml || true)
  if [ "$(grep -c . <<<"$ignores")" != 1 ] || ! grep -qE '^[[:space:]]*ignore[[:space:]]*=[[:space:]]*"exit 0"[[:space:]]*$' <<<"$ignores"; then
    echo "docs/netlify.toml must have exactly one ignore key, set to \"exit 0\":"$'\n'"$ignores" >&2
    fail=1
  fi
  [ "$fail" = 0 ] && echo "labs docs sync: ok (${expected:0:10})"
  return "$fail"
}

release=""
args=()
while [ $# -gt 0 ]; do
  case $1 in
    --release) release=${2:?--release needs a tag}; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
set -- ${args[@]+"${args[@]}"}
case ${1:-} in
  import) cmd_import "${2:?import needs a ref}" ;;
  sync) cmd_sync "${2:?sync needs a ref}" ;;
  reroot) shift; reroot_dir "$root" "$@" ;;
  check) cmd_check ;;
  *) sed -n '2,/^set -e/p' "$0" | sed '$d; s/^# \{0,1\}//' >&2; exit 1 ;;
esac
