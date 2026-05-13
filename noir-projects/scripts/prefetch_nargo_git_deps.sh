#!/usr/bin/env bash
# Pre-clone external nargo git dependencies referenced in Nargo.toml files under
# noir-projects/ with bounded retry. Works around transient DNS / network failures
# during nargo's on-demand clone (e.g. "Could not resolve host: github.com"),
# which on merge-queue-heavy shards halts the entire run via parallel --halt fail=1.
#
# Idempotent: skips deps already cached. Safe under concurrent invocation across
# parallel make targets via a per-dep flock.

set -euo pipefail

NARGO_HOME="${NARGO_HOME:-$HOME/nargo}"
ROOT="$(git rev-parse --show-toplevel)"

mapfile -t deps < <(
  find "$ROOT/noir-projects" -name Nargo.toml -print0 \
  | xargs -0 grep -hE 'git\s*=\s*"https://github\.com/[^"]+"' \
  | sed -nE 's/.*git\s*=\s*"https:\/\/github\.com\/([^"]+)".*tag\s*=\s*"([^"]+)".*/\1|\2/p;
             t end;
             s/.*tag\s*=\s*"([^"]+)".*git\s*=\s*"https:\/\/github\.com\/([^"]+)".*/\2|\1/p;
             :end' \
  | sort -u
)

clone_one() (
  set -euo pipefail
  local org_repo=$1
  local tag=$2
  local dest="$NARGO_HOME/github.com/$org_repo/$tag"
  if [ -f "$dest/Nargo.toml" ]; then
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  local lock="$NARGO_HOME/github.com/$org_repo/.$tag.lock"
  exec 9>"$lock"
  flock 9
  if [ -f "$dest/Nargo.toml" ]; then
    return 0
  fi
  rm -rf "$dest"
  local attempt
  for attempt in 1 2 3; do
    if git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$tag" "https://github.com/$org_repo" "$dest"; then
      return 0
    fi
    rm -rf "$dest"
    if [ "$attempt" -lt 3 ]; then
      sleep $((attempt * 2))
    fi
  done
  echo "ERROR: failed to clone https://github.com/$org_repo @ $tag after 3 attempts" >&2
  return 1
)

failed=0
for dep in "${deps[@]}"; do
  IFS='|' read -r org_repo tag <<< "$dep"
  if ! clone_one "$org_repo" "$tag"; then
    failed=1
  fi
done

exit $failed
