#!/usr/bin/env bash
# Shared helpers for the pinned Chonk IVC inputs.
#
# A single canonical S3 tarball drives every Chonk benchmark and the VK
# consistency check. The pinned short hash lives in `chonk-inputs.hash`
# (one-line file in this directory) so that bumping the pin only touches one
# small file and does not perturb any `.rebuild_patterns`-scoped CI logic.
#
# This file is sourced (not exec'd). Callers must already have ci3 sourced so
# that `cache_download` / `cache_upload` style helpers are available; falling
# back to plain `curl` / `aws s3` for environments where ci3 is not loaded.

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    echo "chonk_inputs_lib.sh is meant to be sourced, not executed." >&2
    exit 1
fi

CHONK_INPUTS_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHONK_INPUTS_HASH_FILE="$CHONK_INPUTS_LIB_DIR/chonk-inputs.hash"
CHONK_INPUTS_S3_PREFIX="s3://aztec-ci-artifacts/protocol"
CHONK_INPUTS_HTTP_PREFIX="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol"

# Print the pinned short hash from disk (no trailing whitespace).
function chonk_inputs_hash {
    local hash
    hash=$(<"$CHONK_INPUTS_HASH_FILE")
    hash="${hash//$'\n'/}"
    hash="${hash//$'\r'/}"
    hash="${hash// /}"
    if [[ -z "$hash" ]]; then
        echo "chonk_inputs_lib.sh: $CHONK_INPUTS_HASH_FILE is empty" >&2
        return 1
    fi
    printf '%s' "$hash"
}

# Print the full HTTPS URL for the pinned tarball.
function chonk_inputs_url {
    local hash
    hash=$(chonk_inputs_hash) || return $?
    printf '%s/bb-chonk-inputs-%s.tar.gz' "$CHONK_INPUTS_HTTP_PREFIX" "$hash"
}

# Print the S3 URI for the pinned tarball.
function chonk_inputs_s3_uri {
    local hash
    hash=$(chonk_inputs_hash) || return $?
    printf '%s/bb-chonk-inputs-%s.tar.gz' "$CHONK_INPUTS_S3_PREFIX" "$hash"
}

# Idempotent: download + extract the pinned tarball into <dest_dir>.
# If <dest_dir> already looks populated (contains at least one flow directory
# with an ivc-inputs.msgpack), this is a no-op so repeated calls are cheap.
function chonk_inputs_download {
    local dest_dir="${1:?chonk_inputs_download requires a destination directory}"
    local force="${2:-0}"

    if [[ "$force" != "1" ]] && \
       [[ -d "$dest_dir" ]] && \
       compgen -G "$dest_dir/*/ivc-inputs.msgpack" > /dev/null; then
        echo "Pinned chonk inputs already present in $dest_dir (skip download)."
        return 0
    fi

    local url
    url=$(chonk_inputs_url) || return $?

    mkdir -p "$dest_dir"
    local tarball
    tarball="$(mktemp -t chonk-inputs.XXXXXX.tar.gz)"
    trap 'rm -f "$tarball"' RETURN

    echo "Downloading pinned chonk inputs from $url ..."
    if ! curl -fSL --retry 3 --retry-delay 2 -o "$tarball" "$url"; then
        echo "chonk_inputs_download: failed to fetch $url" >&2
        return 1
    fi

    # Wipe existing inputs to avoid mixing stale flows with fresh ones.
    find "$dest_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    echo "Extracting pinned chonk inputs into $dest_dir ..."
    tar -xzf "$tarball" -C "$dest_dir"
    rm -f "$tarball"
    trap - RETURN
}

# Pack <src_dir> into a tarball, compute its short hash, upload to S3, and
# print the new short hash on stdout. The tarball file is left behind in
# the caller's CWD as `bb-chonk-inputs.tar.gz` so an operator can inspect or
# manually re-upload if needed.
function chonk_inputs_upload {
    local src_dir="${1:?chonk_inputs_upload requires a source directory}"
    local tarball="bb-chonk-inputs.tar.gz"

    echo "Compressing $src_dir into $tarball ..." >&2
    tar -czf "$tarball" -C "$src_dir" .

    local full_hash short_hash
    full_hash=$(sha256sum "$tarball" | awk '{print $1}')
    short_hash="${full_hash:0:8}"
    echo "New short hash: $short_hash" >&2

    local s3_uri="$CHONK_INPUTS_S3_PREFIX/bb-chonk-inputs-${short_hash}.tar.gz"
    echo "Uploading $tarball to $s3_uri ..." >&2
    aws s3 cp "$tarball" "$s3_uri" >&2

    printf '%s' "$short_hash"
}

# Overwrite the pin file with a new short hash. Validates that the new hash
# matches the expected `[a-f0-9]{8}` shape so a typo can't poison the pin.
function chonk_inputs_set_pin {
    local new_hash="${1:?chonk_inputs_set_pin requires a new short hash}"
    if [[ ! "$new_hash" =~ ^[a-f0-9]{8}$ ]]; then
        echo "chonk_inputs_set_pin: $new_hash is not a valid 8-char short hash" >&2
        return 1
    fi
    printf '%s\n' "$new_hash" > "$CHONK_INPUTS_HASH_FILE"
    echo "Updated $CHONK_INPUTS_HASH_FILE to $new_hash" >&2
}
