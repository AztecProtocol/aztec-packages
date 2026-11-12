#!/usr/bin/env bash
# Writes the commit a build is from to <build-dir>/commit.txt, which the site serves at /commit.txt:
# Netlify's COMMIT_REF (a preview's checkout is not always the pull request's head), else the HEAD of
# the checkout in the current directory. A diagnostic, so it never fails the build.
#
#   write_commit_id.sh <build-dir>
set -uo pipefail

out=${1:?usage: write_commit_id.sh <build-dir>}
sha='^[0-9a-f]{40}$'
commit=${COMMIT_REF:-}
if [ -n "$commit" ] && [[ ! $commit =~ $sha ]]; then
  # The value is not printed: it is unchecked input.
  echo "COMMIT_REF is not a commit id: commit.txt names the checkout's HEAD."
  commit=
fi
[ -n "$commit" ] || commit=$(git rev-parse --verify -q HEAD 2>/dev/null)
if [[ ! $commit =~ $sha ]]; then
  echo "No COMMIT_REF and no git checkout: no commit.txt."
  exit 0
fi
printf '%s\n' "$commit" >"$out/commit.txt" || echo "Could not write $out/commit.txt."
