#!/usr/bin/env bash
# Downloads the pinned Chonk IVC input flows into chonk-pinned-flows/ next to this script.
#
# chonk-inputs.hash pins an immutable tarball of captured client-flow inputs (one
# ivc-inputs.msgpack per flow) published to the protocol artifact bucket by the foundation
# repo's chonk input update flow. A marker file records which pin the extracted tree
# belongs to, so re-runs are no-ops until the pin changes.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

BASE_URL=${PINNED_CHONK_BASE_URL:-https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol}

hash=$(tr -d '[:space:]' <chonk-inputs.hash)
if ! [[ "$hash" =~ ^[a-f0-9]{16}$ ]]; then
  echo "ERROR: invalid pinned chonk inputs hash '$hash' in chonk-inputs.hash" >&2
  exit 1
fi

dest=chonk-pinned-flows
marker="$dest/.chonk-inputs.hash"
if [ -f "$marker" ] && [ "$(cat "$marker")" == "$hash" ]; then
  exit 0
fi

url="$BASE_URL/bb-chonk-inputs-$hash.tar.gz"
echo "Downloading pinned chonk inputs $hash from $url"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if ! curl -sSf "$url" -o "$tmp/inputs.tar.gz"; then
  echo "ERROR: failed to download pinned chonk inputs from $url" >&2
  echo "The pin in chonk-inputs.hash may be stale." >&2
  exit 1
fi
rm -rf "$dest"
mkdir -p "$dest"
tar -xzf "$tmp/inputs.tar.gz" -C "$dest"
printf '%s\n' "$hash" >"$marker"
